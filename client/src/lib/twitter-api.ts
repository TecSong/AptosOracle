/**
 * Twitter API 适配器
 * 用于处理 Twitter API 请求
 */

// Twitter API 响应类型
export interface TwitterApiResponse {
  tweets?: Tweet[];
  error?: string;
  cursor?: {
    bottom: string;
    top: string;
  };
}

// 推文接口
export interface Tweet {
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

/**
 * 获取 Twitter 时间线
 * @param query 搜索关键词
 * @returns 推文列表
 */
export async function fetchTwitterTimeline(query: string): Promise<TwitterApiResponse> {
  try {
    // 检查 API 密钥是否存在
    const apiKey = import.meta.env.VITE_TWITTER_API_KEY;
    if (!apiKey) {
      console.error('Twitter API key is missing');
      return { 
        error: 'Twitter API key is not configured',
        tweets: []
      };
    }
    
    console.log(`Fetching Twitter timeline for query: "${query}"`);
    
    // 调用 Twitter API
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
    console.log('Twitter API raw response:', JSON.stringify(data).substring(0, 500) + '...');
    
    // 检查API返回结构
    if (!data || !data.result) {
      console.error('Invalid API response - missing result:', data);
      return { 
        error: 'Invalid response from Twitter API',
        tweets: []
      };
    }
    
    // 处理新的API返回结构
    if (data.result?.timeline?.instructions) {
      const instructions = data.result.timeline.instructions;
      const tweets: Tweet[] = [];
      
      console.log(`Found ${instructions.length} instructions in timeline data`);
      
      // 提取所有TimelineTimelineItem类型的条目
      for (const instruction of instructions) {
        if (instruction.entries) {
          console.log(`Processing ${instruction.entries.length} entries`);
          
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
                    console.warn('Missing legacy or user data in tweet', 
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
                    tweet.entities = tweet.entities || {};
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
                          tweet.quoted_tweet = {
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
                        }
                      }
                    } catch (error) {
                      console.error('Error processing quoted tweet:', error);
                      // 继续处理主推文，忽略引用推文错误
                    }
                  }
                  
                  tweets.push(tweet);
                }
              }
            } catch (error) {
              console.error('Error processing entry:', error, entry);
              // 继续处理下一个条目
              continue;
            }
          }
        }
      }
      
      console.log(`Successfully processed ${tweets.length} tweets`);
      
      // 返回处理后的数据和游标信息
      return { 
        tweets,
        cursor: data.cursor
      };
    } else {
      console.warn('No timeline instructions found in API response');
    }
    
    // 返回处理后的数据
    return { 
      tweets: [],
      error: 'No valid tweets found in the response'
    };
  } catch (error) {
    console.error('Error fetching tweets:', error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to fetch tweets from Twitter API',
      tweets: []
    };
  }
} 