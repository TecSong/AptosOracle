import { AptosOracleEnvironment } from './types';

// 默认环境配置
export const defaultEnvironment: AptosOracleEnvironment = {
  apiEndpoint: 'https://fullnode.mainnet.aptoslabs.com/v1',
  networkId: 'mainnet'
};

// 获取环境配置
export function getEnvironment(): AptosOracleEnvironment {
  return {
    apiKey: process.env.APTOS_ORACLE_API_KEY,
    apiEndpoint: process.env.APTOS_ORACLE_API_ENDPOINT || defaultEnvironment.apiEndpoint,
    networkId: process.env.APTOS_ORACLE_NETWORK_ID || defaultEnvironment.networkId
  };
}
