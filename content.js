(() => {
  'use strict';

  let lastRightClickedImg = '';

  const extractImageUrl = e => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];

    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;

      if (node.tagName === 'IMG') {
        const src = node.currentSrc || node.src || node.getAttribute('src');
        if (src) return src;
      }

      if (node.shadowRoot) {
        const shadowImg = node.shadowRoot.querySelector('img');
        if (shadowImg && (shadowImg.currentSrc || shadowImg.src)) {
          return shadowImg.currentSrc || shadowImg.src;
        }
      }

      const bg = getComputedStyle(node).backgroundImage;
      if (bg && bg !== 'none' && bg.startsWith('url(')) {
        const match = bg.match(/^url\(["']?(.*?)["']?\)$/);
        if (match && match[1] && !match[1].startsWith('data:image/svg+xml')) {
          return match[1];
        }
      }
    }

    const imagusHost = document.querySelector('imagus-popup, #imagus');
    if (imagusHost) {
      const hoveredLink = document.querySelector('a:hover[href]');
      if (hoveredLink && /\.(jpe?g|png|gif|webp|avif|bmp|ico)(\?.*)?$/i.test(hoveredLink.href)) {
        return hoveredLink.href;
      }
    }

    return '';
  };

  addEventListener('contextmenu', e => {
    const found = extractImageUrl(e);
    if (found) {
      lastRightClickedImg = found;
    } else if (!e.target?.closest?.('imagus-popup, #imagus')) {
      lastRightClickedImg = '';
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'GET_TARGET_IMAGE') return;

    let targetImg = lastRightClickedImg;
    if (!targetImg && msg.fallbackLink && /\.(jpe?g|png|gif|webp|avif|bmp|ico)(\?.*)?$/i.test(msg.fallbackLink)) {
      targetImg = msg.fallbackLink;
    }
    if (!targetImg) {
      targetImg = prompt('Enter image URL to encode:') || '';
    }

    sendResponse({ url: targetImg });
  });
})();
