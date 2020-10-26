# 𝔤𝔲𝔫𝔞𝔰𝔥

Like [Ganache](https://github.com/trufflesuite/ganache-cli), but sillier.

## 𝕚𝕟𝕤𝕥𝕣𝕦𝕔𝕔

You need <s>whale</s> [Docker](https://www.docker.com/).

Then, this is Ganache, except with less options, more requirements, and [*more bad*](https://github.com/trufflesuite/ganache-cli/issues/257#issuecomment-360053995):

```sh
# For NPM
npm install --save-dev gunash
npx gunash --node-type ganache
# For Yarn
yarn add --dev gunash
yarn gunash --node-type ganache
```

To stop this:

```sh
# For NPM
npx gunash stop
# For Yarn
yarn gunash stop
```

## ．．．ｈｅｌｐ

```sh
gunash help
```

## y

Make [Geth](https://geth.ethereum.org/), [OpenEthereum](https://github.com/openethereum/openethereum), or [Nethermind](https://nethermind.io/client) act like Ganache with `--node-type`.

## Greetz

(っ◔◡◔)っ ♥ [geth-dev-assistant](https://github.com/cgewecke/geth-dev-assistant) ♥
