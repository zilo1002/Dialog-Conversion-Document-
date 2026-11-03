const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const TZS = [
  ['Asia/Shanghai', '北京时间'],
  ['UTC', 'UTC'],
  ['Asia/Tokyo', '东京'],
  ['Europe/London', '伦敦'],
  ['America/New_York', '纽约'],
  ['Australia/Sydney', '悉尼'],
];
for (const sel of ['#tz', '#tz-paste']) {
  $(sel).innerHTML = TZS.map(([v, l]) => `<option value="${v}">${v}（${l}）</option>`).join('');
}

let current = null;
let archiveItems = [];

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showView(name) {
  for (const v of ['home', 'result', 'archive']) $(`#view-${v}`).classList.toggle('hidden', v !== name);
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0 });
}

function setStatus(kind, text) {
  const el = $('#status');
  el.className = `status ${kind}`;
  el.textContent = text;
  el.classList.remove('hidden');
}
const clearStatus = () => $('#status').classList.add('hidden');

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2200);
}

function chipsFor(data) {
  const chips = [];
  if (data.sourceLabel) chips.push(`<span class="chip src">${escapeHtml(data.sourceLabel)}</span>`);
  chips.push(`<span class="chip">${data.messageCount} 条消息</span>`);
  chips.push(`<span class="chip">${(data.days || []).length} 个日期</span>`);
  if (data.modelLabel) chips.push(`<span class="chip">${escapeHtml(data.modelLabel)}</span>`);
  if (data.timeSource === 'message') chips.push('<span class="chip">逐条时间</span>');
  else if (data.timeSource === 'day') chips.push('<span class="chip">按日归档</span>');
  else chips.push('<span class="chip warn">日期未知</span>');
  (data.warnings || []).slice(0, 2).forEach((w) => chips.push(`<span class="chip warn">${escapeHtml(w)}</span>`));
  return chips.join('');
}

function openResult(data) {
  current = data;
  $('#r-title').textContent = data.title || '未命名文档';
  $('#r-meta').innerHTML = chipsFor(data);
  $('#dl-html').href = `/api/result/${data.id}/download?format=html`;
  $('#dl-html').setAttribute('download', (data.filenames && data.filenames.html) || 'document.html');
  $('#dl-md').href = `/api/result/${data.id}/download?format=md`;
  $('#dl-md').setAttribute('download', (data.filenames && data.filenames.markdown) || 'document.md');
  $('#preview').src = `/api/result/${data.id}/preview`;
  $('#md-view').classList.add('hidden');
  $('#preview').classList.remove('hidden');
  $('#toggle-md').textContent = '查看 Markdown';
  showView('result');
}

