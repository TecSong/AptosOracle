import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    composeContext,
    elizaLogger,
    ModelClass,
    generateObject,
    truncateToCompleteSentence,
    HandlerCallback,
} from "@elizaos/core";
import { TwitterApi } from "twitter-api-v2";
import { tweetTemplate } from "../templates";
import { isTweetContent, TweetSchema } from "../types";

export const DEFAULT_MAX_TWEET_LENGTH = 280;

async function composeTweet(
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State
): Promise<string> {
    try {
        const context = composeContext({
            state,
            template: tweetTemplate,
        });

        const tweetContentObject = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: TweetSchema as any, // Type assertion to fix linter error
            stop: ["\n"],
        });

        if (!isTweetContent(tweetContentObject.object)) {
            elizaLogger.error(
                "Invalid tweet content:",
                tweetContentObject.object
            );
            return;
        }

        let trimmedContent = tweetContentObject.object.text.trim();

        // Truncate the content to the maximum tweet length specified in the environment settings.
        const maxTweetLength = runtime.getSetting("MAX_TWEET_LENGTH");
        if (maxTweetLength) {
            trimmedContent = truncateToCompleteSentence(
                trimmedContent,
                Number(maxTweetLength)
            );
        }

        return trimmedContent;
    } catch (error) {
        elizaLogger.error("Error composing tweet:", error);
        throw error;
    }
}

async function sendTweet(twitterClient: TwitterApi, content: string): Promise<boolean> {
    try {
        // Post the tweet using the v2 API
        const result = await twitterClient.v2.tweet(content);
        elizaLogger.log("Tweet response:", result);

        // Check if the tweet was successfully posted
        if (!result?.data?.id) {
            elizaLogger.error("Failed to post tweet: No tweet result in response");
            return false;
        }
        
        return true;
    } catch (error) {
        elizaLogger.error(`Twitter API error: ${error.message}`);
        return false;
    }
}

async function postTweet(
    runtime: IAgentRuntime,
    content: string
): Promise<boolean> {
    try {
        // Try to find existing Twitter client in the runtime
        let twitterClient: TwitterApi = null;
        
        // Attempt to access Twitter client based on conventions
        // We need to use type assertion since the exact structure may vary
        const clientsWithTwitter = runtime.clients.filter(client => {
            return client && typeof client === 'object' && (
                // Check for possible properties that might contain the Twitter client
                (client as any).twitter instanceof TwitterApi ||
                (client as any).twitterClient instanceof TwitterApi ||
                (client as any).client instanceof TwitterApi
            );
        });
        
        if (clientsWithTwitter.length > 0) {
            // Extract the Twitter client from the first matching client
            const clientObj = clientsWithTwitter[0] as any;
            twitterClient = clientObj.twitter || clientObj.twitterClient || clientObj.client;
        }
        
        if (!twitterClient) {
            // Get Twitter API credentials from settings
            const apiKey = runtime.getSetting("TWITTER_API_KEY");
            const apiKeySecret = runtime.getSetting("TWITTER_API_KEY_SECRET");
            const accessToken = runtime.getSetting("TWITTER_ACCESS_TOKEN");
            const accessTokenSecret = runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET");

            if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
                elizaLogger.error(
                    "Twitter API credentials not configured in environment"
                );
                return false;
            }
            
            // Create new Twitter client
            twitterClient = new TwitterApi({
                appKey: apiKey,
                appSecret: apiKeySecret,
                accessToken: accessToken,
                accessSecret: accessTokenSecret,
            });
            
            // Verify credentials
            try {
                await twitterClient.v2.me();
                elizaLogger.log("Successfully authenticated with Twitter API");
            } catch (error) {
                elizaLogger.error("Failed to authenticate with Twitter API:", error);
                return false;
            }
        }

        // Send the tweet
        elizaLogger.log("Attempting to send tweet:", content);

        try {
            if (content.length > DEFAULT_MAX_TWEET_LENGTH) {
                // For long tweets, we'll need to use the v2 API to post a thread
                // or split the content into multiple tweets
                const chunks = splitIntoTweets(content, DEFAULT_MAX_TWEET_LENGTH);
                let lastTweetId: string = null;
                
                // Create a thread by posting tweets in reply to the previous one
                for (const chunk of chunks) {
                    const tweetOptions = lastTweetId ? 
                        { reply: { in_reply_to_tweet_id: lastTweetId } } : 
                        undefined;
                    
                    const result = await twitterClient.v2.tweet(chunk, tweetOptions);
                    if (!result?.data?.id) {
                        elizaLogger.error("Failed to post tweet chunk");
                        return false;
                    }
                    
                    lastTweetId = result.data.id;
                }
                
                return true;
            }
            
            return await sendTweet(twitterClient, content);
        } catch (error) {
            throw new Error(`Tweet failed: ${error}`);
        }
    } catch (error) {
        // Log the full error details
        elizaLogger.error("Error posting tweet:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause,
        });
        return false;
    }
}

