let debugTabId = null;
let urlPattern = '';
// requestId -> { url, method, headers, postData, extraHeaders, hasBase, hasExtra }
const pending = {};

// ── Debugger 事件处理 ──────────────────────────────────────────────────────────
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
  buildCurl(req);
  stopListening();
}

// ── 生成 curl ─────────────────────────────────────────────────────────────────
function buildCurl(req) {
  // extraHeaders 包含完整 cookie，优先使用
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
  if (req.method && req.method !== 'GET') {
    curl += ` \\\n  -X ${req.method}`;
  }
  if (headerLines.length) {
    curl += ` \\\n${headerLines.join(' \\\n')}`;
  }
  if (cookieStr) {
    curl += ` \\\n  -b '${cookieStr}'`;
  }
  if (req.postData) {
    curl += ` \\\n  --data-raw '${req.postData}'`;
  }

  document.getElementById('curlOutput').value = curl;
  setStatus('✅ 捕获成功，curl 已生成', 'success');
  setListeningUI(false);
}

// ── 启动 / 停止监听 ────────────────────────────────────────────────────────────
async function startListening() {
  const keyword = document.getElementById('urlKeyword').value.trim();
  if (!keyword) {
    setStatus('请先输入接口关键词', 'error');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('binance.com')) {
    setStatus('❌ 请先切换到币安页面再开始监听', 'error');
    return;
  }

  urlPattern = keyword.toLowerCase();
  debugTabId = tab.id;
  Object.keys(pending).forEach((k) => delete pending[k]);

  try {
    // 先尝试清理上次残留的 debugger
    try { await chrome.debugger.detach({ tabId: debugTabId }); } catch (_) {}
    await chrome.debugger.attach({ tabId: debugTabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId: debugTabId }, 'Network.enable', {});
    chrome.debugger.onEvent.addListener(onDebugEvent);
    setListeningUI(true);
    setStatus('⏳ 正在监听，请在币安页面触发对应请求...', 'pulse');
  } catch (e) {
    setStatus(`❌ 启动失败: ${e.message}`, 'error');
    debugTabId = null;
  }
}

async function stopListening() {
  chrome.debugger.onEvent.removeListener(onDebugEvent);
  if (debugTabId !== null) {
    try { await chrome.debugger.detach({ tabId: debugTabId }); } catch (_) {}
    debugTabId = null;
  }
  setListeningUI(false);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setListeningUI(on) {
  const btn = document.getElementById('listenBtn');
  btn.textContent = on ? '停止监听' : '开始监听';
  btn.className = on ? 'listening' : '';
}

function setStatus(msg, cls = '') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = cls;
}

// ── 事件绑定 ──────────────────────────────────────────────────────────────────
document.getElementById('listenBtn').addEventListener('click', () => {
  if (debugTabId !== null) {
    stopListening();
    setStatus('已停止监听', '');
  } else {
    startListening();
  }
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const curl = document.getElementById('curlOutput').value;
  if (!curl) return;
  navigator.clipboard.writeText(curl).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ 已复制!';
    setTimeout(() => (btn.textContent = '复制 curl 命令'), 1500);
  });
});

// popup 关闭时自动 detach
window.addEventListener('unload', () => {
  if (debugTabId !== null) {
    chrome.debugger.detach({ tabId: debugTabId });
  }
});
