import { Action } from '@elizaos/core';
import { TransferTokenParams } from '../types';

export const TRANSFER_TOKEN: Action = {
  name: 'TRANSFER_TOKEN',
  description: 'Transfer tokens from user wallet to another address on Aptos network',
  similes: [
    'Send tokens',
    'Transfer cryptocurrency',
    'Send funds'
  ],
  examples: [
    [
      {
        user: 'user',
        content: {
          text: 'Transfer 10 APT to 0x123...'
        }
      }
    ],
    [
      {
        user: 'user',
        content: {
          text: 'Send 5 CAKE to my friend'
        }
      }
    ],
    [
      {
        user: 'user',
        content: {
          text: 'Transfer USDC to this address'
        }
      }
    ]
  ],
  handler: async (runtime, message, state) => {
    const params = message.content as any;
    const { tokenSymbol, amount, recipientAddress } = params;
    
    // 遍历 providers 查找具有 transferToken 功能的 provider
    let aptosProviderData = null;
    
    for (const provider of runtime.providers) {
      const providerData = await provider.get(runtime, message, state);
      if (providerData && typeof providerData.transferToken === 'function') {
        aptosProviderData = providerData;
        break;
      }
    }
    
    if (!aptosProviderData) {
      throw new Error('Aptos Oracle provider not initialized or missing transferToken function');
    }

    try {
      const transferParams: TransferTokenParams = {
        tokenSymbol,
        amount,
        recipientAddress
      };
      
      const txHash = await aptosProviderData.transferToken(transferParams);
      
      return {
        type: 'text',
        content: `
Transaction successful!
- Token: ${tokenSymbol}
- Amount: ${amount}
- Recipient: ${recipientAddress}
- Transaction Hash: ${txHash}

You can view the transaction details on the Aptos Explorer.
        `.trim()
      };
    } catch (error) {
      return {
        type: 'text',
        content: `Error transferring tokens: ${(error as Error).message}`
      };
    }
  },
  validate: async (runtime, message) => {
    const params = message.content as any;
    return !!(params.tokenSymbol && params.amount && params.recipientAddress);
  }
}; 