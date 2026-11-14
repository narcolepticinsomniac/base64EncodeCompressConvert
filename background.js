const MENU_ID = 'encode-image-base64';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'base64EncodeCompressConvert',
    contexts: ['image', 'page', 'link']
  });
});

const openEncoder = (imageUrl = '') => {
  const base = chrome.runtime.getURL('encoder.html');
  const dest = imageUrl ? `${base}?url=${encodeURIComponent(imageUrl)}` : base;
  chrome.tabs.create({ url: dest, active: true });
};

chrome.action.onClicked.addListener(() => openEncoder());

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  if (info.srcUrl) {
    openEncoder(info.srcUrl);
    return;
  }

  if (tab?.id) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_TARGET_IMAGE',
        fallbackLink: info.linkUrl || ''
      });
      if (response?.url) {
        openEncoder(response.url);
        return;
      }
    } catch {
    }
  }

  openEncoder();
});
