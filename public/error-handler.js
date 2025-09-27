/* global window */

// Global error handling for chunk loading and runtime errors
(function () {
  'use strict';

  // Handle chunk loading errors
  function handleChunkError(event) {
    const target = event.target || event.srcElement;

    if (target && target.tagName) {
      const tagName = target.tagName.toLowerCase();
      const src = target.src || target.href;

      // Handle script/link loading errors
      if ((tagName === 'script' || tagName === 'link') && src) {
        console.warn('[Chunk Error] Failed to load:', src);

        // Try to reload the resource once
        if (!target.dataset.retried) {
          target.dataset.retried = 'true';

          // Add timestamp to bypass cache
          const separator = src.includes('?') ? '&' : '?';
          const newSrc = `${src}${separator}_retry=${Date.now()}`;

          if (tagName === 'script') {
            const newScript = document.createElement('script');
            newScript.src = newSrc;
            newScript.async = target.async;
            newScript.defer = target.defer;
            document.head.appendChild(newScript);
          } else if (tagName === 'link') {
            const newLink = document.createElement('link');
            newLink.rel = target.rel;
            newLink.href = newSrc;
            document.head.appendChild(newLink);
          }
        } else {
          // If retry failed, trigger global error
          if (window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent('globalError', {
                detail: { message: '资源加载失败，请刷新页面重试' },
              })
            );
          }
        }
      }
    }
  }

  // Handle unhandled promise rejections
  function handleUnhandledRejection(event) {
    console.error('[Unhandled Promise Rejection]', event.reason);

    // Check if it's a chunk loading error
    if (event.reason && event.reason.message) {
      const message = event.reason.message.toLowerCase();
      if (message.includes('chunk') || message.includes('loading')) {
        if (window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('globalError', {
              detail: { message: '页面资源加载失败，请刷新页面' },
            })
          );
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
          detail: { message: '页面出现异常，请稍后重试' },
        })
      );
    }
  }

  // Handle regular JavaScript errors
  function handleError(event) {
    console.error('[JavaScript Error]', event.error || event.message);

    if (event.error && event.error.message) {
      const message = event.error.message.toLowerCase();
      if (message.includes('chunk') || message.includes('loading')) {
        if (window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('globalError', {
              detail: { message: '页面资源加载失败，请刷新页面' },
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

    if (window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '页面出现异常，请稍后重试' },
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
})();