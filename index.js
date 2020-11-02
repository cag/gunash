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
  geth: () => new DockerEthNode({
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
  openethereum: () => new DockerEthNode({
    dockerImage: 'openethereum/openethereum',
    containerWebsocketPort: 8546,
    runParams: [
      '--config', 'dev-insecure',
      '--geth',
      '--jsonrpc-cors', 'all',
      '--ws-interface', 'all',
      '--ws-apis', 'all',
      '--ws-origins', 'all',
      '--ws-hosts', 'all',
    ],
  }),
  nethermind: () => new DockerEthNode({
    dockerImage: 'nethermind/nethermind',
    containerWebsocketPort: 8546,
    runParams: [
      '--config', 'spaceneth.cfg',
      '--Init.WebSocketsEnabled', 'true',
      '--JsonRpc.Host', '0.0.0.0',
      '--JsonRpc.WebSocketsPort', '8546',
    ],
  }),
  ganache: ({ noVMErrorsOnRPCResponse }) => new DockerEthNode({
    dockerImage: 'trufflesuite/ganache-cli',
    containerWebsocketPort: 8545,
    runParams: [
      '--deterministic',
      '--defaultBalanceEther', '1000000',
      ...(noVMErrorsOnRPCResponse ? ['--noVMErrorsOnRPCResponse'] : []),
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

  const newAccountKeys = [
    '4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d',
    '6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1',
    '6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c',
    '646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913',
    'add53f9a7e588d003326d1cbf9e4a43c061aadd9bc938c843a79e7b4fd2ad743',
    '395df67f0c2d2d9fe1ad08d1bc8b6627011959b79c53d7dd6a3536a33ab8a4fd',
    'e485d098507f54e7733a205420dfddbe58db035fa577fc294ebd14db90767a52',
    'a453611d9419d0e56f499079478fd72c37b251a94bfde4d19872c44cf65386e3',
    '829e924fdf021ba3dbbc4225edfece9aca04b929d6e75613329ca6f1d31c0bb4',
    'b0057716d5917badaf911b193b12b910811c1497b5bada8d7711f758981c3773',
  ];
  if (nodeType === 'openethereum') {
    await Promise.all(newAccountKeys.map(
      (key) => new Promise((resolve, reject) => web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          id: Math.floor((Math.random() * Number.MAX_SAFE_INTEGER)),
          method: 'parity_newAccountFromSecret',
          params: [`0x${key}`, ''],
        },
        (err, data) => {
          if (err) return reject(err);
          if (data && data.error) return reject(data.error);
          return resolve(data && data.result);
        },
      )),
    ));
  } else if (nodeType !== 'nethermind') {
    const prefixKeyWith0x = nodeType === 'ganache';
    await Promise.all(newAccountKeys.map((key) => web3.eth.personal.importRawKey(
      prefixKeyWith0x ? `0x${key}` : key,
      '',
    )));
  }

  const accounts = await web3.eth.getAccounts();
  const accountsLC = accounts.map((addr) => addr.toLowerCase());
  const requiredAccounts = [
    '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
    '0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d',
    '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
    '0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC',
    '0xd03ea8624C8C5987235048901fB614fDcA89b117',
    '0x3E5e9111Ae8eB78Fe1CC3bb8915d5D461F3Ef9A9',
    '0x28a8746e75304c0780E011BEd21C72cD78cd535E',
    '0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E',
    '0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e',
  ];
  requiredAccounts.forEach((requiredAccount) => {
    if (!accountsLC.includes(requiredAccount.toLowerCase())) {
      accounts.push(requiredAccount);
    }
  });

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
  const targetBalance = BigInt(web3.utils.toWei('10000'));

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
  const makeNode = supportedNodes[nodeType];
  if (makeNode == null) {
    throw new UnsupportedNodeError(nodeType);
  }

  const node = makeNode(config);

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
