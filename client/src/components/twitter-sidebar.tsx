import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, Twitter, Info, Search, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tweet, fetchTwitterTimeline } from '@/lib/twitter-api';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 定义平台类型
type Platform = 'x' | 'farcaster';

interface TwitterSidebarProps {
  query?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSendToChat?: (text: string) => void;
}

export function TwitterSidebar({ 
  query = 'aptos', 
  isOpen, 
  onToggle,
  onSendToChat 
}: TwitterSidebarProps) {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredToken, setHoveredToken] = useState<{token: string, tweetId: string} | null>(null);
  const [hoverElementRef, setHoverElementRef] = useState<HTMLElement | null>(null);
  const tokenButtonRef = useRef<HTMLButtonElement>(null);
  const tweetContainerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState(query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 新增选中平台状态
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('x');

  // Use useRef to create a cache for the last processed token, to track currently processed tokens
  const lastHandledTokenRef = useRef<{token: string, element: HTMLElement} | null>(null);
  // Create debounce timer ref
  const debounceTimerRef = useRef<number | null>(null);

  // Create a memoization cache for storing processed tweet texts
  const formattedTextCache = useRef<Map<string, string>>(new Map());
  
  // Helper function to clear the cache
  const clearFormattedTextCache = useCallback(() => {
    formattedTextCache.current.clear();
  }, []);
  
  // Use useCallback to optimize fetchTweets function, avoiding unnecessary recreations
  const fetchTweets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    // Reset all Token-related states
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // Reset the last processed token reference and clear timer
    lastHandledTokenRef.current = null;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // Clear text formatting cache
    clearFormattedTextCache();
    
    // Clear highlight styling from all token elements (if any)
    if (tweetContainerRef.current) {
      // Use more efficient selector, limited to the current container
      const highlightedTokens = tweetContainerRef.current.querySelectorAll('.bg-yellow-200, .dark\\:bg-yellow-800\\/60');
      if (highlightedTokens.length > 0) {
        highlightedTokens.forEach(token => {
          token.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
        });
      }
    }
    
    console.log("Start getting tweets...");
    
    try {
      const response = await fetchTwitterTimeline(searchQuery);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.tweets || response.tweets.length === 0) {
        console.log("API returned empty or non-existent tweets", response);
        setError('No tweets found in API response');
        setTweets([]); // Ensure old tweets are cleared
      } else {
        console.log(`Successfully got ${response.tweets.length} tweets`);
        
        // Use requestAnimationFrame to batch process data, to avoid UI blocking
        window.requestAnimationFrame(() => {
          // First set tweet data, to ensure handling undefined cases
          setTweets(response.tweets || []);
          setIsLoading(false);
        });
      }
    } catch (error) {
      console.error("Error getting tweets:", error);
      setError(error instanceof Error ? error.message : String(error));
      setTweets([]); // Ensure old tweets are cleared
      setIsLoading(false);
    }
  }, [searchQuery, setIsLoading, setError, setTweets, setHoveredToken, setHoverElementRef, clearFormattedTextCache]);

  // Only update searchQuery when query props change
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);
  
  // Automatically execute search when sidebar is opened
  useEffect(() => {
    if (isOpen) {
      fetchTweets();
    }
  }, [isOpen, fetchTweets]);

  // Focus to search box when sidebar is opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Use short delay to ensure DOM is updated
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Listen for click events, if clicked is not token button, hide button
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if clicked is token element itself
      const target = event.target as HTMLElement;
      if (target.classList.contains('token-keyword')) {
        return;
      }
      
      // Check if clicked is button
      if (tokenButtonRef.current && !tokenButtonRef.current.contains(event.target as Node)) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // Clear highlight styling from all token elements
        if (tweetContainerRef.current) {
          const tokens = tweetContainerRef.current.querySelectorAll('.token-keyword');
          tokens.forEach(token => {
            token.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
          });
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Token keyword list
  const TOKEN_KEYWORDS = ['Aptos', 'APT', 'amAPT', 'stAPT', 'TRU', 'CELL', 'TruAPT'];
  
  // Prefixed keyword list (also do hover processing for these keywords)
  const PREFIXED_KEYWORDS = ['$APT', '$APTOS', '#APT', '#Aptos', '$TRU', '$CELL'];
  
  // Generate unique ID, for marking DOM elements
  const generateUniqueId = () => {
    return `token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  // Add a more robust cleanup function, to ensure tweet display is correct, while retaining interactive attributes
  const sanitizeTweetText = useCallback((html: string): string => {
    if (!html) return '';
    
    try {
      // Create a temporary DOM element to parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const container = doc.body.firstChild as HTMLElement;
      
      if (!container) return html;
      
      // Handle all links, to keep correct text display
      const links = container.querySelectorAll('a');
      links.forEach(link => {
        // Keep data-* attributes
        const dataToken = link.getAttribute('data-token');
        const dataTweetId = link.getAttribute('data-tweet-id');
        const dataInstanceId = link.getAttribute('data-instance-id');
        
        // Remove all unnecessary attributes
        Array.from(link.attributes).forEach(attr => {
          if (attr.name !== 'data-token' && 
              attr.name !== 'data-tweet-id' && 
              attr.name !== 'data-instance-id' && 
              attr.name !== 'class' &&
              attr.name !== 'href') {
            link.removeAttribute(attr.name);
          }
        });
        
        // Re-set necessary attributes
        if (dataToken) link.setAttribute('data-token', dataToken);
        if (dataTweetId) link.setAttribute('data-tweet-id', dataTweetId);
        if (dataInstanceId) link.setAttribute('data-instance-id', dataInstanceId);
      });
      
      // Handle all token keyword spans
      const tokenSpans = container.querySelectorAll('.token-keyword');
      tokenSpans.forEach(span => {
        // Keep data-* attributes
        const dataToken = span.getAttribute('data-token');
        const dataTweetId = span.getAttribute('data-tweet-id');
        const dataInstanceId = span.getAttribute('data-instance-id');
        
        // Remove all unnecessary attributes
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'data-token' && 
              attr.name !== 'data-tweet-id' && 
              attr.name !== 'data-instance-id' && 
              attr.name !== 'class') {
            span.removeAttribute(attr.name);
          }
        });
        
        // Re-set necessary attributes
        if (dataToken) span.setAttribute('data-token', dataToken);
        if (dataTweetId) span.setAttribute('data-tweet-id', dataTweetId);
        if (dataInstanceId) span.setAttribute('data-instance-id', dataInstanceId);
      });
      
      return container.innerHTML;
    } catch (error) {
      console.error('Error sanitizing tweet text:', error);
      return html; // If error, return original HTML
    }
  }, []);

  // Handle link, mention, hashtag, and token keyword in tweet text
  const formatTweetText = useCallback((tweet: Tweet) => {
    // Ensure text exists
    if (!tweet.id) {
      console.warn('Tweet has no ID', tweet);
      return '';
    }
    
    // Check if tweet text has been processed before
    if (formattedTextCache.current.has(tweet.id)) {
      return formattedTextCache.current.get(tweet.id) || '';
    }
    
    // Prioritize full_text, if not exist use text
    let text = tweet.full_text || tweet.text || '';
    
    if (!text) {
      console.warn('Tweet text is empty', tweet);
      return '';
    }
    
    try {
      // Create a DOM tree to process text, to avoid processing already processed content
      const tempDiv = document.createElement('div');
      tempDiv.textContent = text;
      text = tempDiv.innerHTML;
      
      // Record already processed node positions, to avoid repeated processing
      interface ProcessedRange {
        start: number;
        end: number;
      }
      const processedRanges: ProcessedRange[] = [];
      
      // Replace links
      if (tweet.entities?.urls && tweet.entities.urls.length > 0) {
        tweet.entities.urls.forEach(url => {
          // Use try-catch to wrap, to prevent single url processing failure affecting overall
          try {
            if (url.url) {
              // Record URL position in original text
              const urlIndex = text.indexOf(url.url);
              if (urlIndex >= 0) {
                processedRanges.push({
                  start: urlIndex,
                  end: urlIndex + url.url.length
                });
              }
              
              // 检查是否为Twitter原始短链接(t.co链接)
              const isTwitterShortUrl = url.url.includes('t.co/');
              
              if (isTwitterShortUrl) {
                // 完全隐藏Twitter短链接(原始链接)
                text = text.replace(url.url, '');
              } else {
                // 正常处理其他链接：隐藏完整URL，仅显示display_url，并添加链接功能
                text = text.replace(url.url, `<a href="${url.expanded_url || url.url}" class="text-blue-500 hover:underline">${url.display_url || url.url}</a>`);
              }
              
              // 移除所有t.co类型的URL后缀(完全从文本中删除)
              if (url.display_url && url.display_url.startsWith('t.co/')) {
                text = text.replace(` https://t.co/${url.display_url.substring(5)}`, '');
                text = text.replace(` http://t.co/${url.display_url.substring(5)}`, '');
              }
            }
          } catch (e) {
            console.warn('Error processing URL in tweet:', e);
          }
        });
      }
      
      // Replace @ mentions
      if (tweet.entities?.user_mentions && tweet.entities.user_mentions.length > 0) {
        tweet.entities.user_mentions.forEach(mention => {
          try {
            if (mention.screen_name) {
              const mentionText = `@${mention.screen_name}`;
              // Record mention position in original text
              let startIndex = 0;
              let mentionIndex: number;
              const mentionRegex = new RegExp(mentionText, 'gi');
              
              while ((mentionIndex = text.indexOf(mentionText, startIndex)) !== -1) {
                // Check if this position has been processed before
                const isProcessed = processedRanges.some(
                  range => mentionIndex >= range.start && mentionIndex < range.end
                );
                
                if (!isProcessed) {
                  processedRanges.push({
                    start: mentionIndex,
                    end: mentionIndex + mentionText.length
                  });
                }
                
                startIndex = mentionIndex + 1;
              }
              
              // Only replace unprocessed @ mentions
              text = text.replace(mentionRegex, (match, offset) => {
                const isProcessed = processedRanges.some(
                  range => offset >= range.start && offset < range.end
                );
                
                if (isProcessed) {
                  return match; // Return original text, no replacement
                }
                
                return `<a href="https://twitter.com/${mention.screen_name}" class="text-blue-500 hover:underline">${match}</a>`;
              });
            }
          } catch (e) {
            console.warn('Error processing mention in tweet:', e);
          }
        });
      }
      
      // Replace # tags
      if (tweet.entities?.hashtags && tweet.entities.hashtags.length > 0) {
        tweet.entities.hashtags.forEach(hashtag => {
          try {
            if (hashtag.text) {
              const hashtagText = `#${hashtag.text}`;
              // Record hashtag position in original text
              let startIndex = 0;
              let hashtagIndex: number;
              const hashtagRegex = new RegExp(hashtagText, 'gi');
              
              while ((hashtagIndex = text.indexOf(hashtagText, startIndex)) !== -1) {
                // Check if this position has been processed before
                const isProcessed = processedRanges.some(
                  range => hashtagIndex >= range.start && hashtagIndex < range.end
                );
                
                if (!isProcessed) {
                  processedRanges.push({
                    start: hashtagIndex,
                    end: hashtagIndex + hashtagText.length
                  });
                }
                
                startIndex = hashtagIndex + 1;
              }
              
              // Only replace unprocessed # tags
              text = text.replace(hashtagRegex, (match, offset) => {
                const isProcessed = processedRanges.some(
                  range => offset >= range.start && offset < range.end
                );
                
                if (isProcessed) {
                  return match; // Return original text, no replacement
                }
                
                return `<a href="https://twitter.com/hashtag/${hashtag.text}" class="text-blue-500 hover:underline">${match}</a>`;
              });
            }
          } catch (e) {
            console.warn('Error processing hashtag in tweet:', e);
          }
        });
      }
      
      // Dynamically find all $ or # prefixed TOKEN_KEYWORDS as well as non-prefixed keywords
      TOKEN_KEYWORDS.forEach(token => {
        try {
          // Handle non-prefixed keywords
          const plainRegex = new RegExp(`(?<![#$@])\\b${token}\\b`, 'gi');
          
          // Handle non-prefixed keywords
          text = text.replace(plainRegex, (match, offset) => {
            // Check if this position has been processed before
            const isProcessed = processedRanges.some(
              range => offset >= range.start && offset < range.end
            );
            
            if (isProcessed) {
              return match; // Return original text, no replacement
            }
            
            // Record processed range
            processedRanges.push({
              start: offset,
              end: offset + match.length
            });
            
            // Use standard HTML attribute format, to ensure they can be correctly parsed
            return `<span class="font-bold bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded cursor-pointer token-keyword" data-token="${token}" data-tweet-id="${tweet.id}" data-instance-id="${generateUniqueId()}">${match}</span>`;
          });
          
          // Find $ prefixed pattern
          const dollarRegex = new RegExp(`\\$${token}\\b`, 'gi');
          // Find # prefixed pattern
          const hashRegex = new RegExp(`\\#${token}\\b`, 'gi');
          
          // Unified function to handle prefixed keywords
          const processPrefixedToken = (regex: RegExp, prefix: string) => {
            text = text.replace(regex, (match, offset) => {
              // Check if this position has been processed before
              const isProcessed = processedRanges.some(
                range => offset >= range.start && offset < range.end
              );
              
              if (isProcessed) {
                return match; // Return original text, no replacement
              }
              
              // Get unprefixed token value
              const tokenValue = match.substring(prefix.length);
              
              // Record processed range
              processedRanges.push({
                start: offset,
                end: offset + match.length
              });
              
              // Use standard HTML attribute format, to ensure they can be correctly parsed
              return `<span class="font-bold text-blue-500 hover:underline cursor-pointer token-keyword" data-token="${tokenValue}" data-tweet-id="${tweet.id}" data-instance-id="${generateUniqueId()}">${match}</span>`;
            });
          };
          
          // Handle prefixed keywords
          processPrefixedToken(dollarRegex, '$');
          processPrefixedToken(hashRegex, '#');
        } catch (e) {
          console.warn(`Error processing keyword "${token}" in tweet:`, e);
        }
      });
      
      // Handle additional predefined prefixed keyword list
      PREFIXED_KEYWORDS.forEach(prefixedToken => {
        try {
          // Create exact match regular expression
          const regex = new RegExp(prefixedToken, 'g');
          
          // Generate unique ID for each token instance, to help debug and track
          const instanceId = generateUniqueId();
          
          // Replace prefixed keywords with interactive elements
          text = text.replace(regex, (match, offset) => {
            // Check if this position has been processed before
            const isProcessed = processedRanges.some(
              range => offset >= range.start && offset < range.end
            );
            
            if (isProcessed) {
              return match; // Return original text, no replacement
            }
            
            // Get unprefixed token value
            const tokenValue = match.startsWith('$') || match.startsWith('#') 
              ? match.substring(1) 
              : match;
            
            // Record processed range
            processedRanges.push({
              start: offset,
              end: offset + match.length
            });
            
            // Use standard HTML attribute format, to ensure they can be correctly parsed
            return `<span class="font-bold text-blue-500 hover:underline cursor-pointer token-keyword" data-token="${tokenValue}" data-tweet-id="${tweet.id}" data-instance-id="${instanceId}">${match}</span>`;
          });
        } catch (e) {
          console.warn(`Error processing prefixed keyword "${prefixedToken}" in tweet:`, e);
        }
      });
      
      // Clean text before storing in cache
      const sanitizedText = sanitizeTweetText(text);
      formattedTextCache.current.set(tweet.id, sanitizedText);
      
      return sanitizedText;
    } catch (error) {
      console.error('Error formatting tweet text:', error, tweet);
      return tweet.full_text || tweet.text || ''; // Return original text if error
    }
  }, []);
  
  // Clear text formatting cache when component unmounts or tweet query changes
  useEffect(() => {
    return () => {
      clearFormattedTextCache();
    };
  }, [query, clearFormattedTextCache]);
  
  // Render media content
  const renderMedia = (tweet: Tweet) => {
    if (!tweet.entities?.media || tweet.entities.media.length === 0) {
      return null;
    }
    
    const media = tweet.entities.media[0];
    
    if (media.type === 'photo') {
      return (
        <div className="mt-2 rounded-md overflow-hidden">
          <img 
            src={media.media_url_https} 
            alt="Tweet media" 
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
      );
    } else if (media.type === 'video' || media.type === 'animated_gif') {
      const videoVariant = media.video_info?.variants.find(v => v.content_type === 'video/mp4');
      if (videoVariant) {
        return (
          <div className="mt-2 rounded-md overflow-hidden">
            <video 
              src={videoVariant.url} 
              controls={media.type === 'video'}
              autoPlay={media.type === 'animated_gif'}
              loop={media.type === 'animated_gif'}
              muted
              className="w-full h-auto"
              preload="metadata"
            />
          </div>
        );
      }
    }
    
    return null;
  };
  
  // Render quoted tweet
  const renderQuotedTweet = (tweet: Tweet) => {
    if (!tweet.quoted_tweet) return null;
    
    // Try to hide quoted tweet URL
    if (tweet.entities?.urls) {
      tweet.entities.urls.forEach(url => {
        if (url.expanded_url?.includes('/status/') && tweet.quoted_tweet) {
          // This is a quoted tweet link, we can remove it from text
          const originalText = tweet.full_text || tweet.text || '';
          if (originalText) {
            // Save modified result to full_text and text fields
            const newText = originalText.replace(url.url, '').trim();
            tweet.text = newText;
            if (tweet.full_text) {
              tweet.full_text = newText;
            }
          }
        }
      });
    }
    
    return (
      <div className="mt-2 p-2 border rounded-md bg-accent/30">
        <div className="flex items-start gap-2 mb-1">
          <img 
            src={tweet.quoted_tweet.user.profile_image_url} 
            alt={tweet.quoted_tweet.user.name} 
            className="h-5 w-5 rounded-full"
          />
          <div className="flex items-center">
            <p className="font-semibold text-xs">{tweet.quoted_tweet.user.name}</p>
            {tweet.quoted_tweet.user.verified && (
              <span className="ml-1 text-blue-500 text-xs">✓</span>
            )}
            <p className="text-xs text-muted-foreground ml-1">@{tweet.quoted_tweet.user.screen_name}</p>
          </div>
        </div>
        <div 
          className="text-xs"
          dangerouslySetInnerHTML={tweet.quoted_tweet ? { __html: formatTweetText(tweet.quoted_tweet) } : { __html: '' }}
        />
      </div>
    );
  };

  // Update button position, to ensure visible in viewport
  const updateButtonPosition = useCallback((target: HTMLElement) => {
    if (!tokenButtonRef.current) return;
    
    const rect = target.getBoundingClientRect();
    const buttonHeight = 28; // Estimated button height
    
    // Calculate base position (below keyword)
    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX;
    
    // Check if exceeds viewport bottom
    const viewportHeight = window.innerHeight;
    if (top + buttonHeight > viewportHeight + window.scrollY) {
      // If exceeds bottom, place button above keyword
      top = rect.top + window.scrollY - buttonHeight;
    }
    
    // Ensure button does not exceed right boundary
    const buttonWidth = 250; // Estimated button width
    const viewportWidth = window.innerWidth;
    if (left + buttonWidth > viewportWidth) {
      left = viewportWidth - buttonWidth - 10; // 10px margin
    }
    
    // Apply calculated position
    tokenButtonRef.current.style.top = `${top}px`;
    tokenButtonRef.current.style.left = `${left}px`;
    tokenButtonRef.current.style.display = 'flex'; // Ensure button visible
    tokenButtonRef.current.style.position = 'fixed'; // Use fixed positioning, to avoid scroll affecting
    tokenButtonRef.current.style.zIndex = '9999'; // Ensure on top layer
  }, []);

  // Set current hovered token element
  const setCurrentHoveredToken = useCallback((element: HTMLElement | null) => {
    // If element is same as current highlighted element, do nothing
    if (element === hoverElementRef) {
      return;
    }
    
    // Clear all previous highlights, only do DOM operations when needed
    if (tweetContainerRef.current && hoverElementRef !== element) {
      if (hoverElementRef) {
        // If there is previous highlighted element, just remove its style
        hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      }
    }
    
    // Update reference
    setHoverElementRef(element);
    
    if (element) {
      // Highlight current element
      element.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
      
      const token = element.getAttribute('data-token');
      const tweetId = element.getAttribute('data-tweet-id');
      
      if (token && tweetId) {
        // Clean token value, to ensure no HTML tags
        const cleanToken = token.replace(/<[^>]*>/g, '').trim();
        
        // If token and tweetId haven't changed, avoid state update
        if (!hoveredToken || hoveredToken.token !== cleanToken || hoveredToken.tweetId !== tweetId) {
          // Log only in non-production environment
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Set hovered token: ${cleanToken}, tweetId: ${tweetId}`);
          }
          setHoveredToken({ token: cleanToken, tweetId });
        }
        
        // Update button position
        updateButtonPosition(element);
      }
    } else if (hoveredToken) {
      // Only update state when there is previous hoveredToken
      setHoveredToken(null);
    }
  }, [hoveredToken, hoverElementRef, updateButtonPosition]);
  
  // Listen for window size change, reposition button
  useEffect(() => {
    if (!hoveredToken || !hoverElementRef) return;
    
    const handleResize = () => {
      if (hoverElementRef) {
        updateButtonPosition(hoverElementRef);
      }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [hoveredToken, hoverElementRef, updateButtonPosition]);
  
  // Listen for tweets change, to ensure re-initialize token-related processing after tweets update
  useEffect(() => {
    // If tweets change, it could be refresh or initial load
    console.log(`tweets state updated, currently have ${tweets.length} tweets`);
    
    // Reset token-related states
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // Short delay, to ensure DOM is updated, then re-check and initialize token elements
    if (tweets.length > 0) {
      // Use requestAnimationFrame to ensure DOM updated before checking elements
      const timeoutId = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          if (tweetContainerRef.current) {
            // Use more efficient selector to find all token keyword elements
            const tokenElements = tweetContainerRef.current.querySelectorAll('.token-keyword');
            
            // Log only in non-production environment
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Found ${tokenElements.length} token keyword elements`);
            }
          }
        });
      }, 200);
      
      return () => window.clearTimeout(timeoutId);
    }
  }, [tweets]);

  // Enhanced Helper function, to remove HTML tags and convert HTML entities
  const stripHtmlTags = useCallback((html: string): string => {
    if (!html) return '';
    
    // Create a temporary element to parse HTML
    const tempElement = document.createElement('div');
    
    // Safely set HTML content
    tempElement.innerHTML = html;
    
    // Get plain text content (this will automatically handle HTML entities)
    let plainText = tempElement.textContent || tempElement.innerText || '';
    
    // Remove extra spaces and newlines
    plainText = plainText.replace(/\s+/g, ' ').trim();
    
    // Replace HTML entities
    plainText = plainText
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
      
    return plainText;
  }, []);

  // Handle token keyword click event
  const handleTokenClick = useCallback((token: string) => {
    if (onSendToChat) {
      console.log(`Send token query to chat: ${token}`);
      
      // Handle possible prefixed token
      let cleanToken = token;
      
      // If token still contains $ or # prefix, remove them
      if (cleanToken.startsWith('$') || cleanToken.startsWith('#')) {
        cleanToken = cleanToken.substring(1);
      }
      
      // Send processed plain text to chat
      onSendToChat(`show me the details about ${cleanToken} token`);
    }
    
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // Clear highlight styling from all token elements
    if (tweetContainerRef.current) {
      const tokens = tweetContainerRef.current.querySelectorAll('.token-keyword');
      tokens.forEach(token => {
        token.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      });
    }
  }, [onSendToChat, stripHtmlTags]);
  
  // Modify handling tweet container mouse events function, add more error handling
  const handleTweetContainerMouseEvent = useCallback((event: React.MouseEvent) => {
    // Check event type
    if (event.type === 'mouseover') {
      const target = event.target as HTMLElement;
      
      // Check if hovering over token keyword
      if (target && target.classList && target.classList.contains('token-keyword')) {
        const token = target.getAttribute('data-token');
        const tweetId = target.getAttribute('data-tweet-id');
        
        // Add more detailed debug information
        if (process.env.NODE_ENV !== 'production') {
          console.log('Hover element:', target.outerHTML);
          console.log('Got attributes:', { token, tweetId });
        }
        
        if (!token || !tweetId) {
          // Log warning only in development environment
          if (process.env.NODE_ENV !== 'production') {
            console.warn('token keyword element missing necessary attributes:', {
              element: target.outerHTML,
              token,
              tweetId
            });
          }
          
          // Try to infer token value from internal text content
          const innerText = target.innerText || target.textContent;
          if (innerText && TOKEN_KEYWORDS.includes(innerText)) {
            // If internal text matches any keyword, use it as token
            const inferredToken = innerText;
            const randomTweetId = `inferred-${Date.now()}`;
            
            console.log('Inferred token from content:', inferredToken);
            
            // Use inferred value to continue processing
            handleInferredToken(target, inferredToken, randomTweetId);
            return;
          }
          
          return;
        }
        
        // Clean token value, to ensure no HTML tags
        const cleanToken = token.replace(/<[^>]*>/g, '').trim();
        
        // Check if same token and element as last processed, if so skip processing
        if (lastHandledTokenRef.current && 
            lastHandledTokenRef.current.token === cleanToken && 
            lastHandledTokenRef.current.element === target) {
          return;
        }
        
        // Clear previous debounce timer
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        
        // Create new debounce timer, delay processing hover event
        debounceTimerRef.current = window.setTimeout(() => {
          // Log only in non-production environment, use !== 'production' instead of === 'development'
          if (process.env.NODE_ENV !== 'production') {
            console.log('Mouse hovering over token keyword:', cleanToken);
          }
          
          // Update last processed token reference
          lastHandledTokenRef.current = {token: cleanToken, element: target};
          
          // Set current hovered token
          setCurrentHoveredToken(target);
          
          // Manually update button position, to ensure button display
          if (tokenButtonRef.current && hoveredToken) {
            updateButtonPosition(target);
            tokenButtonRef.current.style.display = 'flex'; // Ensure button visible
          }
        }, 100); // Increase delay to 100 milliseconds, reduce trigger frequency
      }
    }
  }, [setCurrentHoveredToken, updateButtonPosition, hoveredToken]);
  
  // Handle inferred token
  const handleInferredToken = useCallback((element: HTMLElement, token: string, tweetId: string) => {
    // Clean token value, to ensure no HTML tags
    const cleanToken = token.replace(/<[^>]*>/g, '').trim();
    
    // Update last processed token reference
    lastHandledTokenRef.current = {token: cleanToken, element};
    
    // Set current hovered token
    setHoveredToken({ token: cleanToken, tweetId });
    setHoverElementRef(element);
    
    // Highlight current element
    element.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
    
    // Update button position
    updateButtonPosition(element);
    
    // Ensure button visible
    if (tokenButtonRef.current) {
      tokenButtonRef.current.style.display = 'flex';
    }
  }, [updateButtonPosition]);

  // Handle tweet container mouse leave event
  const handleTweetContainerMouseLeave = useCallback(() => {
    // Clear debounce timer
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // Reset last processed token reference
    lastHandledTokenRef.current = null;
    
    // Use delayed operation, to avoid button disappearing when mouse moves from token to button
    setTimeout(() => {
      // Check if mouse is on button
      if (tokenButtonRef.current && document.activeElement !== tokenButtonRef.current) {
        // If no focus on button, hide token hint
        if (!hoveredToken) {
          setCurrentHoveredToken(null);
        }
      }
    }, 50);
  }, [hoveredToken, setCurrentHoveredToken]);

  // Add handling for button mouse leave event
  const handleButtonMouseLeave = useCallback(() => {
    // When mouse leaves button, if not click operation, hide button after short delay
    setTimeout(() => {
      if (tokenButtonRef.current && document.activeElement !== tokenButtonRef.current) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // Clear highlight styling
        if (hoverElementRef) {
          hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
        }
      }
    }, 100);
  }, [hoverElementRef]);

  // Add global click event handling
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // If clicked position is not token element or token button, clear hover state
      const target = e.target as Node;
      if (
        tokenButtonRef.current && 
        !tokenButtonRef.current.contains(target) && 
        hoverElementRef && 
        !hoverElementRef.contains(target)
      ) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // Clear highlight styling
        hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      }
    };
    
    document.addEventListener('click', handleGlobalClick);
    
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [hoverElementRef]);

  // Add an effect to clean up timer when component unmounts
  useEffect(() => {
    return () => {
      // Clean up debounce timer when component unmounts
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate search keyword is not empty
    if (!searchQuery.trim()) {
      // If empty, restore default keyword
      setSearchQuery('aptos');
      setTimeout(() => fetchTweets(), 0);
      return;
    }
    
    fetchTweets();
  };
  
  // Handle enter key submission
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(e);
    }
  };

  return (
    <div className={cn(
      "fixed top-0 right-0 h-full bg-background border-l transition-all duration-300 flex flex-col z-10",
      isOpen ? "w-[30rem]" : "w-12"
    )}>
      <div className="flex items-center justify-between p-4 border-b">
        <div className={cn("flex items-center gap-2", !isOpen && "hidden")}>
          <Twitter className="h-5 w-5 text-blue-400" />
          <h2 className="font-semibold">Find your alpha Posts</h2>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggle}
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      {isOpen && (
        <>
          {/* 添加平台选择标签页 */}
          <div className="px-4 py-2 border-b">
            <Tabs defaultValue="x" value={selectedPlatform} onValueChange={(value) => setSelectedPlatform(value as Platform)}>
              <TabsList className="w-full mb-2">
                <TabsTrigger value="x" className="flex-1">X</TabsTrigger>
                <TabsTrigger value="farcaster" className="flex-1">Farcaster</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* 搜索框 - 仅在X平台显示 */}
          {selectedPlatform === 'x' && (
            <div className="flex items-center px-4 py-2 border-b">
              <form onSubmit={handleSearch} className="flex items-center w-full gap-1">
                <div className="relative flex-1">
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search tweets (e.g. aptos)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="pr-8 text-sm h-8"
                    aria-label="Search keywords"
                  />
                </div>
                <Button 
                  type="submit"
                  variant="ghost" 
                  size="icon"
                  disabled={isLoading}
                  aria-label="Search tweets"
                  className="h-8 w-8"
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button 
                  type="button"
                  variant="ghost" 
                  size="icon" 
                  onClick={fetchTweets} 
                  disabled={isLoading}
                  aria-label="Refresh tweets"
                  className="h-8 w-8"
                >
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
              </form>
            </div>
          )}
          
          {/* 内容区域 - 根据平台显示不同内容 */}
          {selectedPlatform === 'x' ? (
            <div 
              ref={tweetContainerRef}
              className="flex-1 overflow-y-auto p-2"
              onMouseOver={handleTweetContainerMouseEvent}
              onMouseLeave={handleTweetContainerMouseLeave}
            >
              {isLoading ? (
                // 加载骨架屏
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="mb-4 p-3 border rounded-lg">
                    <div className="flex items-start gap-2 mb-2">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="h-16 w-full mb-2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))
              ) : error ? (
                <div className="p-4 text-center text-red-500">{error}</div>
              ) : tweets.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No tweets found</div>
              ) : (
                tweets.map(tweet => {
                  if (!tweet || !tweet.id || !tweet.user) {
                    console.error('Invalid tweet object:', tweet);
                    return null;
                  }
                  
                  // 检查是否是仅包含视频而没有文本内容的推文
                  const hasText = (tweet.full_text || tweet.text || '').trim().length > 0;
                  const hasVideo = tweet.entities?.media?.some(m => m.type === 'video' || m.type === 'animated_gif');
                  
                  // 如果只有视频没有文本，跳过这条推文
                  if (!hasText && hasVideo) {
                    return null;
                  }
                  
                  return (
                    <div key={tweet.id} className="mb-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex items-start gap-2 mb-2">
                        {tweet.user.profile_image_url ? (
                          <img 
                            src={tweet.user.profile_image_url} 
                            alt={tweet.user.name} 
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted"></div>
                        )}
                        <div>
                          <div className="flex items-center">
                            <p className="font-semibold text-sm">{tweet.user.name}</p>
                            {tweet.user.verified && (
                              <span className="ml-1 text-blue-500 text-xs">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">@{tweet.user.screen_name}</p>
                        </div>
                        
                        {/* 添加推文发送到对话框的按钮 */}
                        <div className="ml-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSendToChat && (tweet.full_text || tweet.text)) {
                                const tweetText = tweet.full_text || tweet.text || '';
                                // Remove empty lines and normalize whitespace
                                const cleanedText = tweetText
                                  .split('\n')
                                  .filter(line => line.trim() !== '')
                                  .join('\n')
                                  .trim();
                                onSendToChat(`Help me to analyze this tweet: \`\`\`${cleanedText}\`\`\``);
                              }
                            }}
                            aria-label="analyze this tweet"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      
                      {tweet.full_text || tweet.text ? (
                        <div 
                          className="text-sm mb-2"
                          dangerouslySetInnerHTML={{ __html: formatTweetText(tweet) }}
                        />
                      ) : (
                        <div className="text-sm mb-2 text-muted-foreground">[No tweet content]</div>
                      )}
                      
                      {renderMedia(tweet)}
                      {renderQuotedTweet(tweet)}
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{formatDate(tweet.created_at)}</span>
                        {tweet.retweet_count !== undefined && (
                          <span>Retweets: {tweet.retweet_count}</span>
                        )}
                        {tweet.favorite_count !== undefined && (
                          <span>Likes: {tweet.favorite_count}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Farcaster平台内容 - 显示即将推出的提示
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <h3 className="text-xl font-bold mb-2">Coming Soon</h3>
                <p className="text-muted-foreground">
                  Farcaster integration is under development.<br/>
                  Stay tuned for updates!
                </p>
              </div>
            </div>
          )}
          
          {/* Token hover button */}
          {hoveredToken && (
            <button
              ref={tokenButtonRef}
              className="fixed z-50 bg-primary text-primary-foreground px-4 py-2 text-xs rounded flex items-center gap-1 shadow-md hover:bg-primary/90 transition-colors"
              style={{ 
                position: 'fixed',
                zIndex: 9999,
                display: 'flex',  
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
              }}
              onMouseEnter={() => {
                // When mouse enters button, keep button display state
                if (hoverElementRef) {
                  hoverElementRef.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
                }
              }}
              onMouseLeave={handleButtonMouseLeave}
              onClick={() => {
                const tweet = tweets.find(t => t.id === hoveredToken.tweetId);
                if (tweet) {
                  // Use token value for query
                  handleTokenClick(hoveredToken.token);
                }
              }}
            >
              <Info className="h-4 w-4 mr-1" />
              More
            </button>
          )}
        </>
      )}  
    </div>
  );
} 