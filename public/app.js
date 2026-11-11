import { localDateString } from './localdate.js';
import { applyTitle, applyDocStyle } from './retitle.js';
import { mergedHtml, mergedMarkdown } from './batchExport.js';

// 后端地址：config.js 里配置（window.D2D_API_BASE），可用浏览器 localStorage 的 D2D_API_BASE 覆盖。
// 前后端同域部署（后端托管本目录）时为空串，请求打相对路径即可。
const API_BASE = String(
  (typeof localStorage !== 'undefined' && localStorage.getItem('D2D_API_BASE')) ||
  (typeof window !== 'undefined' && window.D2D_API_BASE) ||
  '',
).replace(/\/+$/, '');

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

// —— 本机存档：文档副本存在这台设备的浏览器里（IndexedDB） ——
// 不可用时退化为内存（页面关掉就没，会提示）
const DB_NAME = 'd2d-archive';
const STORE = 'entries';
let memoryArchive = [];
let idbOk = typeof indexedDB !== 'undefined';
let idbWarned = false;

function idbReq(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
// 打开（首次则创建）本机存档库：onupgradeneeded 里建对象仓，否则库里没有 entries
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB 被其他页面占用'));
  });
}
async function localArchiveAll() {
  if (!idbOk) return [...memoryArchive].sort((a, b) => b.createdAt - a.createdAt);
  try {
    const db = await idbOpen();
    if (!db.objectStoreNames.contains(STORE)) return [];
    const tx = db.transaction(STORE, 'readonly');
    const items = await idbReq(tx.objectStore(STORE).getAll());
    return (items || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    idbOk = false;
    warnIdb();
    return [...memoryArchive].sort((a, b) => b.createdAt - a.createdAt);
  }
}
async function localArchivePut(entry) {
  if (!idbOk) {
    memoryArchive = [entry, ...memoryArchive.filter((e) => e.id !== entry.id)];
    return;
  }
  try {
    const db = await idbOpen();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
  } catch {
    idbOk = false;
    warnIdb();
    memoryArchive = [entry, ...memoryArchive.filter((e) => e.id !== entry.id)];
  }
}
async function localArchiveDelete(id) {
  if (!idbOk) {
    memoryArchive = memoryArchive.filter((e) => e.id !== id);
    return;
  }
  try {
    const db = await idbOpen();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
  } catch {
    idbOk = false;
    warnIdb();
    memoryArchive = memoryArchive.filter((e) => e.id !== id);
  }
}
function warnIdb() {
  if (idbWarned) return;
  idbWarned = true;
  toast('浏览器存档不可用，本次存档只保留在当前页面内存里，关页就丢');
}

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

function readOptions() {
  return {
    stripThinking: $('#opt-strip-thinking').checked,
    showTitle: $('#opt-show-title').checked,
    showLink: $('#opt-show-link').checked,
    showTime: $('#opt-show-time').checked,
    docStyle: (document.querySelector('input[name="docstyle"]:checked') || {}).value || 'classic',
  };
}

function chipsFor(data) {
  const chips = [];
  if (data.sourceLabel) chips.push(`<span class="chip src">${escapeHtml(data.sourceLabel)}</span>`);
  chips.push(`<span class="chip">${data.messageCount} 条消息</span>`);
  if (data.options && data.options.showTime === false) chips.push('<span class="chip">未保存时间</span>');
  else chips.push(`<span class="chip">${(data.days || []).length} 个日期</span>`);
  if (data.options && data.options.stripThinking) chips.push('<span class="chip">只留正文</span>');
  if (data.modelLabel) chips.push(`<span class="chip">${escapeHtml(data.modelLabel)}</span>`);
  if (data.timeSource === 'message') chips.push('<span class="chip">逐条时间</span>');
  else if (data.timeSource === 'day') chips.push('<span class="chip">按日归档</span>');
  else chips.push('<span class="chip warn">日期未知</span>');
  (data.warnings || []).slice(0, 2).forEach((w) => chips.push(`<span class="chip warn">${escapeHtml(w)}</span>`));
  return chips.join('');
}

function downloadBlob(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function shareLinkOf(entry) {
  return entry.shareUrl || `${API_BASE || location.origin}/share/${entry.id}`;
}

function openResult(data) {
  current = data;
  $('#r-title').textContent = data.title || '未命名文档';
  $('#r-meta').innerHTML = chipsFor(data);
  $('#share-link').href = shareLinkOf(data);
  $('#share-link').textContent = shareLinkOf(data);
  const pv = $('#preview');
  pv.removeAttribute('src'); // 防止旧的 src 与 srcdoc 叠加，每次都按当前内容重载
  pv.srcdoc = data.html || '';
  $('#md-view').textContent = data.markdown || '';
  $('#md-view').classList.add('hidden');
  $('#preview').classList.remove('hidden');
  $('#toggle-md').textContent = '查看 Markdown';
  renderStyleRow();
  showView('result');
}

function renderStyleRow() {
  const st = (current && current.options && current.options.docStyle) || 'classic';
  $$('#style-row [data-style]').forEach((b) => b.classList.toggle('active', b.dataset.style === st));
}

async function copyText(text, okMsg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg);
    return true;
  } catch (err) {
    toast(`复制失败：${err.message}`);
    return false;
  }
}

