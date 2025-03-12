import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, Twitter, Info, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tweet, fetchTwitterTimeline } from '@/lib/twitter-api';
import { Input } from '@/components/ui/input';

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

  // 使用useRef创建一个上次处理的token缓存，用于跟踪当前已处理的token
  const lastHandledTokenRef = useRef<{token: string, element: HTMLElement} | null>(null);
  // 创建防抖计时器ref
  const debounceTimerRef = useRef<number | null>(null);

  // 创建一个memoization缓存，用于存储已处理过的推文文本
  const formattedTextCache = useRef<Map<string, string>>(new Map());
  
  // 清理缓存的辅助函数
  const clearFormattedTextCache = useCallback(() => {
    formattedTextCache.current.clear();
  }, []);
  
  // 使用useCallback优化fetchTweets函数，避免不必要的重新创建
  const fetchTweets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    // 重置所有与Token相关的状态
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // 重置最后处理的token引用和清理计时器
    lastHandledTokenRef.current = null;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 清理文本格式化缓存
    clearFormattedTextCache();
    
    // 清除所有token元素的高亮样式（如果存在）
    if (tweetContainerRef.current) {
      // 使用更高效的选择器，限制在当前容器内
      const highlightedTokens = tweetContainerRef.current.querySelectorAll('.bg-yellow-200, .dark\\:bg-yellow-800\\/60');
      if (highlightedTokens.length > 0) {
        highlightedTokens.forEach(token => {
          token.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
        });
      }
    }
    
    console.log("开始获取推文...");
    
    try {
      const response = await fetchTwitterTimeline(searchQuery);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.tweets || response.tweets.length === 0) {
        console.log("API返回的tweets为空或不存在", response);
        setError('No tweets found in API response');
        setTweets([]); // 确保清空旧的tweets
      } else {
        console.log(`成功获取到 ${response.tweets.length} 条推文`);
        
        // 使用requestAnimationFrame分批处理数据，避免UI阻塞
        window.requestAnimationFrame(() => {
          // 先设置推文数据，确保处理undefined情况
          setTweets(response.tweets || []);
          setIsLoading(false);
        });
      }
    } catch (error) {
      console.error("获取推文时出错:", error);
      setError(error instanceof Error ? error.message : String(error));
      setTweets([]); // 确保清空旧的tweets
      setIsLoading(false);
    }
  }, [searchQuery, setIsLoading, setError, setTweets, setHoveredToken, setHoverElementRef, clearFormattedTextCache]);

  // 只在query props变化时更新searchQuery
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);
  
  // 当侧边栏打开时自动执行搜索
  useEffect(() => {
    if (isOpen) {
      fetchTweets();
    }
  }, [isOpen, fetchTweets]);

  // 当侧边栏打开时，聚焦到搜索框
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // 使用短暂的延迟确保DOM已更新
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // 监听点击事件，如果点击的不是token按钮，则隐藏按钮
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查点击的是否是token元素本身
      const target = event.target as HTMLElement;
      if (target.classList.contains('token-keyword')) {
        return;
      }
      
      // 检查点击的是否是按钮
      if (tokenButtonRef.current && !tokenButtonRef.current.contains(event.target as Node)) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // 清除所有token元素的高亮样式
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

  // Token关键字列表
  const TOKEN_KEYWORDS = ['Aptos', 'APT', 'amAPT', 'stAPT', 'TRU', 'CELL', 'TruAPT'];
  
  // 带前缀的关键字列表（对这些关键字也做悬浮处理）
  const PREFIXED_KEYWORDS = ['$APT', '$APTOS', '#APT', '#Aptos', '$TRU', '$CELL'];
  
  // 生成唯一ID，用于标记DOM元素
  const generateUniqueId = () => {
    return `token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  // 添加一个更强大的清理函数，确保推文显示正确，同时保留交互所需的属性
  const sanitizeTweetText = useCallback((html: string): string => {
    if (!html) return '';
    
    try {
      // 创建一个临时的DOM元素来解析HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const container = doc.body.firstChild as HTMLElement;
      
      if (!container) return html;
      
      // 处理所有链接，使他们保持正确的文本显示
      const links = container.querySelectorAll('a');
      links.forEach(link => {
        // 保留data-*属性
        const dataToken = link.getAttribute('data-token');
        const dataTweetId = link.getAttribute('data-tweet-id');
        const dataInstanceId = link.getAttribute('data-instance-id');
        
        // 移除所有不需要显示的属性
        Array.from(link.attributes).forEach(attr => {
          if (attr.name !== 'data-token' && 
              attr.name !== 'data-tweet-id' && 
              attr.name !== 'data-instance-id' && 
              attr.name !== 'class' &&
              attr.name !== 'href') {
            link.removeAttribute(attr.name);
          }
        });
        
        // 重新设置必要的属性
        if (dataToken) link.setAttribute('data-token', dataToken);
        if (dataTweetId) link.setAttribute('data-tweet-id', dataTweetId);
        if (dataInstanceId) link.setAttribute('data-instance-id', dataInstanceId);
      });
      
      // 处理所有token关键字span
      const tokenSpans = container.querySelectorAll('.token-keyword');
      tokenSpans.forEach(span => {
        // 保留data-*属性
        const dataToken = span.getAttribute('data-token');
        const dataTweetId = span.getAttribute('data-tweet-id');
        const dataInstanceId = span.getAttribute('data-instance-id');
        
        // 移除所有不需要显示的属性
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'data-token' && 
              attr.name !== 'data-tweet-id' && 
              attr.name !== 'data-instance-id' && 
              attr.name !== 'class') {
            span.removeAttribute(attr.name);
          }
        });
        
        // 重新设置必要的属性
        if (dataToken) span.setAttribute('data-token', dataToken);
        if (dataTweetId) span.setAttribute('data-tweet-id', dataTweetId);
        if (dataInstanceId) span.setAttribute('data-instance-id', dataInstanceId);
      });
      
      return container.innerHTML;
    } catch (error) {
      console.error('Error sanitizing tweet text:', error);
      return html; // 如果出错，返回原始HTML
    }
  }, []);

  // 处理推文文本中的链接、提及、话题标签和token关键字
  const formatTweetText = useCallback((tweet: Tweet) => {
    // 确保文本存在
    if (!tweet.id) {
      console.warn('Tweet has no ID', tweet);
      return '';
    }
    
    // 检查缓存中是否已处理过该推文
    if (formattedTextCache.current.has(tweet.id)) {
      return formattedTextCache.current.get(tweet.id) || '';
    }
    
    // 优先使用full_text，如果不存在则使用text
    let text = tweet.full_text || tweet.text || '';
    
    if (!text) {
      console.warn('Tweet text is empty', tweet);
      return '';
    }
    
    try {
      // 创建一个DOM树来处理文本，避免处理已经被处理过的内容
      const tempDiv = document.createElement('div');
      tempDiv.textContent = text;
      text = tempDiv.innerHTML;
      
      // 记录已经处理过的节点位置，避免重复处理
      interface ProcessedRange {
        start: number;
        end: number;
      }
      const processedRanges: ProcessedRange[] = [];
      
      // 替换链接
      if (tweet.entities?.urls && tweet.entities.urls.length > 0) {
        tweet.entities.urls.forEach(url => {
          // 使用try-catch包裹，防止单个url处理失败影响整体
          try {
            if (url.url) {
              // 记录URL在原文中的位置
              const urlIndex = text.indexOf(url.url);
              if (urlIndex >= 0) {
                processedRanges.push({
                  start: urlIndex,
                  end: urlIndex + url.url.length
                });
              }
              
              // 隐藏完整URL，只显示display_url，并添加链接功能
              text = text.replace(url.url, `<a href="${url.expanded_url || url.url}" class="text-blue-500 hover:underline">${url.display_url || url.url}</a>`);
              
              // 移除所有t.co类型的URL后缀（完全从文本中移除）
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
      
      // 替换@提及
      if (tweet.entities?.user_mentions && tweet.entities.user_mentions.length > 0) {
        tweet.entities.user_mentions.forEach(mention => {
          try {
            if (mention.screen_name) {
              const mentionText = `@${mention.screen_name}`;
              // 记录提及在原文中的位置
              let startIndex = 0;
              let mentionIndex: number;
              const mentionRegex = new RegExp(mentionText, 'gi');
              
              while ((mentionIndex = text.indexOf(mentionText, startIndex)) !== -1) {
                // 检查这个位置是否已经被处理过
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
              
              // 只替换未处理过的@提及
              text = text.replace(mentionRegex, (match, offset) => {
                const isProcessed = processedRanges.some(
                  range => offset >= range.start && offset < range.end
                );
                
                if (isProcessed) {
                  return match; // 返回原始文本，不做替换
                }
                
                return `<a href="https://twitter.com/${mention.screen_name}" class="text-blue-500 hover:underline">${match}</a>`;
              });
            }
          } catch (e) {
            console.warn('Error processing mention in tweet:', e);
          }
        });
      }
      
      // 替换#标签
      if (tweet.entities?.hashtags && tweet.entities.hashtags.length > 0) {
        tweet.entities.hashtags.forEach(hashtag => {
          try {
            if (hashtag.text) {
              const hashtagText = `#${hashtag.text}`;
              // 记录hashtag在原文中的位置
              let startIndex = 0;
              let hashtagIndex: number;
              const hashtagRegex = new RegExp(hashtagText, 'gi');
              
              while ((hashtagIndex = text.indexOf(hashtagText, startIndex)) !== -1) {
                // 检查这个位置是否已经被处理过
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
              
              // 只替换未处理过的#标签
              text = text.replace(hashtagRegex, (match, offset) => {
                const isProcessed = processedRanges.some(
                  range => offset >= range.start && offset < range.end
                );
                
                if (isProcessed) {
                  return match; // 返回原始文本，不做替换
                }
                
                return `<a href="https://twitter.com/hashtag/${hashtag.text}" class="text-blue-500 hover:underline">${match}</a>`;
              });
            }
          } catch (e) {
            console.warn('Error processing hashtag in tweet:', e);
          }
        });
      }
      
      // 动态查找所有带$或#前缀的TOKEN_KEYWORDS以及不带前缀的关键字
      TOKEN_KEYWORDS.forEach(token => {
        try {
          // 处理不带前缀的关键字
          const plainRegex = new RegExp(`(?<![#$@])\\b${token}\\b`, 'gi');
          
          // 处理不带前缀的关键字
          text = text.replace(plainRegex, (match, offset) => {
            // 检查这个位置是否已经被处理过
            const isProcessed = processedRanges.some(
              range => offset >= range.start && offset < range.end
            );
            
            if (isProcessed) {
              return match; // 返回原始文本，不做替换
            }
            
            // 记录处理过的范围
            processedRanges.push({
              start: offset,
              end: offset + match.length
            });
            
            // 使用HTML属性的标准格式，确保它们能够被正确解析
            return `<span class="font-bold bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded cursor-pointer token-keyword" data-token="${token}" data-tweet-id="${tweet.id}" data-instance-id="${generateUniqueId()}">${match}</span>`;
          });
          
          // 查找带$前缀的模式
          const dollarRegex = new RegExp(`\\$${token}\\b`, 'gi');
          // 查找带#前缀的模式
          const hashRegex = new RegExp(`\\#${token}\\b`, 'gi');
          
          // 统一处理带前缀的关键字的函数
          const processPrefixedToken = (regex: RegExp, prefix: string) => {
            text = text.replace(regex, (match, offset) => {
              // 检查这个位置是否已经被处理过
              const isProcessed = processedRanges.some(
                range => offset >= range.start && offset < range.end
              );
              
              if (isProcessed) {
                return match; // 返回原始文本，不做替换
              }
              
              // 获取不带前缀的token值
              const tokenValue = match.substring(prefix.length);
              
              // 记录处理过的范围
              processedRanges.push({
                start: offset,
                end: offset + match.length
              });
              
              // 使用HTML属性的标准格式，确保它们能够被正确解析
              return `<span class="font-bold text-blue-500 hover:underline cursor-pointer token-keyword" data-token="${tokenValue}" data-tweet-id="${tweet.id}" data-instance-id="${generateUniqueId()}">${match}</span>`;
            });
          };
          
          // 处理带前缀的关键字
          processPrefixedToken(dollarRegex, '$');
          processPrefixedToken(hashRegex, '#');
        } catch (e) {
          console.warn(`Error processing keyword "${token}" in tweet:`, e);
        }
      });
      
      // 处理额外的预定义前缀关键字列表
      PREFIXED_KEYWORDS.forEach(prefixedToken => {
        try {
          // 创建精确匹配的正则表达式
          const regex = new RegExp(prefixedToken, 'g');
          
          // 为每个token实例生成唯一ID，帮助调试和追踪
          const instanceId = generateUniqueId();
          
          // 将带前缀的关键字替换为可交互元素
          text = text.replace(regex, (match, offset) => {
            // 检查这个位置是否已经被处理过
            const isProcessed = processedRanges.some(
              range => offset >= range.start && offset < range.end
            );
            
            if (isProcessed) {
              return match; // 返回原始文本，不做替换
            }
            
            // 获取不带前缀的token值
            const tokenValue = match.startsWith('$') || match.startsWith('#') 
              ? match.substring(1) 
              : match;
            
            // 记录处理过的范围
            processedRanges.push({
              start: offset,
              end: offset + match.length
            });
            
            // 使用HTML属性的标准格式，确保它们能够被正确解析
            return `<span class="font-bold text-blue-500 hover:underline cursor-pointer token-keyword" data-token="${tokenValue}" data-tweet-id="${tweet.id}" data-instance-id="${instanceId}">${match}</span>`;
          });
        } catch (e) {
          console.warn(`Error processing prefixed keyword "${prefixedToken}" in tweet:`, e);
        }
      });
      
      // 在存入缓存前先清理文本
      const sanitizedText = sanitizeTweetText(text);
      formattedTextCache.current.set(tweet.id, sanitizedText);
      
      return sanitizedText;
    } catch (error) {
      console.error('Error formatting tweet text:', error, tweet);
      return tweet.full_text || tweet.text || ''; // 出错时返回原始文本
    }
  }, []);
  
  // 当组件卸载或推文查询更改时，清除文本格式化缓存
  useEffect(() => {
    return () => {
      clearFormattedTextCache();
    };
  }, [query, clearFormattedTextCache]);
  
  // 渲染媒体内容
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
  
  // 渲染引用推文
  const renderQuotedTweet = (tweet: Tweet) => {
    if (!tweet.quoted_tweet) return null;
    
    // 尝试隐藏引用推文的URL
    if (tweet.entities?.urls) {
      tweet.entities.urls.forEach(url => {
        if (url.expanded_url?.includes('/status/') && tweet.quoted_tweet) {
          // 这是一个引用推文链接，我们可以从文本中移除它
          const originalText = tweet.full_text || tweet.text || '';
          if (originalText) {
            // 保存修改结果到full_text和text字段
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

  // 更新按钮位置，确保在视口内可见
  const updateButtonPosition = useCallback((target: HTMLElement) => {
    if (!tokenButtonRef.current) return;
    
    const rect = target.getBoundingClientRect();
    const buttonHeight = 28; // 估计的按钮高度
    
    // 计算基础位置（在关键字下方）
    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX;
    
    // 检查是否超出视口底部
    const viewportHeight = window.innerHeight;
    if (top + buttonHeight > viewportHeight + window.scrollY) {
      // 如果超出底部，则将按钮放在关键字上方
      top = rect.top + window.scrollY - buttonHeight;
    }
    
    // 确保按钮不超出右侧边界
    const buttonWidth = 250; // 估计的按钮宽度
    const viewportWidth = window.innerWidth;
    if (left + buttonWidth > viewportWidth) {
      left = viewportWidth - buttonWidth - 10; // 10px边距
    }
    
    // 应用计算后的位置
    tokenButtonRef.current.style.top = `${top}px`;
    tokenButtonRef.current.style.left = `${left}px`;
    tokenButtonRef.current.style.display = 'flex'; // 确保按钮可见
    tokenButtonRef.current.style.position = 'fixed'; // 使用fixed定位，避免滚动影响
    tokenButtonRef.current.style.zIndex = '9999'; // 确保在最上层
  }, []);

  // 设置当前悬停的token元素
  const setCurrentHoveredToken = useCallback((element: HTMLElement | null) => {
    // 如果元素与当前高亮元素相同，则不做任何处理
    if (element === hoverElementRef) {
      return;
    }
    
    // 清除所有之前的高亮，仅在需要时进行DOM操作
    if (tweetContainerRef.current && hoverElementRef !== element) {
      if (hoverElementRef) {
        // 如果有之前的高亮元素，只需移除它的样式
        hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      }
    }
    
    // 更新引用
    setHoverElementRef(element);
    
    if (element) {
      // 高亮当前元素
      element.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
      
      const token = element.getAttribute('data-token');
      const tweetId = element.getAttribute('data-tweet-id');
      
      if (token && tweetId) {
        // 清理token值，确保没有HTML标签
        const cleanToken = token.replace(/<[^>]*>/g, '').trim();
        
        // 如果token和tweetId没有变化，避免状态更新
        if (!hoveredToken || hoveredToken.token !== cleanToken || hoveredToken.tweetId !== tweetId) {
          // 非生产环境下记录日志
          if (process.env.NODE_ENV !== 'production') {
            console.log(`设置悬停token: ${cleanToken}, tweetId: ${tweetId}`);
          }
          setHoveredToken({ token: cleanToken, tweetId });
        }
        
        // 更新按钮位置
        updateButtonPosition(element);
      }
    } else if (hoveredToken) {
      // 仅在有先前的hoveredToken时才更新状态
      setHoveredToken(null);
    }
  }, [hoveredToken, hoverElementRef, updateButtonPosition]);
  
  // 监听窗口大小变化，重新定位按钮
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
  
  // 监听tweets变化，确保在tweets更新后重新初始化token相关的处理
  useEffect(() => {
    // 如果tweets发生变化，可能是刷新或初始加载
    console.log(`tweets状态已更新，当前有 ${tweets.length} 条推文`);
    
    // 重置token相关状态
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // 短暂延迟后，确保DOM已更新，然后重新检查和初始化token元素
    if (tweets.length > 0) {
      // 使用requestAnimationFrame确保在DOM更新后再检查元素
      const timeoutId = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          if (tweetContainerRef.current) {
            // 使用更高效的选择器查找所有token关键字元素
            const tokenElements = tweetContainerRef.current.querySelectorAll('.token-keyword');
            
            // 仅在非生产环境记录日志
            if (process.env.NODE_ENV !== 'production') {
              console.log(`发现 ${tokenElements.length} 个token关键字元素`);
            }
          }
        });
      }, 200);
      
      return () => window.clearTimeout(timeoutId);
    }
  }, [tweets]);

  // 增强的Helper函数，用来移除HTML标签和转换HTML实体
  const stripHtmlTags = useCallback((html: string): string => {
    if (!html) return '';
    
    // 创建一个临时元素来解析HTML
    const tempElement = document.createElement('div');
    
    // 安全地设置HTML内容
    tempElement.innerHTML = html;
    
    // 获取纯文本内容（这会自动处理HTML实体）
    let plainText = tempElement.textContent || tempElement.innerText || '';
    
    // 移除多余的空格和换行
    plainText = plainText.replace(/\s+/g, ' ').trim();
    
    // 替换HTML实体
    plainText = plainText
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
      
    return plainText;
  }, []);

  // 处理token关键字点击事件
  const handleTokenClick = useCallback((token: string) => {
    if (onSendToChat) {
      console.log(`发送token查询到聊天: ${token}`);
      
      // 处理可能带有前缀的token
      let cleanToken = token;
      
      // 如果token中仍然包含$或#前缀，去除它们
      if (cleanToken.startsWith('$') || cleanToken.startsWith('#')) {
        cleanToken = cleanToken.substring(1);
      }
      
      // 发送处理过的纯文本到聊天
      onSendToChat(`show me the token ${cleanToken} information`);
    }
    
    setHoveredToken(null);
    setHoverElementRef(null);
    
    // 清除所有token元素的高亮样式
    if (tweetContainerRef.current) {
      const tokens = tweetContainerRef.current.querySelectorAll('.token-keyword');
      tokens.forEach(token => {
        token.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      });
    }
  }, [onSendToChat, stripHtmlTags]);
  
  // 修改处理推文容器内的鼠标事件函数，添加更多的防错处理
  const handleTweetContainerMouseEvent = useCallback((event: React.MouseEvent) => {
    // 判断事件类型
    if (event.type === 'mouseover') {
      const target = event.target as HTMLElement;
      
      // 检查是否悬停在token关键字上
      if (target && target.classList && target.classList.contains('token-keyword')) {
        const token = target.getAttribute('data-token');
        const tweetId = target.getAttribute('data-tweet-id');
        
        // 添加更详细的调试信息
        if (process.env.NODE_ENV !== 'production') {
          console.log('悬停元素:', target.outerHTML);
          console.log('获取到的属性:', { token, tweetId });
        }
        
        if (!token || !tweetId) {
          // 仅在开发环境记录警告
          if (process.env.NODE_ENV !== 'production') {
            console.warn('token关键字元素缺少必要的属性:', {
              element: target.outerHTML,
              token,
              tweetId
            });
          }
          
          // 尝试从内部文本内容推断token值
          const innerText = target.innerText || target.textContent;
          if (innerText && TOKEN_KEYWORDS.includes(innerText)) {
            // 如果内部文本与某个关键字匹配，则使用它作为token
            const inferredToken = innerText;
            const randomTweetId = `inferred-${Date.now()}`;
            
            console.log('已从内容中推断token:', inferredToken);
            
            // 使用推断的值继续处理
            handleInferredToken(target, inferredToken, randomTweetId);
            return;
          }
          
          return;
        }
        
        // 清理token值，确保没有HTML标签
        const cleanToken = token.replace(/<[^>]*>/g, '').trim();
        
        // 检查是否与上次处理的是同一个token和元素，如果是则跳过处理
        if (lastHandledTokenRef.current && 
            lastHandledTokenRef.current.token === cleanToken && 
            lastHandledTokenRef.current.element === target) {
          return;
        }
        
        // 清除之前的防抖计时器
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        
        // 创建新的防抖计时器，延迟处理悬停事件
        debounceTimerRef.current = window.setTimeout(() => {
          // 只在非生产环境中打印日志，使用!== 'production'而不是=== 'development'
          if (process.env.NODE_ENV !== 'production') {
            console.log('鼠标悬停在token关键字上:', cleanToken);
          }
          
          // 更新最后处理的token引用
          lastHandledTokenRef.current = {token: cleanToken, element: target};
          
          // 设置当前悬停的token
          setCurrentHoveredToken(target);
          
          // 手动更新按钮位置，确保按钮显示
          if (tokenButtonRef.current && hoveredToken) {
            updateButtonPosition(target);
            tokenButtonRef.current.style.display = 'flex'; // 确保按钮可见
          }
        }, 100); // 增加延迟到100毫秒，降低触发频率
      }
    }
  }, [setCurrentHoveredToken, updateButtonPosition, hoveredToken]);
  
  // 处理推断的token
  const handleInferredToken = useCallback((element: HTMLElement, token: string, tweetId: string) => {
    // 清理token值，确保没有HTML标签
    const cleanToken = token.replace(/<[^>]*>/g, '').trim();
    
    // 更新最后处理的token引用
    lastHandledTokenRef.current = {token: cleanToken, element};
    
    // 设置当前悬停的token
    setHoveredToken({ token: cleanToken, tweetId });
    setHoverElementRef(element);
    
    // 高亮当前元素
    element.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
    
    // 更新按钮位置
    updateButtonPosition(element);
    
    // 确保按钮可见
    if (tokenButtonRef.current) {
      tokenButtonRef.current.style.display = 'flex';
    }
  }, [updateButtonPosition]);

  // 处理推文容器内的鼠标离开事件
  const handleTweetContainerMouseLeave = useCallback(() => {
    // 清除防抖计时器
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 重置上次处理的token引用
    lastHandledTokenRef.current = null;
    
    // 使用延时操作，避免鼠标从token移动到按钮时触发按钮消失
    setTimeout(() => {
      // 检查鼠标是否位于按钮上
      if (tokenButtonRef.current && document.activeElement !== tokenButtonRef.current) {
        // 如果没有焦点在按钮上，则隐藏令牌提示
        if (!hoveredToken) {
          setCurrentHoveredToken(null);
        }
      }
    }, 50);
  }, [hoveredToken, setCurrentHoveredToken]);

  // 添加对按钮鼠标离开事件的处理
  const handleButtonMouseLeave = useCallback(() => {
    // 当鼠标离开按钮时，如果不是点击操作，则在短暂延迟后隐藏按钮
    setTimeout(() => {
      if (tokenButtonRef.current && document.activeElement !== tokenButtonRef.current) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // 清除高亮样式
        if (hoverElementRef) {
          hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
        }
      }
    }, 100);
  }, [hoverElementRef]);

  // 添加全局点击事件处理
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // 如果点击位置不是token元素和token按钮，则清除悬停状态
      const target = e.target as Node;
      if (
        tokenButtonRef.current && 
        !tokenButtonRef.current.contains(target) && 
        hoverElementRef && 
        !hoverElementRef.contains(target)
      ) {
        setHoveredToken(null);
        setHoverElementRef(null);
        
        // 清除高亮样式
        hoverElementRef.classList.remove('bg-yellow-200', 'dark:bg-yellow-800/60');
      }
    };
    
    document.addEventListener('click', handleGlobalClick);
    
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [hoverElementRef]);

  // 添加一个effect来清理组件卸载时的计时器
  useEffect(() => {
    return () => {
      // 组件卸载时清理防抖计时器
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // 处理搜索表单提交
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证搜索关键字不为空
    if (!searchQuery.trim()) {
      // 如果为空，恢复默认关键字
      setSearchQuery('aptos');
      setTimeout(() => fetchTweets(), 0);
      return;
    }
    
    fetchTweets();
  };
  
  // 处理回车键提交
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
          <h2 className="font-semibold">Find your alpha Tweets</h2>
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
          
          <div 
            ref={tweetContainerRef}
            className="flex-1 overflow-y-auto p-2"
            onMouseOver={handleTweetContainerMouseEvent}
            onMouseLeave={handleTweetContainerMouseLeave}
          >
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="mb-4 p-3 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-5/6 mb-1" />
                  <Skeleton className="h-4 w-4/6" />
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
          
          {/* Token悬浮按钮 */}
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
                // 当鼠标进入按钮时，保持按钮显示状态
                if (hoverElementRef) {
                  hoverElementRef.classList.add('bg-yellow-200', 'dark:bg-yellow-800/60');
                }
              }}
              onMouseLeave={handleButtonMouseLeave}
              onClick={() => {
                const tweet = tweets.find(t => t.id === hoveredToken.tweetId);
                if (tweet) {
                  // 使用token值进行查询
                  handleTokenClick(hoveredToken.token);
                }
              }}
            >
              <Info className="h-4 w-4 mr-1" />
              Show me the token {stripHtmlTags(hoveredToken.token)} information
            </button>
          )}
        </>
      )}
    </div>
  );
} 