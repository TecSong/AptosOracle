import { Action, IAgentRuntime, Memory, State } from '@elizaos/core';
import { SwapTokenParams } from '../types';

export const SWAP_TOKEN: Action = {
  name: 'SWAP_TOKEN',
  description: 'Swap one token for another on Aptos network',
  similes: [
    'SWAP_TOKEN',
    'SWAP_CRYPTO',
    'SWAP_TOKENS',
    'SWAP_CURRENCY',
    'SWAP_TRADE',
    'SWAP_EXCHANGE',
    'SWAP_CONVERT',
  ],
  examples: [
    [
      {
        user: 'user',
        content: {
          text: 'Swap 10 APT to USDC'
        }
      }
    ],
    [
      {
        user: 'user',
        content: {
          text: 'Exchange 5 CAKE for APT'
        }
      }
    ],
    [
      {
        user: 'user',
        content: {
          text: 'Convert my APT to USDC'
        }
      }
    ]
  ],
  handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const params = message.content as any;
    const { fromToken, toToken, amount, slippage = '0.5' } = params;
    
    // Iterate through providers to find one with swapToken capability
    let aptosProviderData = null;
    
    for (const provider of runtime.providers) {
      const providerData = await provider.get(runtime, message, state);
      if (providerData && typeof providerData.swapToken === 'function') {
        aptosProviderData = providerData;
        break;
      }
    }
    
    if (!aptosProviderData) {
      throw new Error('Aptos Oracle provider not initialized or missing swapToken function');
    }

    try {
      const swapParams: SwapTokenParams = {
        fromToken,
        toToken,
        amount,
        slippage
      };
      
      const txHash = await aptosProviderData.swapToken(swapParams);
      
      return {
        type: 'text',
        content: `
Swap transaction successful!
- From: ${amount} ${fromToken}
- To: ${toToken}
- Slippage: ${slippage}%
- Transaction Hash: ${txHash}

You can view the transaction details on the Aptos Explorer.
        `.trim()
      };
    } catch (error) {
      return {
        type: 'text',
        content: `Error swapping tokens: ${(error as Error).message}`
      };
    }
  },
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  }
}; 