import express from "express";
import type { Router } from 'express';
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";

import {
    type AgentRuntime,
    elizaLogger,
    getEnvVariable,
    type UUID,
    validateCharacterConfig,
    ServiceType,
    type Character,
} from "@elizaos/core";

// import type { TeeLogQuery, TeeLogService } from "@elizaos/plugin-tee-log";
// import { REST, Routes } from "discord.js";
import type { DirectClient } from ".";
import { validateUuid } from "@elizaos/core";

// 类型别名，用于与index.ts保持一致
type IAgentRuntime = AgentRuntime;

interface UUIDParams {
    agentId: UUID;
    roomId?: UUID;
}

function validateUUIDParams(
    params: { agentId: string; roomId?: string },
    res: express.Response
): UUIDParams | null {
    const agentId = validateUuid(params.agentId);
    if (!agentId) {
        res.status(400).json({
            error: "Invalid AgentId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        });
        return null;
    }

    if (params.roomId) {
        const roomId = validateUuid(params.roomId);
        if (!roomId) {
            res.status(400).json({
                error: "Invalid RoomId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            });
            return null;
        }
        return { agentId, roomId };
    }

    return { agentId };
}

// 定义Tweet接口
interface Tweet {
    id: string;
    text: string;
    full_text?: string;
    created_at: string;
    user: {
        name: string;
        screen_name: string;
        profile_image_url: string;
        verified?: boolean;
        verified_type?: string;
    };
    entities?: {
        urls?: Array<{
            url: string;
            expanded_url: string;
            display_url: string;
        }>;
        media?: Array<{
            media_url_https: string;
            type: string;
            video_info?: {
                variants: Array<{
                    url: string;
                    content_type: string;
                    bitrate?: number;
                }>;
            };
        }>;
        hashtags?: Array<{
            text: string;
        }>;
        user_mentions?: Array<{
            screen_name: string;
            name: string;
            id_str: string;
        }>;
    };
    quoted_tweet?: Tweet;
    retweet_count?: number;
    favorite_count?: number;
    possibly_sensitive?: boolean;
}

export function createApiRouter(
    agents: Map<string, AgentRuntime>,
    directClient: DirectClient
):Router {
    const router = express.Router();

    router.use(cors());
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(
        express.json({
            limit: getEnvVariable("EXPRESS_MAX_PAYLOAD") || "100kb",
        })
    );

    router.get("/", (req, res) => {
        res.send("Welcome, this is the REST API!");
    });

    router.get("/hello", (req, res) => {
        res.json({ message: "Hello World!" });
    });

    router.get("/agents", (req, res) => {
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
            clients: Object.keys(agent.clients),
        }));
        res.json({ agents: agentsList });
    });

    router.get('/storage', async (req, res) => {
        try {
            const uploadDir = path.join(process.cwd(), "data", "characters");
            const files = await fs.promises.readdir(uploadDir);
            res.json({ files });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get("/agents/:agentId", (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        const agent = agents.get(agentId);

        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }

        const character = agent?.character;
        if (character?.settings?.secrets) {
            delete character.settings.secrets;
        }

        res.json({
            id: agent.agentId,
            character: agent.character,
        });
    });

    router.delete("/agents/:agentId", async (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        const agent: IAgentRuntime = agents.get(agentId);

        if (agent) {
            agent.stop();
            directClient.unregisterAgent(agent);
            res.status(204).json({ success: true });
        } else {
            res.status(404).json({ error: "Agent not found" });
        }
    });

    router.post("/agents/:agentId/set", async (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        let agent: IAgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
            // if it has a different name, the agentId will change
        }

        // stores the json data before it is modified with added data
        const characterJson = { ...req.body };

        // load character from body
        const character = req.body;
        try {
            validateCharacterConfig(character);
        } catch (e) {
            elizaLogger.error(`Error parsing character: ${e}`);
            res.status(400).json({
                success: false,
                message: e.message,
            });
            return;
        }

        // start it up (and register it)
        try {
            agent = await directClient.startAgent(character);
            elizaLogger.log(`${character.name} started`);
        } catch (e) {
            elizaLogger.error(`Error starting agent: ${e}`);
            res.status(500).json({
                success: false,
                message: e.message,
            });
            return;
        }

        if (process.env.USE_CHARACTER_STORAGE === "true") {
            try {
                const filename = `${agent.agentId}.json`;
                const uploadDir = path.join(
                    process.cwd(),
                    "data",
                    "characters"
                );
                const filepath = path.join(uploadDir, filename);
                await fs.promises.mkdir(uploadDir, { recursive: true });
                await fs.promises.writeFile(
                    filepath,
                    JSON.stringify(
                        { ...characterJson, id: agent.agentId },
                        null,
                        2
                    )
                );
                elizaLogger.info(
                    `Character stored successfully at ${filepath}`
                );
            } catch (error) {
                elizaLogger.error(
                    `Failed to store character: ${error.message}`
                );
            }
        }

        res.json({
            id: character.id,
            character: character,
        });
    });

    // router.get("/agents/:agentId/channels", async (req, res) => {
    //     const { agentId } = validateUUIDParams(req.params, res) ?? {
    //         agentId: null,
    //     };
    //     if (!agentId) return;

    //     const runtime = agents.get(agentId);

    //     if (!runtime) {
    //         res.status(404).json({ error: "Runtime not found" });
    //         return;
    //     }

    //     const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
    //     const rest = new REST({ version: "10" }).setToken(API_TOKEN);

    //     try {
    //         const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

    //         res.json({
    //             id: runtime.agentId,
    //             guilds: guilds,
    //             serverCount: guilds.length,
    //         });
    //     } catch (error) {
    //         console.error("Error fetching guilds:", error);
    //         res.status(500).json({ error: "Failed to fetch guilds" });
    //     }
    // });

    router.get("/agents/:agentId/:roomId/memories", async (req, res) => {
        const { agentId, roomId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
            roomId: null,
        };
        if (!agentId || !roomId) return;

        let runtime = agents.get(agentId);

        // if runtime is null, look for runtime with the same name
        if (!runtime) {
            runtime = Array.from(agents.values()).find(
                (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
            );
        }

        if (!runtime) {
            res.status(404).send("Agent not found");
            return;
        }

        try {
            const memories = await runtime.messageManager.getMemories({
                roomId,
            });
            const response = {
                agentId,
                roomId,
                memories: memories.map((memory) => ({
                    id: memory.id,
                    userId: memory.userId,
                    agentId: memory.agentId,
                    createdAt: memory.createdAt,
                    content: {
                        text: memory.content.text,
                        action: memory.content.action,
                        source: memory.content.source,
                        url: memory.content.url,
                        inReplyTo: memory.content.inReplyTo,
                        attachments: memory.content.attachments?.map(
                            (attachment) => ({
                                id: attachment.id,
                                url: attachment.url,
                                title: attachment.title,
                                source: attachment.source,
                                description: attachment.description,
                                text: attachment.text,
                                contentType: attachment.contentType,
                            })
                        ),
                    },
                    embedding: memory.embedding,
                    roomId: memory.roomId,
                    unique: memory.unique,
                    similarity: memory.similarity,
                })),
            };

            res.json(response);
        } catch (error) {
            console.error("Error fetching memories:", error);
            res.status(500).json({ error: "Failed to fetch memories" });
        }
    });

    // router.get("/tee/agents", async (req, res) => {
    //     try {
    //         const allAgents = [];

    //         for (const agentRuntime of agents.values()) {
    //             const teeLogService = agentRuntime
    //                 .getService<TeeLogService>(ServiceType.TEE_LOG)
    //                 .getInstance();

    //             const agents = await teeLogService.getAllAgents();
    //             allAgents.push(...agents);
    //         }

    //         const runtime: IAgentRuntime = agents.values().next().value;
    //         const teeLogService = runtime
    //             .getService<TeeLogService>(ServiceType.TEE_LOG)
    //             .getInstance();
    //         const attestation = await teeLogService.generateAttestation(
    //             JSON.stringify(allAgents)
    //         );
    //         res.json({ agents: allAgents, attestation: attestation });
    //     } catch (error) {
    //         elizaLogger.error("Failed to get TEE agents:", error);
    //         res.status(500).json({
    //             error: "Failed to get TEE agents",
    //         });
    //     }
    // });

    // router.get("/tee/agents/:agentId", async (req, res) => {
    //     try {
    //         const agentId = req.params.agentId;
    //         const agentRuntime = agents.get(agentId);
    //         if (!agentRuntime) {
    //             res.status(404).json({ error: "Agent not found" });
    //             return;
    //         }

    //         const teeLogService = agentRuntime
    //             .getService<TeeLogService>(ServiceType.TEE_LOG)
    //             .getInstance();

    //         const teeAgent = await teeLogService.getAgent(agentId);
    //         const attestation = await teeLogService.generateAttestation(
    //             JSON.stringify(teeAgent)
    //         );
    //         res.json({ agent: teeAgent, attestation: attestation });
    //     } catch (error) {
    //         elizaLogger.error("Failed to get TEE agent:", error);
    //         res.status(500).json({
    //             error: "Failed to get TEE agent",
    //         });
    //     }
    // });

    // router.post(
    //     "/tee/logs",
    //     async (req: express.Request, res: express.Response) => {
    //         try {
    //             const query = req.body.query || {};
    //             const page = Number.parseInt(req.body.page) || 1;
    //             const pageSize = Number.parseInt(req.body.pageSize) || 10;

    //             const teeLogQuery: TeeLogQuery = {
    //                 agentId: query.agentId || "",
    //                 roomId: query.roomId || "",
    //                 userId: query.userId || "",
    //                 type: query.type || "",
    //                 containsContent: query.containsContent || "",
    //                 startTimestamp: query.startTimestamp || undefined,
    //                 endTimestamp: query.endTimestamp || undefined,
    //             };
    //             const agentRuntime: IAgentRuntime = agents.values().next().value;
    //             const teeLogService = agentRuntime
    //                 .getService<TeeLogService>(ServiceType.TEE_LOG)
    //                 .getInstance();
    //             const pageQuery = await teeLogService.getLogs(
    //                 teeLogQuery,
    //                 page,
    //                 pageSize
    //             );
    //             const attestation = await teeLogService.generateAttestation(
    //                 JSON.stringify(pageQuery)
    //             );
    //             res.json({
    //                 logs: pageQuery,
    //                 attestation: attestation,
    //             });
    //         } catch (error) {
    //             elizaLogger.error("Failed to get TEE logs:", error);
    //             res.status(500).json({
    //                 error: "Failed to get TEE logs",
    //             });
    //         }
    //     }
    // );

    router.post("/agent/start", async (req, res) => {
        const { characterPath, characterJson } = req.body;
        console.log("characterPath:", characterPath);
        console.log("characterJson:", characterJson);
        try {
            let character: Character;
            if (characterJson) {
                character = await directClient.jsonToCharacter(
                    characterPath,
                    characterJson
                );
            } else if (characterPath) {
                character =
                    await directClient.loadCharacterTryPath(characterPath);
            } else {
                throw new Error("No character path or JSON provided");
            }
            await directClient.startAgent(character);
            elizaLogger.log(`${character.name} started`);

            res.json({
                id: character.id,
                character: character,
            });
        } catch (e) {
            elizaLogger.error(`Error parsing character: ${e}`);
            res.status(400).json({
                error: e.message,
            });
            return;
        }
    });

    router.post("/agents/:agentId/stop", async (req, res) => {
        const agentId = req.params.agentId;
        console.log("agentId", agentId);
        const agent: IAgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
            // if it has a different name, the agentId will change
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Agent not found" });
        }
    });

    // 添加Twitter搜索API端点
    router.get("/api/twitter/search", async (req, res) => {
        try {
            const query = req.query.query as string;
            if (!query) {
                return res.status(400).json({ 
                    error: "Missing 'query' parameter",
                    tweets: [] 
                });
            }
            
            // 从环境变量获取Twitter API密钥
            const apiKey = process.env.TWITTER_API_KEY;
            if (!apiKey) {
                elizaLogger.error('Twitter API key is missing in server environment');
                return res.status(500).json({ 
                    error: 'Twitter API key is not configured on server',
                    tweets: []
                });
            }
            
            elizaLogger.info(`Server fetching Twitter timeline for query: "${query}"`);
            
            // 调用Twitter API
            const response = await fetch(
                `https://twitter241.p.rapidapi.com/search-v2?type=Top&count=10&query=${encodeURIComponent(query)}`,
                {
                    method: 'GET',
                    headers: {
                        'x-rapidapi-host': 'twitter241.p.rapidapi.com',
                        'x-rapidapi-key': apiKey
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Twitter API responded with status: ${response.status}`);
            }

            const data = await response.json();
            elizaLogger.info('Twitter API raw response received');
            
            // 检查API返回结构
            if (!data || !data.result) {
                elizaLogger.error('Invalid API response - missing result');
                return res.status(500).json({ 
                    error: 'Invalid response from Twitter API',
                    tweets: []
                });
            }
            
            // 处理API返回结构
            if (data.result?.timeline?.instructions) {
                const instructions = data.result.timeline.instructions;
                const tweets: Tweet[] = [];
                
                elizaLogger.info(`Found ${instructions.length} instructions in timeline data`);
                
                // 提取所有TimelineTimelineItem类型的条目
                for (const instruction of instructions) {
                    if (instruction.entries) {
                        elizaLogger.info(`Processing ${instruction.entries.length} entries`);
                        
                        for (const entry of instruction.entries) {
                            try {
                                // 如果是TimelineTimelineModule类型，可能包含人物推荐，我们跳过
                                if (entry.content?.__typename === 'TimelineTimelineModule') {
                                    continue;
                                }
                                
                                // 只处理推文条目，跳过其他类型
                                if (entry.content?.__typename === 'TimelineTimelineItem' && 
                                    entry.content.itemContent?.__typename === 'TimelineTweet') {
                                    
                                    const tweetResult = entry.content.itemContent.tweet_results?.result;
                                    if (tweetResult) {
                                        // 处理已删除或不可见的推文
                                        if (tweetResult.__typename === 'TweetUnavailable' || 
                                            tweetResult.__typename === 'TweetTombstone') {
                                            continue;
                                        }
                                        
                                        const legacy = tweetResult.legacy;
                                        const user = tweetResult.core?.user_results?.result?.legacy;
                                        
                                        if (!legacy || !user) {
                                            elizaLogger.warn('Missing legacy or user data in tweet', 
                                                tweetResult.rest_id || 'unknown id');
                                            continue;
                                        }
                                        
                                        const tweet: Tweet = {
                                            id: legacy.id_str || tweetResult.rest_id || `temp-${Date.now()}-${tweets.length}`,
                                            text: legacy.full_text || legacy.text || '',
                                            full_text: legacy.full_text,
                                            created_at: legacy.created_at || new Date().toISOString(),
                                            user: {
                                                name: user.name || 'Unknown User',
                                                screen_name: user.screen_name || 'unknown',
                                                profile_image_url: user.profile_image_url_https || '',
                                                verified: user.verified || false,
                                                verified_type: user.verified_type
                                            },
                                            entities: {
                                                urls: legacy.entities?.urls || [],
                                                hashtags: legacy.entities?.hashtags || [],
                                                user_mentions: legacy.entities?.user_mentions || []
                                            },
                                            retweet_count: legacy.retweet_count || 0,
                                            favorite_count: legacy.favorite_count || 0,
                                            possibly_sensitive: legacy.possibly_sensitive || false
                                        };
                                        
                                        // 处理媒体内容
                                        if (legacy.extended_entities?.media && Array.isArray(legacy.extended_entities.media)) {
                                            if (!tweet.entities) {
                                                tweet.entities = {
                                                    urls: [],
                                                    hashtags: [],
                                                    user_mentions: []
                                                };
                                            }
                                            tweet.entities.media = legacy.extended_entities.media.map((media: any) => ({
                                                media_url_https: media.media_url_https || '',
                                                type: media.type || 'photo',
                                                video_info: media.video_info
                                            }));
                                        }
                                        
                                        // 处理引用推文
                                        if (tweetResult.quoted_status_result?.result) {
                                            try {
                                                const quotedResult = tweetResult.quoted_status_result.result;
                                                
                                                // 跳过不可用的引用推文
                                                if (quotedResult.__typename === 'TweetUnavailable' || 
                                                    quotedResult.__typename === 'TweetTombstone') {
                                                    // 不设置引用推文
                                                } else {
                                                    const quotedLegacy = quotedResult.legacy;
                                                    const quotedUser = quotedResult.core?.user_results?.result?.legacy;
                                                    
                                                    if (quotedLegacy && quotedUser) {
                                                        const quotedTweet: Tweet = {
                                                            id: quotedLegacy.id_str || quotedResult.rest_id || `quoted-${Date.now()}`,
                                                            text: quotedLegacy.full_text || quotedLegacy.text || '',
                                                            full_text: quotedLegacy.full_text,
                                                            created_at: quotedLegacy.created_at || new Date().toISOString(),
                                                            user: {
                                                                name: quotedUser.name || 'Unknown User',
                                                                screen_name: quotedUser.screen_name || 'unknown',
                                                                profile_image_url: quotedUser.profile_image_url_https || '',
                                                                verified: quotedUser.verified || false
                                                            },
                                                            entities: quotedLegacy.entities
                                                        };
                                                        tweet.quoted_tweet = quotedTweet;
                                                    }
                                                }
                                            } catch (error) {
                                                elizaLogger.error('Error processing quoted tweet:', error);
                                                // 继续处理主推文，忽略引用推文错误
                                            }
                                        }
                                        
                                        tweets.push(tweet);
                                    }
                                }
                            } catch (error) {
                                elizaLogger.error('Error processing entry:', error);
                                // 继续处理下一个条目
                                continue;
                            }
                        }
                    }
                }
                
                elizaLogger.info(`Successfully processed ${tweets.length} tweets`);
                
                // 返回处理后的数据和游标信息
                return res.json({ 
                    tweets,
                    cursor: data.cursor
                });
            } else {
                elizaLogger.warn('No timeline instructions found in API response');
            }
            
            // 返回处理后的数据
            return res.json({ 
                tweets: [],
                error: 'No valid tweets found in the response'
            });
        } catch (error) {
            elizaLogger.error('Error fetching tweets:', error);
            return res.status(500).json({ 
                error: error instanceof Error ? error.message : 'Failed to fetch tweets from Twitter API',
                tweets: []
            });
        }
    });

    return router;
}
