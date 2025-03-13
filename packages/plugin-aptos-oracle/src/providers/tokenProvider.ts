import { TokenDetails, SocialTrendAnalysis } from '../types';
import { IAgentRuntime, ICacheManager, Memory, Provider, State, elizaLogger } from '@elizaos/core';
import { getEnvironment } from '../environment';
import NodeCache from 'node-cache';
import path from 'path';
import https from 'https';

// Mock social media trend data
const mockSocialTrends: Record<string, SocialTrendAnalysis> = {
  APT: {
    sentiment: 'positive',
    sentimentScore: 0.75,
    trendingKeywords: ['upgrade', 'staking', 'defi'],
    recentMentions: 12500,
    changePercent24h: 15
  },
  CAKE: {
    sentiment: 'neutral',
    sentimentScore: 0.5,
    trendingKeywords: ['yield', 'farming', 'swap'],
    recentMentions: 5000,
    changePercent24h: 2
  },
  USDC: {
    sentiment: 'neutral',
    sentimentScore: 0.6,
    trendingKeywords: ['stablecoin', 'peg', 'regulation'],
    recentMentions: 8000,
    changePercent24h: 0
  }
};

/**
 * Retry function for retrying operations on failure
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> {
  let lastError: Error;
  let waitTime = delay;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      elizaLogger.warn(`Operation failed (attempt ${attempt + 1}/${retries}): ${lastError.message}`);
      
      if (attempt < retries - 1) {
        elizaLogger.info(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        waitTime *= backoff; // Exponential backoff
      }
    }
  }

  throw lastError!;
}

class TokenDetailsService {
  private cache: NodeCache;
  private cacheKey = "aptos/tokens";
  private cacheManager: ICacheManager;
  private apiKey: string;
  private agent: https.Agent;

  constructor(cacheManager: ICacheManager) {
    this.cacheManager = cacheManager;
    this.cache = new NodeCache({ stdTTL: 300 }); // 5-minute cache
    
    // Get API key from environment variables or configuration
    this.apiKey = process.env.COINGECKO_API_KEY || 'DEMO_KEY';
    
    // Create an HTTPS agent for keeping connections alive
    this.agent = new https.Agent({
      keepAlive: true,
      timeout: 5000,
      rejectUnauthorized: false
    });
  }

  private async readFromCache<T>(key: string): Promise<T | null> {
    const cached = await this.cacheManager.get<T>(
      path.join(this.cacheKey, key)
    );
    return cached;
  }

  private async writeToCache<T>(key: string, data: T): Promise<void> {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + 5 * 60 * 1000, // 5-minute expiration
    });
  }

  private async getCachedData<T>(key: string): Promise<T | null> {
    // First check memory cache
    const cachedData = this.cache.get<T>(key);
    if (cachedData) {
      return cachedData;
    }

    // Check file cache
    const fileCachedData = await this.readFromCache<T>(key);
    if (fileCachedData) {
      // Update memory cache
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }

    return null;
  }

  private async setCachedData<T>(cacheKey: string, data: T): Promise<void> {
    // Update both memory cache and file cache
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }

  /**
   * Search for token ID from CoinGecko API
   */
  private async searchTokenId(symbol: string): Promise<{ id: string, name: string, symbol: string } | null> {
    try {
      return await withRetry(async () => {
        const response = await fetch(`https://pro-api.coingecko.com/api/v3/search?query=${symbol}`, {
          headers: {
            'accept': 'application/json',
            'x-cg-pro-api-key': this.apiKey
          },
          // @ts-ignore - Node.js fetch type definitions may not include agent
          agent: this.agent,
          timeout: 5000
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const coins = data.coins;
        
        // Try to find an exact match for the symbol (case-insensitive)
        const exactMatch = coins.find((coin: any) => 
          coin.symbol.toLowerCase() === symbol.toLowerCase()
        );
        
        if (exactMatch) {
          return {
            id: exactMatch.id,
            name: exactMatch.name,
            symbol: exactMatch.symbol.toUpperCase()
          };
        }
        
        // If no exact match, return the first result (if any)
        if (coins.length > 0) {
          return {
            id: coins[0].id,
            name: coins[0].name,
            symbol: coins[0].symbol.toUpperCase()
          };
        }
        
        return null;
      });
    } catch (error) {
      elizaLogger.error(`Error searching for token ${symbol}:`, error);
      throw new Error(`Failed to search for token ${symbol}`);
    }
  }

  /**
   * Get detailed token information
   */
  async fetchTokenDetails(symbol: string, options: { includeMarketData: boolean, includeSocialData: boolean } = { includeMarketData: true, includeSocialData: false }): Promise<TokenDetails> {
    const cacheKey = `token:${symbol.toUpperCase()}`;
    
    // Try to get from cache
    const cachedToken = await this.getCachedData<TokenDetails>(cacheKey);
    if (cachedToken) {
      return cachedToken;
    }
    
    try {
      // 1. First search for token ID
      const tokenInfo = await this.searchTokenId(symbol);
      if (!tokenInfo) {
        throw new Error(`Token ${symbol} not found in CoinGecko`);
      }
      
      // 2. Use ID to get detailed information
      return await withRetry(async () => {
        const url = new URL(`https://pro-api.coingecko.com/api/v3/coins/${tokenInfo.id}`);
        url.searchParams.append('localization', 'false');
        url.searchParams.append('tickers', 'true');
        url.searchParams.append('market_data', options.includeMarketData.toString());
        url.searchParams.append('community_data', options.includeSocialData.toString());
        url.searchParams.append('developer_data', 'false');
        
        elizaLogger.info(`API Key: ${this.apiKey}`);
        const response = await fetch(url.toString(), {
          headers: {
            'accept': 'application/json',
            'x-cg-pro-api-key': this.apiKey
          },
          // @ts-ignore - Node.js fetch type definitions may not include agent
          agent: this.agent,
          timeout: 5000
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        const marketData = data.market_data || {};
        const tickers = data.tickers || [];
        
        // Find the first trading pair using USDT as the target currency
        const usdtTicker = tickers.find((ticker: any) => ticker.target === 'USDT');
        
        // Extract price information
        let price = marketData.current_price?.usd;
        if (!price && usdtTicker) {
          price = usdtTicker.converted_last?.usd || usdtTicker.last;
        }
        
        // Extract 24-hour price change percentage
        let priceChangePercentage24h = marketData.price_change_percentage_24h;
        
        // Build TokenDetails object
        const tokenDetails: TokenDetails = {
          id: data.id,
          name: data.name,
          symbol: data.symbol.toUpperCase(),
          decimals: data.detail_platforms?.[data.asset_platform_id]?.decimal_place || 8,
          totalSupply: marketData.total_supply?.toString() || undefined,
          price: price,
          marketCap: marketData.market_cap?.usd,
          volume24h: marketData.total_volume?.usd,
          priceChangePercentage24h: priceChangePercentage24h,
          imageUrl: data.image?.small
        };
        
        // Cache results
        await this.setCachedData(cacheKey, tokenDetails);
        
        return tokenDetails;
      });
    } catch (error) {
      elizaLogger.error(`Error fetching token details for ${symbol}:`, error);
      throw new Error(`Failed to fetch token details for ${symbol}: ${(error as Error).message}`);
    }
  }

  // Analyze social media trends
  async analyzeSocialTrends(tokenSymbol: string): Promise<SocialTrendAnalysis> {
    const cacheKey = `social:${tokenSymbol.toUpperCase()}`;
    
    // Try to get from cache
    const cachedTrend = await this.getCachedData<SocialTrendAnalysis>(cacheKey);
    if (cachedTrend) {
      return cachedTrend;
    }
    
    // In a real application, should call social media API
    const trend = mockSocialTrends[tokenSymbol.toUpperCase()];
    if (!trend) {
      throw new Error(`Social trend data for ${tokenSymbol} not found`);
    }
    
    // Cache results
    await this.setCachedData(cacheKey, trend);
    return trend;
  }
}

export const TokenProvider: Provider = {
  async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<any> {
    const tokenService = new TokenDetailsService(runtime.cacheManager);
    
    return {
      fetchTokenDetails: async (symbol: string, options: { includeMarketData: boolean, includeSocialData: boolean } = { includeMarketData: true, includeSocialData: false }) => {
        try {
          return await tokenService.fetchTokenDetails(symbol, options);
        } catch (error) {
          elizaLogger.error(`Could not fetch token details: ${(error as Error).message}`);
          // Return a TokenDetails object with error information
          return {
            name: symbol.toUpperCase(),
            symbol: symbol.toUpperCase(),
            decimals: 0,
            error: `Unable to fetch information for the ${symbol.toUpperCase()} token. Please try again later.`
          } as TokenDetails;
        }
      },
      analyzeSocialTrends: tokenService.analyzeSocialTrends.bind(tokenService)
    };
  }
}; 