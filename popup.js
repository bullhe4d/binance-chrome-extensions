const TARGET_URL =
  'https://www.binance.com/bapi/asset/v2/public/asset/asset/get-all-asset';

document.getElementById('btn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const curlOutput = document.getElementById('curlOutput');
  status.textContent = '正在获取...';
  status.className = '';

  try {
    // 1. 获取所有 binance Cookie（含 httpOnly）
    const cookies = await chrome.cookies.getAll({ domain: '.binance.com' });
    if (cookies.length === 0) {
      status.textContent = '❌ 未找到 Cookie，请先登录币安';
      status.className = 'error';
      return;
    }
    const cookieMap = {};
    cookies.forEach((c) => (cookieMap[c.name] = c.value));

    // 2. 读取 background 捕获的真实请求头
    const { lastHeaders } = await chrome.storage.local.get('lastHeaders');
    const cap = lastHeaders?.headers || {};
    const capturedAge = lastHeaders
      ? Math.round((Date.now() - lastHeaders.ts) / 1000)
      : null;

    // 3. 组装 headers（优先用捕获值，fallback 到 cookie / 静态值）
    const traceId = crypto.randomUUID();
    const headers = [
      ['accept', cap['accept'] || '*/*'],
      ['accept-language', cap['accept-language'] || 'zh-CN,zh;q=0.9,en;q=0.8'],
      ['bnc-level', cap['bnc-level'] || '0'],
      ['bnc-location', cap['bnc-location'] || cookieMap['BNC-Location'] || 'CN'],
      ['bnc-time-zone', cap['bnc-time-zone'] || Intl.DateTimeFormat().resolvedOptions().timeZone],
      ['bnc-uuid', cap['bnc-uuid'] || cookieMap['bnc-uuid'] || ''],
      ['cache-control', 'no-cache'],
      ['clienttype', cap['clienttype'] || 'web'],
      ['content-type', cap['content-type'] || 'application/json'],
      ...(cap['csrftoken'] ? [['csrftoken', cap['csrftoken']]] : []),
      ...(cap['device-info'] ? [['device-info', cap['device-info']]] : []),
      ['fvideo-id', cap['fvideo-id'] || cookieMap['BNC_FV_KEY'] || ''],
      ...(cap['fvideo-token'] ? [['fvideo-token', cap['fvideo-token']]] : []),
      ['lang', cap['lang'] || 'zh-CN'],
      ['pragma', 'no-cache'],
      ['priority', cap['priority'] || 'u=1, i'],
      ...(cap['referer'] ? [['referer', cap['referer']]] : []),
      ['sec-ch-ua', cap['sec-ch-ua'] || '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"'],
      ['sec-ch-ua-mobile', '?0'],
      ['sec-ch-ua-platform', cap['sec-ch-ua-platform'] || '"macOS"'],
      ['sec-fetch-dest', 'empty'],
      ['sec-fetch-mode', 'cors'],
      ['sec-fetch-site', 'same-origin'],
      ['user-agent', cap['user-agent'] || navigator.userAgent],
      ...(cap['x-passthrough-token'] ? [['x-passthrough-token', cap['x-passthrough-token']]] : []),
      ['x-trace-id', traceId],
      ['x-ui-request-trace', traceId],
    ];

    // 4. 拼 cookie 字符串（-b 参数，来自 chrome.cookies 最完整）
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const headerLines = headers.map(([k, v]) => `  -H '${k}: ${v}'`).join(' \\\n');
    curlOutput.value = `curl '${TARGET_URL}' \\\n${headerLines} \\\n  -b '${cookieStr}'`;

    if (!cap['csrftoken']) {
      status.textContent =
        '⚠️ 动态 token 未捕获，请先在币安页面随便点一下（触发 API 请求），再回来重新生成';
      status.className = '';
    } else {
      const ageStr = capturedAge !== null ? `，${capturedAge} 秒前捕获` : '';
      status.textContent = `✅ 生成成功，含 ${cookies.length} 个 Cookie${ageStr}`;
      status.className = 'success';
    }
  } catch (err) {
    status.textContent = `❌ 错误: ${err.message}`;
    status.className = 'error';
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
