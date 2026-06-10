let debugTabId = null;
let urlPattern = '';
const pending = {};

// ── Debugger 事件 ─────────────────────────────────────────────────────────────
function onDebugEvent(source, method, params) {
  if (source.tabId !== debugTabId) return;

  if (method === 'Network.requestWillBeSent') {
    const { requestId, request } = params;
    if (!request.url.toLowerCase().includes(urlPattern)) return;
    pending[requestId] = pending[requestId] || {};
    Object.assign(pending[requestId], {
      url: request.url,
      method: request.method,
      headers: request.headers,
      postData: request.postData || null,
      hasBase: true,
    });
    tryComplete(requestId);
  }

  if (method === 'Network.requestWillBeSentExtraInfo') {
    const { requestId, headers } = params;
    pending[requestId] = pending[requestId] || {};
    Object.assign(pending[requestId], { extraHeaders: headers, hasExtra: true });
    tryComplete(requestId);
  }
}

function tryComplete(requestId) {
  const req = pending[requestId];
  if (!req?.hasBase || !req?.hasExtra) return;
  delete pending[requestId];

  const curl = buildCurl(req);
  chrome.storage.local.set({ capturedCurl: curl, capturedAt: Date.now() });

  // 图标绿色对勾提示已捕获
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });

  stopListening();
}

function buildCurl(req) {
  const headers = req.extraHeaders || req.headers;
  let cookieStr = '';
  const headerLines = [];

  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'cookie') {
      cookieStr = v;
    } else {
      headerLines.push(`  -H '${k}: ${v}'`);
    }
  }

  let curl = `curl '${req.url}'`;
  if (req.method && req.method !== 'GET') curl += ` \\\n  -X ${req.method}`;
  if (headerLines.length) curl += ` \\\n${headerLines.join(' \\\n')}`;
  if (cookieStr) curl += ` \\\n  -b '${cookieStr}'`;
  if (req.postData) curl += ` \\\n  --data-raw '${req.postData}'`;

  return curl;
}

async function startListening(tabId, keyword) {
  urlPattern = keyword.toLowerCase();
  debugTabId = tabId;
  Object.keys(pending).forEach((k) => delete pending[k]);

  try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  await chrome.debugger.attach({ tabId }, '1.3');
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {});
  chrome.debugger.onEvent.addListener(onDebugEvent);

  chrome.action.setBadgeText({ text: '●' });
  chrome.action.setBadgeBackgroundColor({ color: '#f0b90b' });
  chrome.storage.local.set({ listenState: { active: true, keyword, tabId } });
}

async function stopListening() {
  chrome.debugger.onEvent.removeListener(onDebugEvent);
  if (debugTabId !== null) {
    try { await chrome.debugger.detach({ tabId: debugTabId }); } catch (_) {}
    debugTabId = null;
  }
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.local.set({ listenState: { active: false } });
}

// ── 接收 popup 指令 ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_LISTEN') {
    startListening(msg.tabId, msg.keyword)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'STOP_LISTEN') {
    stopListening().then(() => sendResponse({ ok: true }));
    return true;
  }
});