async function convert(path, body, btn) {
  clearStatus();
  btn.classList.add('is-loading');
  btn.disabled = true;
  setStatus('loading', '正在识别并生成文档，长对话可能要几秒…');
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setStatus('error', `${data.message || `请求失败（HTTP ${res.status}）`}\n抓不到链接时，展开「粘贴全文」把内容贴进来，同样能生成文档。`);
      return;
    }
    clearStatus();
    await localArchivePut(data);
    openResult(data);
    toast('已生成：本机保存一份，公开分享副本在服务端');
    refreshArchive();
  } catch (err) {
    setStatus('error', `网络错误：${err.message}。请确认后端服务可访问（前后端分开部署时，检查 config.js 里的后端地址与后端 CORS_ORIGINS 配置）。`);
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
  const dateText = s.options && s.options.showTime === false ? '未保存时间' : dateBits.length === 0 ? '日期未知' : dateBits[0] === dateBits[dateBits.length - 1] ? dateBits[0] : `${dateBits[0]} ~ ${dateBits[dateBits.length - 1]}`;
  el.innerHTML = `
    <div class="card-title" title="${escapeHtml(s.title || '')}">${escapeHtml(s.title || '未命名文档')}</div>
    <div class="card-meta">
      ${s.sourceLabel ? `<span class="chip src">${escapeHtml(s.sourceLabel)}</span>` : ''}
      <span class="chip">${s.messageCount ?? 0} 条消息</span>
      <span class="chip">${escapeHtml(dateText)}</span>
    </div>
    <div class="card-actions">
      <label class="card-sel"><input type="checkbox" data-sel ${selIds.has(item.id) ? 'checked' : ''}> 多选</label>
      <button class="btn" data-act="view" type="button">查看</button>
      <button class="btn" data-act="dl-html" type="button">HTML</button>
      <button class="btn" data-act="dl-md" type="button">Markdown</button>
      <button class="btn" data-act="dl-tr" type="button">对话稿</button>
      <button class="btn" data-act="rename" type="button">重命名</button>
      <button class="btn" data-act="sharelink" type="button">复制链接</button>
      <button class="btn danger" data-act="del" type="button">${item.revokeToken ? '删除并关闭分享' : '仅本机删除'}</button>
    </div>`;
  el.querySelector('[data-act="view"]').addEventListener('click', () => openResult(item));
  el.querySelector('[data-act="dl-html"]').addEventListener('click', () => downloadBlob((s.filenames && s.filenames.html) || 'document.html', item.html || '', 'text/html; charset=utf-8'));
  el.querySelector('[data-act="dl-md"]').addEventListener('click', () => downloadBlob((s.filenames && s.filenames.markdown) || 'document.md', item.markdown || '', 'text/markdown; charset=utf-8'));
  el.querySelector('[data-act="dl-tr"]').addEventListener('click', () => downloadBlob((s.filenames && s.filenames.transcript) || 'transcript.md', item.transcript || '', 'text/markdown; charset=utf-8'));
  el.querySelector('[data-act="sharelink"]').addEventListener('click', () => copyText(shareLinkOf(item), '分享链接已复制（服务端公开出口）'));
  el.querySelector('[data-act="rename"]').addEventListener('click', () => {
    const titleEl = el.querySelector('.card-title');
    const cur = (item.summary && item.summary.title) || '';
    titleEl.innerHTML = `<input class="rename-input" value="${escapeHtml(cur)}" maxlength="80" aria-label="新标题" /> <button class="btn sm" data-r="save" type="button">保存</button> <button class="btn sm" data-r="cancel" type="button">取消</button>`;
    const input = titleEl.querySelector('.rename-input');
    input.focus();
    input.select();
    const save = async () => {
      try {
      const t = input.value.trim();
      if (!t) { toast('标题不能为空'); return; }
      if (t === cur) { refreshArchive(); return; }
      const updated = applyTitle(item, t);
      await localArchivePut(updated);
      if (current && current.id === item.id) openResult(updated);
      refreshArchive();
      toast('已重命名：列表、预览标题和下载文件名都同步了（公开分享页保持原标题）');
      } catch (err) { toast('改名失败：' + err.message); console.error(err); }
    };
    const cancel = () => refreshArchive();
    titleEl.querySelector('[data-r="save"]').addEventListener('click', save);
    titleEl.querySelector('[data-r="cancel"]').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });
  });
  el.querySelector('[data-sel]').addEventListener('change', (e) => {
    if (e.target.checked) selIds.add(item.id); else selIds.delete(item.id);
    updateBatchBar();
  });
  const delBtn = el.querySelector('[data-act="del"]');
  const defaultDeleteLabel = item.revokeToken ? '删除并关闭分享' : '仅本机删除';
  delBtn.addEventListener('click', async () => {
    if (delBtn.dataset.confirm !== '1') {
      delBtn.dataset.confirm = '1';
      delBtn.textContent = item.revokeToken ? '确认删除并关闭？' : '确认仅本机删除？';
      setTimeout(() => { delBtn.dataset.confirm = ''; delBtn.textContent = defaultDeleteLabel; }, 2600);
      return;
    }
    delBtn.disabled = true;
    if (item.revokeToken) {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: item.revokeToken }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `请求失败（HTTP ${res.status}）`);
        }
        await localArchiveDelete(item.id);
        toast('本机存档已删除，公开分享链接已关闭');
      } catch (err) {
        delBtn.disabled = false;
        delBtn.dataset.confirm = '';
        delBtn.textContent = defaultDeleteLabel;
        toast(`关闭分享失败，存档仍保留：${err.message}`);
        return;
      }
    } else {
      await localArchiveDelete(item.id);
      toast('本机副本已删除；这条旧分享仍在服务端公开，需用 ADMIN_KEY 清理');
    }
    refreshArchive();
  });
  return el;
}

