import {
    Action,
    elizaLogger,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    parseJSONObjectFromText,
    State,
} from "@elizaos/core";
import { TokenDetails } from '../types';

// Define Token query input parameters interface
interface TokenQueryInput {
    tokenSymbol: string;
    includeMarketData: boolean;
    includeSocialData: boolean;
}

export const FETCH_TOKEN_DETAILS: Action = {
    name: 'FETCH_TOKEN_DETAILS',
    description: 'Fetch detailed information about a specific token on Aptos network',
    similes: [
        'TOKEN_DETAILS',
        'SHOW_TOKEN_DETAILS',
        'RETRIEVE_TOKEN_DATA',
        'TOKEN_INFORMATION',
        'TOKEN_DATA',
        'TOKEN_STATS',
        'TOKEN_OVERVIEW',
        'TOKEN_SUMMARY',
        'TOKEN_STATS',
        'TOKEN_SUMMARY',
        'TOKEN_PRICE',
        'TOKEN_MARKET_CAP',
        'TOKEN_VOLUME',
        'TOKEN_SUPPLY',
        'TOKEN_MARKET_DATA',
        'TOKEN_SOCIAL_DATA'
    ],
    
    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
      return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        params: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        elizaLogger.info("Fetching token details");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }
        
        const tokenQuery = await extractAndValidateTokenQuery(message.content.text, runtime);
        if (!tokenQuery) {
            return {
                type: 'text',
                content: 'Could not determine which token to fetch details for. Please specify a token symbol.'
            };
        }
        
        // Iterate through providers to find one with fetchTokenDetails capability
        let aptosProviderData = null;
        
        for (const provider of runtime.providers) {
            const providerData = await provider.get(runtime, message, state);
            if (providerData && typeof providerData.fetchTokenDetails === 'function') {
                aptosProviderData = providerData;
                break;
            }
        }
        
        if (!aptosProviderData) {
            elizaLogger.error('Aptos Oracle provider not initialized or missing fetchTokenDetails function');
            return {
                type: 'text',
                content: 'Sorry, the Aptos Oracle service is currently unavailable. Please try again later.'
            };
        }

        try {
            // Call the provider's method to get information
            const tokenDetails: TokenDetails = await aptosProviderData.fetchTokenDetails(
                tokenQuery.tokenSymbol,
                {
                    includeMarketData: tokenQuery.includeMarketData,
                    includeSocialData: tokenQuery.includeSocialData
                }
            );
            
            // Format token details response
            const formattedResponse = formatTokenDetailsResponse(tokenDetails);
            
            // Call callback function (if exists)
            if (callback) {
                await callback({
                    text: formattedResponse.content,
                    tokenDetails: tokenDetails
                });
            }
            
            return formattedResponse;
        } catch (error) {
            elizaLogger.error(`Error fetching token details: ${(error as Error).message}`);
            return {
                type: 'text',
                content: `Error fetching token details: ${(error as Error).message}`
            };
        }
    },
    
    examples: [
        [
            {
                user: 'user',
                content: {
                    text: 'Show me details about APT token'
                }
            }
        ],
        [
            {
                user: 'user',
                content: {
                    text: 'What is the current price of CAKE?'
                }
            }
        ],
        [
            {
                user: 'user',
                content: {
                    text: 'Get information about USDC on Aptos'
                }
            }
        ]
    ]
};

/**
 * Extract and validate Token query parameters from user message
 */
export async function extractAndValidateTokenQuery(
    text: string,
    runtime: IAgentRuntime
): Promise<TokenQueryInput | null> {
    elizaLogger.info("Extracting token query from text:", text);

    const prompt = `Extract token details from: "${text}". 
Return ONLY a JSON object with this EXACT structure:
{
  "tokenSymbol": "SYMBOL",
  "includeMarketData": boolean,
  "includeSocialData": boolean
}
No explanations. No markdown. No extra text.`;

    const content = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
    });

    try {
        // Use regex to extract JSON object
        const jsonString = content.match(/\{[\s\S]*?\}/)?.[0] || '{}';
        const configuration = parseJSONObjectFromText(jsonString);
        return validateTokenQueryInput(configuration);
    } catch (error) {
        elizaLogger.warn("Invalid token query configuration:", error);
        return null;
    }
}

/**
 * Validate Token query input parameters
 */
function validateTokenQueryInput(obj: Record<string, any>): TokenQueryInput | null {
    if (!obj.tokenSymbol) {
        elizaLogger.warn("Token symbol is required but was not provided");
        return null;
    }
    
    return {
        tokenSymbol: String(obj.tokenSymbol),
        includeMarketData: obj.includeMarketData !== false, // Default to true
        includeSocialData: Boolean(obj.includeSocialData)
    };
}

/**
 * Format Token details response
 */
function formatTokenDetailsResponse(tokenDetails: TokenDetails) {
    // If error message exists, return it directly
    if (tokenDetails.error) {
        return {
            type: 'text',
            content: tokenDetails.error
        };
    }

    let content = `
Token Information for ${tokenDetails.name} (${tokenDetails.symbol}):
- Decimals: ${tokenDetails.decimals}
${tokenDetails.price !== undefined ? `- Current Price: $${tokenDetails.price.toFixed(4)}` : ''}
${tokenDetails.priceChangePercentage24h !== undefined ? `- Price Change (24h): ${tokenDetails.priceChangePercentage24h > 0 ? '+' : ''}${tokenDetails.priceChangePercentage24h.toFixed(2)}%` : ''}
${tokenDetails.marketCap !== undefined ? `- Market Cap: $${tokenDetails.marketCap.toLocaleString()}` : ''}
${tokenDetails.volume24h !== undefined ? `- 24h Volume: $${tokenDetails.volume24h.toLocaleString()}` : ''}
${tokenDetails.totalSupply ? `- Total Supply: ${tokenDetails.totalSupply}` : ''}
    `.trim();

    return {
        type: 'text',
        content
    };
} 