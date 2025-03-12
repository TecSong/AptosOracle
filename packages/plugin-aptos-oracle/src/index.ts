import { Plugin } from '@elizaos/core';
import { FETCH_TOKEN_DETAILS } from './actions/fetchTokenDetails';
import { SWAP_TOKEN } from './actions/swapToken';
import { TokenProvider } from './providers/tokenProvider';

// 创建 Aptos Oracle 插件
const plugin: Plugin = {
  name: 'plugin-aptos-oracle',
  npmName: '@elizaos/plugin-aptos-oracle',
  description: 'Aptos Oracle plugin for Eliza OS',
  
  // 注册插件的 actions
  actions: [
    FETCH_TOKEN_DETAILS,
    SWAP_TOKEN
  ],
  providers: [
    TokenProvider
  ],  
  
  // 可以添加其他可选属性，如 providers, evaluators, services, clients, adapters 等
};

export default plugin;