// Helper function to split long content into tweet-sized chunks
function splitIntoTweets(content: string, maxLength: number): string[] {
    const tweets: string[] = [];
    let remainingContent = content;
    
    while (remainingContent.length > 0) {
        let chunk: string;
        
        if (remainingContent.length <= maxLength) {
            chunk = remainingContent;
            remainingContent = '';
        } else {
            // Find a good breaking point (end of sentence, end of word, etc.)
            let breakPoint = maxLength;
            
            // Try to find the end of a sentence within the limit
            const lastPeriod = remainingContent.lastIndexOf('.', maxLength);
            const lastQuestion = remainingContent.lastIndexOf('?', maxLength);
            const lastExclamation = remainingContent.lastIndexOf('!', maxLength);
            
            const sentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
            
            if (sentenceEnd > maxLength * 0.5) {
                // We found a sentence end within reasonable bounds
                breakPoint = sentenceEnd + 1;
            } else {
                // Try to find the end of a word
                const lastSpace = remainingContent.lastIndexOf(' ', maxLength);
                if (lastSpace > 0) {
                    breakPoint = lastSpace;
                }
            }
            
            chunk = remainingContent.substring(0, breakPoint).trim();
            remainingContent = remainingContent.substring(breakPoint).trim();
        }
        
        tweets.push(chunk);
    }
    
    return tweets;
}

export const postAction: Action = {
    name: "POST_TWEET",
    similes: ["TWEET", "POST", "SEND_TWEET"],
    description: "Post a tweet to Twitter",
    validate: async (
        runtime: IAgentRuntime,
// eslint-disable-next-line
        _message: Memory,
// eslint-disable-next-line
        _state?: State
    ) => {
        const apiKey = runtime.getSetting("TWITTER_API_KEY");
        const apiKeySecret = runtime.getSetting("TWITTER_API_KEY_SECRET");
        const accessToken = runtime.getSetting("TWITTER_ACCESS_TOKEN");
        const accessTokenSecret = runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET");
        
        const hasCredentials = !!apiKey && !!apiKeySecret && !!accessToken && !!accessTokenSecret;
        elizaLogger.log(`Has Twitter API credentials: ${hasCredentials}`);

        return hasCredentials;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            // Generate tweet content using context
            const tweetContent = await composeTweet(runtime, message, state);

            if (!tweetContent) {
                elizaLogger.error("No content generated for tweet");
                return false;
            }

            elizaLogger.log(`Generated tweet content: ${tweetContent}`);

            // Check for dry run mode - explicitly check for string "true"
            if (
                process.env.TWITTER_DRY_RUN &&
                process.env.TWITTER_DRY_RUN.toLowerCase() === "true"
            ) {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${tweetContent}`
                );
                return true;
            }

            return await postTweet(runtime, tweetContent);
        } catch (error) {
            elizaLogger.error("Error in post action:", error);
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "You should tweet that" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll share this update with my followers right away!",
                    action: "POST_TWEET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Post this tweet" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll post that as a tweet now.",
                    action: "POST_TWEET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Share that on Twitter" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll share this message on Twitter.",
                    action: "POST_TWEET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Post that on X" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll post this message on X right away.",
                    action: "POST_TWEET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "You should put that on X dot com" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll put this message up on X.com now.",
                    action: "POST_TWEET",
                },
            },
        ],
    ],
};
