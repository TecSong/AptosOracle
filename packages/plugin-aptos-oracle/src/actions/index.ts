// Export all actions
export { FETCH_TOKEN_DETAILS } from './fetchTokenDetails';
export { SWAP_TOKEN } from './swapToken';
export { ANALYZE_TWEET_SENTIMENT } from './analyzeTweetSentiment';

// Export all actions as an array
import { Action } from '@elizaos/core';
import { FETCH_TOKEN_DETAILS } from './fetchTokenDetails';
import { SWAP_TOKEN } from './swapToken';
import { ANALYZE_TWEET_SENTIMENT } from './analyzeTweetSentiment';

export const actions: Action[] = [
  FETCH_TOKEN_DETAILS,
  SWAP_TOKEN,
  ANALYZE_TWEET_SENTIMENT
]; 