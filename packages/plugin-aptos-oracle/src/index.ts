import { Plugin } from '@elizaos/core';
import { FETCH_TOKEN_DETAILS } from './actions/fetchTokenDetails';
import { SWAP_TOKEN } from './actions/swapToken';
import { TokenProvider } from './providers/tokenProvider';

// Create Aptos Oracle plugin
const plugin: Plugin = {
  name: 'plugin-aptos-oracle',
  npmName: '@elizaos/plugin-aptos-oracle',
  description: 'Aptos Oracle plugin for Eliza OS',
  
  // Register plugin actions
  actions: [
    FETCH_TOKEN_DETAILS,
    SWAP_TOKEN
  ],
  providers: [
    TokenProvider
  ],  
  
  // Can add other optional properties like providers, evaluators, services, clients, adapters, etc.
};

export default plugin;
