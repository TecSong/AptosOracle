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
import { SentimentAnalysisResult } from '../types';

// Define Tweet sentiment analysis input parameters interface
interface TweetSentimentInput {
    tweetContent: string;
    tokenSymbol: string;
}

export const ANALYZE_TWEET_SENTIMENT: Action = {
    name: 'ANALYZE_TWEET_SENTIMENT',
    description: 'Analyze if a tweet about a specific token is bullish (positive) or bearish (negative) and provide a sentiment score',
    similes: [
        'TWEET_SENTIMENT',
        'ANALYZE_TWEET',
        'SENTIMENT_ANALYSIS',
        'TOKEN_SENTIMENT',
        'BULLISH_BEARISH_ANALYSIS',
        'CRYPTO_TWEET_ANALYSIS',
        'MARKET_SENTIMENT',
        'TOKEN_MOOD',
        'CRYPTO_MOOD',
        'PRICE_SENTIMENT'
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
        elizaLogger.info("Analyzing tweet sentiment");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }
        
        // Extract tweet content and token from message
        const tweetInput = await extractAndValidateTweetInput(message.content.text, runtime);
        if (!tweetInput) {
            return {
                type: 'text',
                content: 'Could not determine the tweet content or which token to analyze. Please provide a tweet and specify a token symbol.'
            };
        }
        
        try {
            // Use the model to analyze sentiment
            const sentimentResult = await analyzeSentiment(tweetInput, runtime);
            
            // Format sentiment analysis response
            const formattedResponse = formatSentimentResponse(sentimentResult);
            
            // Call callback function (if exists)
            if (callback) {
                await callback({
                    text: formattedResponse.content,
                    sentimentResult: sentimentResult
                });
            }
            
            return formattedResponse;
        } catch (error) {
            elizaLogger.error(`Error analyzing tweet sentiment: ${(error as Error).message}`);
            return {
                type: 'text',
                content: `Error analyzing tweet sentiment: ${(error as Error).message}`
            };
        }
    },
    
    examples: [
        [
            {
                user: 'user',
                content: {
                    text: 'What\'s the sentiment of this tweet: "APT is looking strong, breaking key resistance levels and showing solid volume. This could be the start of a major run."'
                }
            }
        ],
        [
            {
                user: 'user',
                content: {
                    text: 'Is this tweet bullish or bearish for CAKE: "CAKE price action is concerning, dropping below major support with increasing selling pressure"'
                }
            }
        ],
        [
            {
                user: 'user',
                content: {
                    text: 'Analyze the sentiment of this tweet about SOL: "SOL network congestion issues may affect short-term price but long-term fundamentals remain intact"'
                }
            }
        ]
    ]
};

/**
 * Extract and validate Tweet analysis input parameters from user message
 */
async function extractAndValidateTweetInput(
    text: string,
    runtime: IAgentRuntime
): Promise<TweetSentimentInput | null> {
    elizaLogger.info("Extracting tweet content and token from text:", text);

    const prompt = `Extract the tweet content and token symbol to analyze from: "${text}". 
Return ONLY a JSON object with this EXACT structure:
{
  "tweetContent": "The full tweet content to analyze",
  "tokenSymbol": "SYMBOL"
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
        return validateTweetInput(configuration);
    } catch (error) {
        elizaLogger.warn("Invalid tweet analysis input:", error);
        return null;
    }
}

/**
 * Validate Tweet analysis input parameters
 */
function validateTweetInput(obj: Record<string, any>): TweetSentimentInput | null {
    if (!obj.tweetContent || !obj.tokenSymbol) {
        elizaLogger.warn("Tweet content and token symbol are required but were not provided");
        return null;
    }
    
    return {
        tweetContent: String(obj.tweetContent),
        tokenSymbol: String(obj.tokenSymbol),
    };
}

/**
 * Analyze sentiment of tweet using a large language model
 */
async function analyzeSentiment(
    input: TweetSentimentInput,
    runtime: IAgentRuntime
): Promise<SentimentAnalysisResult> {
    const prompt = `Analyze the sentiment of this tweet about ${input.tokenSymbol} cryptocurrency:
"${input.tweetContent}"

Determine if the sentiment is bullish (positive), bearish (negative), or neutral.
Assign a sentiment score from -10 (extremely bearish) to 10 (extremely bullish), where 0 is neutral.
Provide reasoning for your analysis.

Return ONLY a JSON object with this EXACT structure:
{
  "tokenSymbol": "${input.tokenSymbol}",
  "sentiment": "bullish|bearish|neutral",
  "score": number,
  "reasoning": "brief explanation of your analysis"
}
No explanations. No markdown. No extra text.`;

    const content = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.LARGE, // Using large model for better sentiment analysis
    });

    try {
        // Use regex to extract JSON object
        const jsonString = content.match(/\{[\s\S]*?\}/)?.[0] || '{}';
        const result = parseJSONObjectFromText(jsonString);
        
        // Validate and normalize result
        const validatedResult: SentimentAnalysisResult = {
            tokenSymbol: String(result.tokenSymbol || input.tokenSymbol),
            sentiment: (result.sentiment === 'bullish' || result.sentiment === 'bearish' || result.sentiment === 'neutral') 
                ? result.sentiment 
                : 'neutral',
            score: result.score !== undefined ? 
                Math.max(-10, Math.min(10, Number(result.score))) : // Ensure conversion to number and clamp between -10 and 10
                0,
            reasoning: String(result.reasoning || 'No reasoning provided')
        };
        
        elizaLogger.info("Analyzing sentiment result:", validatedResult);
        return validatedResult;
    } catch (error) {
        elizaLogger.error("Error parsing sentiment analysis result:", error);
        throw new Error("Failed to analyze tweet sentiment");
    }
}

/**
 * Format sentiment analysis response
 */
function formatSentimentResponse(result: SentimentAnalysisResult) {
    // Create emoji based on sentiment score
    let sentimentEmoji = '😐';
    if (result.score > 7) sentimentEmoji = '🚀';
    else if (result.score > 3) sentimentEmoji = '📈';
    else if (result.score > 0) sentimentEmoji = '😊';
    else if (result.score > -3) sentimentEmoji = '😕';
    else if (result.score > -7) sentimentEmoji = '📉';
    else sentimentEmoji = '🚨';
    
    // Determine sentiment description
    let sentimentDescription;
    if (result.score > 7) sentimentDescription = 'extremely bullish';
    else if (result.score > 3) sentimentDescription = 'strongly bullish';
    else if (result.score > 0) sentimentDescription = 'slightly bullish';
    else if (result.score === 0) sentimentDescription = 'neutral';
    else if (result.score > -3) sentimentDescription = 'slightly bearish';
    else if (result.score > -7) sentimentDescription = 'strongly bearish';
    else sentimentDescription = 'extremely bearish';

    const content = `
Sentiment Analysis for ${result.tokenSymbol} ${sentimentEmoji}

Overall sentiment: ${sentimentDescription.toUpperCase()}
Score: ${result.score} / 10 ${result.score >= 0 ? '(Bullish)' : '(Bearish)'}

Reasoning: ${result.reasoning}
`.trim();

    return {
        type: 'text',
        content
    };
} 