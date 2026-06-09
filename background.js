// 拦截所有 binance.com /bapi/ 请求，捕获真实请求头
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = {};
    (details.requestHeaders || []).forEach((h) => {
      headers[h.name.toLowerCase()] = h.value;
    });
    // 只保留包含关键 token 的请求（过滤掉静态资源）
    if (!headers['bnc-uuid'] && !headers['csrftoken'] && !headers['fvideo-id']) return;
    chrome.storage.local.set({
      lastHeaders: { headers, url: details.url, ts: Date.now() },
    });
  },
  { urls: ['https://*.binance.com/bapi/*'] },
  ['requestHeaders']
);
