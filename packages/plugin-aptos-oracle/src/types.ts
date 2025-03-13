// Token Details Interface
export interface TokenDetails {
  id?: string;  // Unique token identifier in CoinGecko API
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
  price?: number;
  marketCap?: number;
  volume24h?: number;
  priceChangePercentage24h?: number;  // 24-hour price change percentage
  imageUrl?: string;  // Token icon URL
  error?: string;  // Error message, used when token data retrieval fails
}

// Token Transfer Parameters
export interface TransferTokenParams {
  tokenSymbol: string;
  amount: string;
  recipientAddress: string;
}

// Token Swap Parameters
export interface SwapTokenParams {
  fromToken: string;
  toToken: string;
  amount: string;
  slippage: string;
}

// Social Media Trend Analysis Results
export interface SocialTrendAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  trendingKeywords: string[];
  recentMentions: number;
  changePercent24h: number;
}

// Plugin Environment Configuration
export interface AptosOracleEnvironment {
  apiKey?: string;
  apiEndpoint?: string;
  networkId?: string;
}
