#!/usr/bin/env node

const yargs = require('yargs/yargs');

const { supportedNodeTypes, start, stop } = require('./index');

const yargsObj = yargs(process.argv.slice(2));

yargsObj.command(['start', '*'], 'Starts a Gunash node', {
  'node-type': {
    demandOption: true,
    default: 'geth',
    describe: 'Type of Ethereum node to spin up',
    choices: supportedNodeTypes,
    type: 'string',
  },
  noVMErrorsOnRPCResponse: {
    describe: '(Ganache only) Suppress VM errors',
    type: 'boolean',
  },
}, start);

yargsObj.command('stop', 'Stops the running Gunash node', {}, stop);

yargsObj.version().help().parse();
