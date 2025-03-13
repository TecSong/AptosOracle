import { AptosOracleEnvironment } from './types';

// Default environment configuration
export const defaultEnvironment: AptosOracleEnvironment = {
  apiEndpoint: 'https://fullnode.mainnet.aptoslabs.com/v1',
  networkId: 'mainnet'
};

// Get environment configuration
export function getEnvironment(): AptosOracleEnvironment {
  return {
    apiKey: process.env.APTOS_ORACLE_API_KEY,
    apiEndpoint: process.env.APTOS_ORACLE_API_ENDPOINT || defaultEnvironment.apiEndpoint,
    networkId: process.env.APTOS_ORACLE_NETWORK_ID || defaultEnvironment.networkId
  };
}
