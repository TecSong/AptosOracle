// Token 详情接口
export interface TokenDetails {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
  price?: number;
  marketCap?: number;
  volume24h?: number;
}

// Token 转账参数
export interface TransferTokenParams {
  tokenSymbol: string;
  amount: string;
  recipientAddress: string;
}

// Token 交换参数
export interface SwapTokenParams {
  fromToken: string;
  toToken: string;
  amount: string;
  slippage: string;
}

// 社交媒体趋势分析结果
export interface SocialTrendAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  trendingKeywords: string[];
  recentMentions: number;
  changePercent24h: number;
}

// 插件环境配置
export interface AptosOracleEnvironment {
  apiKey?: string;
  apiEndpoint?: string;
  networkId?: string;
}