function renderList(container, items) {
  container.replaceChildren(...items.map(cardFor));
}

// —— 多选与合并导出：全部走本机存档数据，不需要管理密钥 ——
const selIds = new Set();
let archiveItems = [];

function updateBatchBar() {
  const total = archiveItems.length;
  $('#batch-bar').classList.toggle('hidden', total === 0);
  $('#sel-count').textContent = total === 0 ? '' : selIds.size ? `已选 ${selIds.size} / 共 ${total} 篇` : `共 ${total} 篇，勾选后可合并导出`;
  $('#sel-all').checked = total > 0 && selIds.size === total;
  $('#exp-html').disabled = $('#exp-md').disabled = selIds.size === 0;
}

async function doBatchExport(kind) {
  const items = archiveItems.filter((e) => selIds.has(e.id));
  if (!items.length) return;
  const name = `DeepSeek对话合订本_${localDateString(new Date())}_${items.length}篇`;
  if (kind === 'html') downloadBlob(`${name}.html`, mergedHtml(items) || '', 'text/html; charset=utf-8');
  else downloadBlob(`${name}.md`, mergedMarkdown(items) || '', 'text/markdown; charset=utf-8');
  toast(`已导出 ${items.length} 篇合订本（本机生成，包含所选内容）`);
}

$('#sel-all').addEventListener('change', (e) => {
  selIds.clear();
  if (e.target.checked) archiveItems.forEach((it) => selIds.add(it.id));
  renderList($('#archive-list'), archiveItems);
  updateBatchBar();
});
$('#exp-html').addEventListener('click', () => doBatchExport('html'));
$('#exp-md').addEventListener('click', () => doBatchExport('md'));

