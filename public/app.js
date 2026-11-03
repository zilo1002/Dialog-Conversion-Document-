const $ = (sel) => document.querySelector(sel);

let mode = 'url';
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $('#pane-url').classList.toggle('hidden', mode !== 'url');
    $('#pane-paste').classList.toggle('hidden', mode !== 'paste');
  });
});

const today = new Date();
$('#paste-date').value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function setStatus(kind, text) {
  const el = $('#status');
  el.className = `status ${kind}`;
  el.textContent = text;
  el.classList.toggle('hidden', false);
}

function clearStatus() {
  $('#status').classList.add('hidden');
}

function render(result) {
  $('#result').classList.remove('hidden');
  $('#r-title').textContent = result.title;
  const chips = [];
  chips.push(`${result.messageCount} 条消息`);
  chips.push(`${result.days.length} 个日期`);
  result.days.forEach((d) => chips.push(`${d.label}（${d.count}）`));
  if (result.modelLabel) chips.push(result.modelLabel);
  chips.push(`${result.timeSource === 'message' ? '逐条时间' : '按日归档'}`);
  const meta = chips.map((c) => `<span>${escapeHtml(c)}</span>`);
  (result.warnings || []).forEach((w) => meta.push(`<span class="warn">${escapeHtml(w)}</span>`));
  $('#r-meta').innerHTML = meta.join('');
  $('#preview').src = result.previewUrl;
  $('#dl-html').href = result.download.html;
  $('#dl-html').setAttribute('download', result.filenames.html);
  $('#dl-md').href = result.download.markdown;
  $('#dl-md').setAttribute('download', result.filenames.markdown);
  fetch(`/api/result/${result.id}/markdown`)
    .then((r) => r.text())
    .then((t) => { $('#md-preview').textContent = t.length > 20000 ? `${t.slice(0, 20000)}\n\n…（下载后可看完整内容）` : t; })
    .catch(() => { $('#md-preview').textContent = '（Markdown 预览加载失败，可直接点下载）'; });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function post(url, body, button) {
  clearStatus();
  button.disabled = true;
  setStatus('loading', '正在抓取并解析，长对话可能要几秒……');
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const msg = data.message || `请求失败（HTTP ${res.status}）`;
      setStatus('error', `${msg}\n如果抓不到，切到「粘贴全文」把内容贴进来，同样能生成文档。`);
      return;
    }
    setStatus('loading', '生成好了。');
    setTimeout(clearStatus, 1200);
    render(data);
  } catch (err) {
    setStatus('error', `网络错误：${err.message}。请确认本地服务还在运行。`);
  } finally {
    button.disabled = false;
  }
}

$('#go-url').addEventListener('click', () => {
  const url = $('#url').value.trim();
  if (!url) { setStatus('error', '先粘贴一条 DeepSeek 分享链接。'); return; }
  post('/api/convert', { url, tz: $('#tz').value }, $('#go-url'));
});

$('#go-paste').addEventListener('click', () => {
  const text = $('#text').value;
  if (!text.trim()) { setStatus('error', '先把对话全文贴进来。'); return; }
  post('/api/convert/paste', {
    text,
    title: $('#paste-title').value.trim(),
    date: $('#paste-date').value,
    tz: $('#tz-paste').value,
  }, $('#go-paste'));
});
