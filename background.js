// ── 状态图标（用 OffscreenCanvas 在 BA 图标右下角画小圆点）─────────────────────
const DOT_COLORS = {
  idle:      '#e53935',
  listening: '#f0b90b',
  captured:  '#4caf50',
};

function drawIcon(size, dotColor) {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext('2d');

  // 黑色背景
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // 黄色 "BA" 文字
  ctx.fillStyle = '#f0b90b';
  ctx.font = `bold ${Math.round(size * 0.42)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BA', size / 2, size / 2);

  // 右下角状态小圆点
  const r = Math.max(3, Math.round(size * 0.16));
  const cx = size - r - 1, cy = size - r - 1;
  ctx.fillStyle = '#111'; // 白边用深色分隔
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

async function setStatusIcon(state) {
  const color = DOT_COLORS[state] || DOT_COLORS.idle;
  await chrome.action.setIcon({
    imageData: { 16: drawIcon(16, color), 48: drawIcon(48, color) },
  });
  chrome.action.setBadgeText({ text: '' }); // 清掉旧 badge
}

// 启动时根据 storage 恢复正确状态
async function restoreIcon() {
  const { capturedCurl, listenState } = await chrome.storage.local.get(['capturedCurl', 'listenState']);
  if (listenState?.active)   await setStatusIcon('listening');
  else if (capturedCurl)     await setStatusIcon('captured');
  else                       await setStatusIcon('idle');
}
chrome.runtime.onInstalled.addListener(restoreIcon);
chrome.runtime.onStartup.addListener(restoreIcon);
restoreIcon();

// ── Debugger ──────────────────────────────────────────────────────────────────
let debugTabId = null;
let urlPattern = '';
const pending = {};

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
  chrome.storage.local.set({ capturedCurl: buildCurl(req), capturedAt: Date.now() });
  setStatusIcon('captured');
  stopListening();
}

function buildCurl(req) {
  const headers = req.extraHeaders || req.headers;
  let cookieStr = '';
  const headerLines = [];
  for (const [k, v] of Object.entries(headers)) {
    if (k.startsWith(':')) continue;
    if (k.toLowerCase() === 'cookie') cookieStr = v;
    else headerLines.push(`  -H '${k}: ${v}'`);
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
  setStatusIcon('listening');
  chrome.storage.local.set({ listenState: { active: true, keyword, tabId } });
}

async function stopListening() {
  chrome.debugger.onEvent.removeListener(onDebugEvent);
  if (debugTabId !== null) {
    try { await chrome.debugger.detach({ tabId: debugTabId }); } catch (_) {}
    debugTabId = null;
  }
  setStatusIcon('idle');
  chrome.storage.local.set({ listenState: { active: false } });
}

// ── 消息处理 ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RESET_BADGE') {
    setStatusIcon('idle');
    sendResponse({ ok: true });
    return;
  }
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
