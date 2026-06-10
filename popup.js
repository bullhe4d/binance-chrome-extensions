const KEYWORD = 'get-wallet-asset';

// ── 初始化：恢复上次捕获结果 ──────────────────────────────────────────────────
async function init() {
  const { listenState, capturedCurl } = await chrome.storage.local.get(['listenState', 'capturedCurl']);

  if (capturedCurl) {
    document.getElementById('curlOutput').value = capturedCurl;
    setStatus('✅ 捕获成功，curl 已生成', 'success');
  }

  if (listenState?.active) {
    setListeningUI(true);
    setStatus('⏳ 正在刷新页面并监听...', 'pulse');
  }
}

// ── 监听 background 捕获结果（popup 打开期间实时更新）────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.capturedCurl) {
    document.getElementById('curlOutput').value = changes.capturedCurl.newValue || '';
    setStatus('✅ 捕获成功，curl 已生成', 'success');
    setListeningUI(false);
  }
  if (changes.listenState && !changes.listenState.newValue?.active) {
    setListeningUI(false);
  }
});

// ── 开始 / 停止按钮 ────────────────────────────────────────────────────────────
document.getElementById('listenBtn').addEventListener('click', async () => {
  const { listenState } = await chrome.storage.local.get('listenState');

  if (listenState?.active) {
    await chrome.runtime.sendMessage({ type: 'STOP_LISTEN' });
    setListeningUI(false);
    setStatus('已停止监听', '');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('binance.com')) {
    showToast('❌ 请先切换到币安页面再开始监听');
    return;
  }

  const resp = await chrome.runtime.sendMessage({
    type: 'START_LISTEN',
    tabId: tab.id,
    keyword: KEYWORD,
  });

  if (resp.ok) {
    setListeningUI(true);
    setStatus('⏳ 正在刷新页面并监听...', 'pulse');
    chrome.tabs.reload(tab.id);
  } else {
    showToast(`❌ 启动失败: ${resp.error}`);
  }
});

// ── 清空按钮 ───────────────────────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('curlOutput').value = '';
  setStatus('', '');
  chrome.storage.local.remove('capturedCurl');
  chrome.action.setBadgeText({ text: '' });
});

// ── 复制按钮 ───────────────────────────────────────────────────────────────────
document.getElementById('copyBtn').addEventListener('click', () => {
  const curl = document.getElementById('curlOutput').value;
  if (!curl) return;
  navigator.clipboard.writeText(curl).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ 已复制!';
    setTimeout(() => (btn.textContent = '复制 curl 命令'), 1500);
  });
});

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

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

init();
