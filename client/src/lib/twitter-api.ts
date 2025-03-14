import { BASE_URL } from './api';

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
    console.log(`Fetching Twitter timeline for query: "${query}"`);
    
    // 调用后端API而不是直接调用Twitter API
    const response = await fetch(
      `${BASE_URL}/api/twitter/search?query=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Twitter API responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Twitter API response:', data);
    
    // 检查API返回结构
    if (!data) {
      console.error('Invalid API response - empty response:', data);
      return { 
        error: 'Invalid response from API',
        tweets: []
      };
    }
    
    // 直接返回后端处理好的数据
    return { 
      tweets: data.tweets || [],
      error: data.error,
      cursor: data.cursor
    };
  } catch (error) {
    console.error('Error fetching tweets:', error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to fetch tweets from API',
      tweets: []
    };
  }
} 