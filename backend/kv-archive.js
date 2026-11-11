// KV 持久化存档：Cloudflare Worker 版 Archive（接口与 src/archive.js 对齐）。
// data/ 文件换成 KV：每个文档一个键 `entry:<id>`，值是完整 JSON（元信息 + HTML + Markdown）。
// 注意 KV 是最终一致：刚写入后立即 list 可能短暂看不到；分享链接本身是按 key 直读，不受影响。

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const PREFIX = 'entry:';

export class KvArchive {
  constructor(kv) {
    this.kv = kv;
  }

  async save(record) {
    const id = crypto.randomUUID();
    const entry = { id, createdAt: Date.now(), ...record };
    await this.kv.put(`${PREFIX}${id}`, JSON.stringify(entry));
    return entry;
  }

  async get(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    return (await this.kv.get(`${PREFIX}${id}`, 'json')) || null;
  }

  async list() {
    const items = [];
    let cursor;
    do {
      const page = await this.kv.list({ prefix: PREFIX, cursor });
      for (const k of page.keys) {
        try {
          const entry = await this.kv.get(k.name, 'json');
          if (entry) items.push({ id: entry.id, createdAt: entry.createdAt, summary: entry.summary });
        } catch {
          /* 单个损坏记录跳过，不影响列表 */
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  }

  async remove(id) {
    if (!ID_RE.test(String(id || ''))) return false;
    const entry = await this.get(id);
    if (!entry) return false;
    await this.kv.delete(`${PREFIX}${id}`);
    return true;
  }

  async exportAll() {
    const out = [];
    let cursor;
    do {
      const page = await this.kv.list({ prefix: PREFIX, cursor });
      for (const k of page.keys) {
        try {
          const entry = await this.kv.get(k.name, 'json');
          if (entry) out.push(entry);
        } catch {
          /* 跳过损坏的记录 */
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return out;
  }
}