async function convert(path, body, btn) {
  clearStatus();
  btn.classList.add('is-loading');
  btn.disabled = true;
  setStatus('loading', '正在识别并生成文档，长对话可能要几秒…');
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setStatus('error', `${data.message || `请求失败（HTTP ${res.status}）`}\n抓不到链接时，展开「粘贴全文」把内容贴进来，同样能生成文档。`);
      return;
    }
    clearStatus();
    openResult(data);
    toast('已生成并加入存档');
    refreshArchive();
  } catch (err) {
    setStatus('error', `网络错误：${err.message}。请确认服务可访问。`);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function cardFor(item) {
  const s = item.summary || {};
  const el = document.createElement('div');
  el.className = 'card';
  const dateBits = (s.days || []).map((d) => d.key).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const dateText = dateBits.length === 0 ? '日期未知' : dateBits[0] === dateBits[dateBits.length - 1] ? dateBits[0] : `${dateBits[0]} ~ ${dateBits[dateBits.length - 1]}`;
  el.innerHTML = `
    <div class="card-title" title="${escapeHtml(s.title || '')}">${escapeHtml(s.title || '未命名文档')}</div>
    <div class="card-meta">
      ${s.sourceLabel ? `<span class="chip src">${escapeHtml(s.sourceLabel)}</span>` : ''}
      <span class="chip">${s.messageCount ?? 0} 条消息</span>
      <span class="chip">${escapeHtml(dateText)}</span>
    </div>
    <div class="card-actions">
      <button class="btn" data-act="view" type="button">查看</button>
      <a class="btn" href="/api/result/${item.id}/download?format=html" download>HTML</a>
      <a class="btn" href="/api/result/${item.id}/download?format=md" download>Markdown</a>
      <button class="btn danger" data-act="del" type="button">删除</button>
    </div>`;
  el.querySelector('[data-act="view"]').addEventListener('click', () => openResult({ id: item.id, ...s }));
  const delBtn = el.querySelector('[data-act="del"]');
  delBtn.addEventListener('click', async () => {
    if (delBtn.dataset.confirm !== '1') {
      delBtn.dataset.confirm = '1';
      delBtn.textContent = '确认删除？';
      setTimeout(() => { delBtn.dataset.confirm = ''; delBtn.textContent = '删除'; }, 2600);
      return;
    }
    try {
      const res = await fetch(`/api/result/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('已删除');
      refreshArchive();
    } catch (err) {
      toast(`删除失败：${err.message}`);
    }
  });
  return el;
}

function renderList(container, items) {
  container.replaceChildren(...items.map(cardFor));
}

async function refreshArchive() {
  try {
    const res = await fetch('/api/archive');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return;
    archiveItems = data.items || [];
    const badge = $('#archive-count');
    badge.textContent = String(archiveItems.length);
    badge.classList.toggle('hidden', archiveItems.length === 0);
    $('#archive-count2').textContent = archiveItems.length ? `${archiveItems.length} 份文档` : '';
    $('#archive-empty').classList.toggle('hidden', archiveItems.length > 0);
    renderList($('#archive-list'), archiveItems);
    $('#recent').classList.toggle('hidden', archiveItems.length === 0);
    renderList($('#recent-list'), archiveItems.slice(0, 3));
  } catch {
    /* 首次加载失败先不提示，识别成功后会再刷新 */
  }
}

// 时区下拉默认北京时间，粘贴日期默认今天
$('#paste-date').value = new Date().toISOString().slice(0, 10);

$('#go').addEventListener('click', () => {
  const url = $('#url').value.trim();
  if (!url) { setStatus('error', '先粘贴一条分享链接。'); return; }
  convert('/api/convert', { url, tz: $('#tz').value }, $('#go'));
});

$('#go-paste').addEventListener('click', () => {
  const text = $('#text').value;
  if (!text.trim()) { setStatus('error', '先把对话全文贴进来。'); return; }
  convert('/api/convert/paste', {
    text,
    title: $('#paste-title').value.trim(),
    date: $('#paste-date').value,
    tz: $('#tz-paste').value,
  }, $('#go-paste'));
});

$('#toggle-paste').addEventListener('click', () => {
  $('#paste-box').classList.toggle('hidden');
});

$('#back').addEventListener('click', () => showView('home'));

$('#toggle-md').addEventListener('click', async () => {
  const showingMd = !$('#md-view').classList.contains('hidden');
  $('#md-view').classList.toggle('hidden', showingMd);
  $('#preview').classList.toggle('hidden', !showingMd);
  $('#toggle-md').textContent = showingMd ? '查看 Markdown' : '查看排版';
  if (!showingMd && !$('#md-view').textContent) {
    try {
      $('#md-view').textContent = '加载中…';
      const res = await fetch(`/api/result/${current.id}/markdown`);
      const t = await res.text();
      $('#md-view').textContent = t.length > 30000 ? `${t.slice(0, 30000)}\n\n…（下载后可看完整内容）` : t;
    } catch {
      $('#md-view').textContent = '（Markdown 加载失败，可直接点下载）';
    }
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (btn) showView(btn.dataset.view);
});

refreshArchive();
