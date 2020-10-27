/* eslint-disable max-classes-per-file */
const { spawn } = require('child_process');
const Web3 = require('web3');

function childProcessDone(processName, childProcess) {
  return new Promise((resolve, reject) => {
    childProcess.on('error', reject);
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${processName} exited with code ${code}`));
      }
    });
  });
}

function toTxHashPromise(promiEvent) {
  return new Promise((resolve, reject) => promiEvent.once('transactionHash', resolve).catch(reject));
}

class DockerEthNode {
  constructor({ dockerImage, containerWebsocketPort, runParams }) {
    this.dockerImage = dockerImage;
    this.containerWebsocketPort = containerWebsocketPort;
    this.runParams = runParams;
  }

  pullImage() {
    const dockerPull = spawn('docker', ['pull', this.dockerImage], { stdio: 'inherit' });
    return childProcessDone('docker pull', dockerPull);
  }

  run() {
    const dockerRun = spawn('docker', [
      'run',
      '--detach',
      '--rm',
      '--name', 'gunash',
      '--publish', '8545:8545',
      '--publish', `8546:${this.containerWebsocketPort}`,
      this.dockerImage,
      ...this.runParams,
    ], { stdio: 'inherit' });

    return childProcessDone('docker run', dockerRun);
  }
}

const supportedNodes = {
  geth: new DockerEthNode({
    dockerImage: 'ethereum/client-go',
    containerWebsocketPort: 8546,
    runParams: [
      '--dev',
      '--allow-insecure-unlock',
      '--http',
      '--http.addr', '0.0.0.0',
      '--http.api', 'admin,debug,web3,eth,txpool,personal,clique,miner,net',
      '--http.corsdomain', '*',
      '--http.vhosts', '*',
      '--ws',
      '--ws.addr', '0.0.0.0',
      '--ws.api', 'admin,debug,web3,eth,txpool,personal,clique,miner,net',
      '--ws.origins', '*',
      '--vmdebug',
    ],
  }),
  openethereum: new DockerEthNode({
    dockerImage: 'openethereum/openethereum',
    containerWebsocketPort: 8546,
    runParams: [
      '--config', 'dev-insecure',
      '--geth',
      '--ws-interface', 'all',
      '--ws-apis', 'all',
      '--ws-origins', 'all',
      '--ws-hosts', 'all',
    ],
  }),
  nethermind: new DockerEthNode({
    dockerImage: 'nethermind/nethermind',
    containerWebsocketPort: 8546,
    runParams: [
      '--config', 'spaceneth.cfg',
      '--Init.WebSocketsEnabled', 'true',
      '--JsonRpc.Host', '0.0.0.0',
      '--JsonRpc.WebSocketsPort', '8546',
    ],
  }),
  ganache: new DockerEthNode({
    dockerImage: 'trufflesuite/ganache-cli',
    containerWebsocketPort: 8545,
    runParams: [
      '--defaultBalanceEther', '1000000',
    ],
  }),
};

class UnsupportedNodeError extends Error {
  constructor(nodeType) {
    super(`unsupported node type ${nodeType}: should specify ${
      Object.keys(supportedNodes).join(', ')
    }`);
    this.name = 'UnsupportedNodeError';
    this.nodeType = nodeType;
  }
}

async function setupNode({ nodeType }) {
  let web3;
  let ws;
  let unconfirmed = true;
  while (unconfirmed) {
    try {
      web3 = new Web3('ws://localhost:8546');
      ws = web3.currentProvider.connection;

      // eslint-disable-next-line no-await-in-loop,no-loop-func
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });

      unconfirmed = false;
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const accounts = await web3.eth.getAccounts();
  const targetNumAccounts = 10;
  if (accounts.length < targetNumAccounts) {
    const numNewAccounts = targetNumAccounts - accounts.length;
    accounts.push(...(
      await Promise.all(Array.from(
        { length: numNewAccounts },
        () => web3.eth.personal.newAccount(''),
      ))));
  }

  if (nodeType !== 'nethermind') {
    const unlockTimeout = nodeType === 'openethereum' ? '0x0' : 0;
    await Promise.all(accounts.map((account) => web3.eth.personal.unlockAccount(account, '', unlockTimeout)));
  }

  const accountBalances = (await Promise.all(accounts.map(
    (account) => web3.eth.getBalance(account),
  ))).map(BigInt);
  const targetBalance = BigInt(web3.utils.toWei('1000000'));

  const [coinbase, ...otherAccounts] = accounts.map(
    (address, i) => ({ address, balance: accountBalances[i] }),
  );

  await Promise.all(otherAccounts
    .filter(({ balance }) => balance < targetBalance)
    .map(({ address, balance }) => toTxHashPromise(web3.eth.sendTransaction({
      from: coinbase.address,
      to: address,
      value: (targetBalance - balance).toString(),
    }))));

  ws.close(1000);
}

async function start(config = {}) {
  const { nodeType } = config;
  const node = supportedNodes[nodeType];
  if (node == null) {
    throw new UnsupportedNodeError(nodeType);
  }

  await node.pullImage();
  await node.run();
  await setupNode(config);
}

function stop() {
  const dockerStop = spawn('docker', ['stop', 'gunash'], { stdio: 'inherit' });
  return childProcessDone('docker stop gunash', dockerStop);
}

module.exports = {
  start,
  stop,
  supportedNodeTypes: Object.keys(supportedNodes),
};