async function refreshArchive() {
  const items = await localArchiveAll();
  const badge = $('#archive-count');
  badge.textContent = String(items.length);
  badge.classList.toggle('hidden', items.length === 0);
  $('#archive-count2').textContent = items.length ? `${items.length} 份文档（保存在本机）` : '';
  $('#archive-empty').classList.toggle('hidden', items.length > 0);
  const ids = new Set(items.map((it) => it.id));
  for (const id of [...selIds]) if (!ids.has(id)) selIds.delete(id);
  archiveItems = items;
  renderList($('#archive-list'), items);
  updateBatchBar();
  $('#recent').classList.toggle('hidden', items.length === 0);
  renderList($('#recent-list'), items.slice(0, 3));
}

// 粘贴日期默认今天：按浏览器本机时区算，不用 UTC（否则会差一天）
$('#paste-date').value = localDateString();

$('#go').addEventListener('click', () => {
  const url = $('#url').value.trim();
  if (!url) { setStatus('error', '先粘贴一条分享链接。'); return; }
  convert('/api/convert', { url, tz: $('#tz').value, options: readOptions() }, $('#go'));
});

$('#go-paste').addEventListener('click', () => {
  const text = $('#text').value;
  if (!text.trim()) { setStatus('error', '先把对话全文贴进来。'); return; }
  convert('/api/convert/paste', {
    text,
    title: $('#paste-title').value.trim(),
    date: $('#paste-date').value,
    tz: $('#tz-paste').value,
    options: readOptions(),
  }, $('#go-paste'));
});

$('#toggle-paste').addEventListener('click', () => {
  $('#paste-box').classList.toggle('hidden');
});

$('#back').addEventListener('click', () => showView('home'));

$('#copy-transcript').addEventListener('click', () => {
  if (!current) return;
  copyText(current.transcript || '', '对话稿已复制，可直接粘贴给其他 AI 应用');
});

$('#copy-share').addEventListener('click', () => {
  if (!current) return;
  copyText($('#share-link').textContent, '分享链接已复制，发给 AI 或任何人都能直接打开');
});

  $$('#style-row [data-style]').forEach((b) => b.addEventListener('click', async () => {
    if (!current) return;
    const updated = applyDocStyle(current, b.dataset.style);
    if (updated === current) return;
    current = updated;
    const pv = $('#preview');
    pv.removeAttribute('src');
    pv.srcdoc = updated.html || '';
    await localArchivePut(updated);
    renderStyleRow();
    toast('排版已切换，本机存档同步更新');
  }));
  $('#toggle-md').addEventListener('click', () => {
  const showingMd = !$('#md-view').classList.contains('hidden');
  $('#md-view').classList.toggle('hidden', showingMd);
  $('#preview').classList.toggle('hidden', !showingMd);
  $('#toggle-md').textContent = showingMd ? '查看 Markdown' : '查看排版';
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (btn) showView(btn.dataset.view);
});

refreshArchive();
