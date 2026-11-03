import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * 服务端持久化存档：data/ 目录里每个文档一个 JSON（元信息 + HTML + Markdown）。
 * 注意：Render / Railway 免费实例的磁盘会随重启重置，存档会丢，这是已知限制（见 README）。
 */
export class Archive {
  constructor(dir = 'data') {
    this.dir = dir;
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  async save(record) {
    await this.init();
    const id = crypto.randomUUID();
    const entry = { id, createdAt: Date.now(), ...record };
    await fs.writeFile(this.file(id), JSON.stringify(entry), 'utf8');
    return entry;
  }

  async get(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    try {
      return JSON.parse(await fs.readFile(this.file(id), 'utf8'));
    } catch {
      return null;
    }
  }

  async list() {
    await this.init();
    const names = await fs.readdir(this.dir);
    const items = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const entry = JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8'));
        items.push({ id: entry.id, createdAt: entry.createdAt, summary: entry.summary });
      } catch {
        /* 单个损坏文件跳过，不影响列表 */
      }
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  }

  async remove(id) {
    if (!ID_RE.test(String(id || ''))) return false;
    try {
      await fs.unlink(this.file(id));
      return true;
    } catch {
      return false;
    }
  }
}
