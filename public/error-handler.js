/* global window */

// Global error handling for chunk loading and runtime errors
(function () {
  'use strict';

  let retryAttempts = new Map(); // Track retry attempts for each resource

  // Handle chunk loading errors
  function handleChunkError(event) {
    const target = event.target || event.srcElement;

    if (target && target.tagName) {
      const tagName = target.tagName.toLowerCase();
      const src = target.src || target.href;

      // Handle script/link loading errors
      if ((tagName === 'script' || tagName === 'link') && src) {
        console.warn('[Chunk Error] Failed to load:', src);

        const retryKey = src;
        const currentRetries = retryAttempts.get(retryKey) || 0;

        // Try to reload the resource up to 2 times
        if (currentRetries < 2) {
          retryAttempts.set(retryKey, currentRetries + 1);

          // Add timestamp to bypass cache
          const separator = src.includes('?') ? '&' : '?';
          const newSrc = `${src}${separator}_retry=${Date.now()}&attempt=${currentRetries + 1}`;

          console.info(`[Chunk Retry] Attempting retry ${currentRetries + 1}/2 for:`, newSrc);

          if (tagName === 'script') {
            const newScript = document.createElement('script');
            newScript.src = newSrc;
            newScript.async = target.async;
            newScript.defer = target.defer;
            newScript.crossOrigin = target.crossOrigin;

            // Add retry success handler
            newScript.onload = function() {
              console.info('[Chunk Retry] Successfully loaded:', newSrc);
            };

            // Add retry error handler
            newScript.onerror = function() {
              console.warn('[Chunk Retry] Retry failed for:', newSrc);
            };

            document.head.appendChild(newScript);
          } else if (tagName === 'link') {
            const newLink = document.createElement('link');
            newLink.rel = target.rel;
            newLink.href = newSrc;
            newLink.crossOrigin = target.crossOrigin;

            newLink.onload = function() {
              console.info('[Chunk Retry] Successfully loaded:', newSrc);
            };

            newLink.onerror = function() {
              console.warn('[Chunk Retry] Retry failed for:', newSrc);
            };

            document.head.appendChild(newLink);
          }
        } else {
          // If retry failed multiple times, show error and suggest page refresh
          console.error('[Chunk Error] Max retries exceeded for:', src);

          if (window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent('globalError', {
                detail: {
                  message: '页面资源加载失败，建议刷新页面重试'
                },
              })
            );
          }
        }
      }
    }
  }

  // Enhanced unhandled promise rejection handler
  function handleUnhandledRejection(event) {
    console.error('[Unhandled Promise Rejection]', event.reason);

    // Check if it's a chunk loading error
    if (event.reason && event.reason.message) {
      const message = event.reason.message.toLowerCase();
      if (message.includes('chunk') || message.includes('loading')) {
        console.warn('[Chunk Promise] Handling chunk loading promise rejection');

        // Try to extract chunk info and reload
        const chunkMatch = event.reason.message.match(/loading chunk (\d+)/i);
        if (chunkMatch) {
          const chunkId = chunkMatch[1];
          console.info(`[Chunk Promise] Attempting to handle chunk ${chunkId} failure`);

          // Trigger a page reload as fallback for promise-based chunk errors
          setTimeout(() => {
            if (window.dispatchEvent) {
              window.dispatchEvent(
                new CustomEvent('globalError', {
                  detail: {
                    message: `Chunk ${chunkId} 加载失败，正在尝试恢复...`
                  },
                })
              );
            }

            // For severe chunk errors, consider a delayed page reload
            setTimeout(() => {
              const shouldReload = window.confirm('页面遇到资源加载问题，是否刷新页面？');
              if (shouldReload) {
                window.location.reload();
              }
            }, 3000);
          }, 1000);
        }

        // Prevent the default unhandled rejection behavior
        event.preventDefault();
        return;
      }
    }

    // For other errors, show a generic message
    if (window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '应用遇到异常，请稍后重试' },
        })
      );
    }
  }

  // Enhanced JavaScript error handler
  function handleError(event) {
    console.error('[JavaScript Error]', event.error || event.message);

    if (event.error && event.error.message) {
      const message = event.error.message.toLowerCase();

      // Handle chunk loading errors
      if (message.includes('chunk') || message.includes('loading')) {
        console.warn('[JS Error] Chunk-related error detected');

        if (window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('globalError', {
              detail: { message: '页面组件加载异常，正在尝试恢复...' },
            })
          );
        }
        return;
      }

      // Handle React errors
      if (message.includes('minified react error')) {
        console.warn('[React Error] Minified React error detected');

        if (window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('globalError', {
              detail: { message: '页面渲染异常，建议刷新页面' },
            })
          );
        }
        return;
      }
    }

    // Don't show error for development mode console messages
    if (event.message && event.message.includes('console.')) {
      return;
    }

    // Generic error handling
    if (window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '页面运行异常，请稍后重试' },
        })
      );
    }
  }

  // Set up error listeners
  document.addEventListener('error', handleChunkError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('error', handleError);

  // Service worker registration error handling
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('error', function(event) {
      console.warn('[Service Worker Error]', event);
    });
  }

  // Expose retry stats for debugging
  window.__chunkRetryStats = function() {
    console.table(Array.from(retryAttempts.entries()).map(([url, attempts]) => ({
      url: url.substring(0, 80) + (url.length > 80 ? '...' : ''),
      attempts
    })));
  };

  console.info('[Error Handler] Enhanced chunk error handling loaded');
})();