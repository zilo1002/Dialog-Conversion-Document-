# DeepSeek 对话 → 按日期排版的文档

把 DeepSeek / ChatGPT / Claude 的分享链接变成排好版的 HTML 和 Markdown 文档：按日期分节、区分双方角色、保留代码块与思考过程。

## 快速开始

```bash
npm install
npm start
```

然后打开 http://localhost:5178 ，把分享链接粘进去，点「生成文档」。

- Node 版本：18.17 以上（用到内置 `fetch`；开发验证用的是 Node 24）
- 端口：默认 5178，可用 `PORT=8080 npm start` 改
- 依赖：`express`（本地服务）、`cheerio`（HTML 兜底解析）、`marked`（Markdown 渲染）
- 测试：`npm test`

## 支持的平台（实测结论 2026-11）

| | DeepSeek | ChatGPT | Claude |
|---|---|---|---|
| 分享链接 | chat.deepseek.com/share/* | chatgpt.com/share/*（含 chat.openai.com） | claude.ai/share/* |
| 数据在哪 | 公开接口 `/api/v0/share/content?share_id=` | 分享页 `<script id="__NEXT_DATA__">` 里 `serverResponse.data.mapping` 消息树 | 分享页 `__NEXT_DATA__` 里 `serverData.chat_messages` |
| 逐条时间戳 | 有（`inserted_at`，秒） | 有（`create_time`，秒） | 有（`created_at`，ISO/秒） |
| 标题 | 常是通用占位，用首条提问兜底 | `title` | `name` |
| 本执行环境实测 | 已验证（接口返回完整对话） | 沙箱连不上 chatgpt.com；页面 SSR 已确认含正文，结构按公开导出工具的实测编写，附 DOM 兜底 | claude.ai 对本环境返回 region_unavailable（区域不可用）；结构按公开导出工具的实测编写 |

三个平台的解析都不绕过登录墙、验证码或地区限制：抓不到时返回明确原因并引导「粘贴全文」。测试里的 ChatGPT/Claude 样本是按上述结构构造的合成样本（`samples/sample-chatgpt-share.html`、`samples/sample-claude-share.html`），DeepSeek 样本是真实抓取的返回。

## 用户流程

1. 在对话页点「分享」，复制生成的公开链接（DeepSeek / ChatGPT / Claude 都行，链接粘进来会自动识别来源）。
2. 打开本项目页面，粘贴链接，选时区（默认 Asia/Shanghai），点「生成文档」。
3. 页面给出：标题、消息条数、日期分布、提示信息；左边 iframe 预览排版效果，右边 Markdown 预览。
4. 点「下载 HTML」/「下载 Markdown」，文件名形如 `标题_2026-04-26.html`。

## 抓取原理（实测结论，2026-11）

先说清楚一件事：**分享页不是服务端渲染的对话页**。直接抓 `https://chat.deepseek.com/share/<id>` 只会拿到一个约 9KB 的 SPA 空壳（`<div id="root"></div>` 加若干 JS bundle），正文是浏览器里再发请求取回来的。

实测拿到的正文接口是：

```
GET https://chat.deepseek.com/api/v0/share/content?share_id=<id>
```

返回结构（字段名保持原样）：

```json
{ "code": 0,
  "data": { "biz_code": 0, "biz_msg": "",
    "biz_data": {
      "title": "Shared Conversation",
      "model_type": "expert",
      "messages": [
        { "message_id": 275, "parent_id": 268, "role": "USER",
          "inserted_at": 1777151747.965,
          "fragments": [ { "type": "REQUEST", "content": "..." } ] },
        { "message_id": 276, "parent_id": 275, "role": "ASSISTANT",
          "inserted_at": 1777151747.9659998,
          "fragments": [
            { "type": "THINK", "content": "...", "elapsed_secs": 19.7825 },
            { "type": "RESPONSE", "content": "..." } ] } ] } } }
```

解析规则：

- `role`：`USER` → 用户，`ASSISTANT` → DeepSeek。
- `fragments`：`REQUEST` 是提问，`THINK` 是思考过程（带 `elapsed_secs` 思考耗时），`RESPONSE` 是回答；其他类型（如 `SEARCH`）会带标签原样保留，不会静默丢正文。
- `inserted_at` 是**秒**（带小数），不是毫秒；代码里已做兼容。
- `samples/sample-share-api.json` 是这次实测保存下来的真实返回（一条公开分享的英文对话），`samples/sample-share-shell.html` 是分享页空壳，两者一起用于离线测试。

服务端 `src/fetchShare.js` 负责带浏览器 UA、referer、20 秒超时地请求接口；前端只做输入、预览、下载，所以没有 CORS 问题。抓到的结果只在内存里放一小时，不落盘、不上传。

## 关于时间（逐条时间有没有）

**有。** 分享接口给每条消息都带 `inserted_at`，所以文档按消息真实时间分组，节标题形如 `2026-04-26 星期日`，每条消息头显示 `05:15 · DeepSeek`。时区默认 `Asia/Shanghai`，页面上可切换；示例样本的 UTC 时间是 2026-04-25 21:15，换算到北京时间是 2026-04-26 05:15，正好跨日，测试里也覆盖了这个点。

只有「粘贴全文」兜底模式没有逐条时间，那时统一挂到你选的日期，文档里会写明「时间粒度只到日」。

## 文档排版

- 按日期分节，节标题滚动时固定在顶部（sticky），并标注该日条数。
- 用户消息浅蓝底，DeepSeek 消息白底；每条带角色和时间。
- 代码块带语言标签（没有语言标记时标 `text`），保留换行和缩进，横向可滚。
- 思考过程默认折叠（`<details>`），点击展开，正文完整保留。
- 内容里的原始 HTML 会被转义，避免把别人对话里的标签当页面结构执行。
- 纯静态 HTML，不带脚本，长对话也不会卡；另附打印样式。

## 兜底路径

1. **接口失败自动回退**：接口报错时，服务端会再抓一次分享页 HTML，先在 `<script>` 里找内嵌的 `"messages":[...]` JSON，再退到 `cheerio` 的 DOM 启发式提取（`.ds-markdown` 之类），能拿到就照常出文档，并在文档里注明用的是兜底解析。
2. **粘贴全文**：不管上面哪种失败，页面切到「粘贴全文」把内容贴进来就能生成。支持三种写法：
   - 带角色标记：`用户：...` / `DeepSeek：...`（也认 `User:` / `Assistant:` / `【用户】`）
   - 直接粘贴分享页全选复制的内容：按 `Thought for N seconds`、`已思考（用时 N 秒）` 这类行切分问答
   - 什么标记都没有：整段作为一条「未标注角色」的记录，照样出文档，并提示加标记的方法

## 已知限制

- 接口不是官方公开 API，DeepSeek 随时可能改字段或加风控；改了就靠上面的兜底路径。
- 分享接口返回的标题常常只是通用占位（实测 DeepSeek 就是 `Shared Conversation`），这时文档标题取首条提问前 28 个字，并在文档里标注。
- ChatGPT / Claude 的解析基于其分享页内嵌的 `__NEXT_DATA__` 结构；这两个站点对无浏览器特征的请求可能弹 Cloudflare 验证或要求登录，遇到就换「粘贴全文」。Claude 对部分地区直接返回 region_unavailable，这是它的访问限制，本项目不绕过。
- 三个平台里拿不到逐条时间戳时，文档会明确写「对话日期未知（导入日期 今天）」，不编造时间。
- 只解析单条分享链接里的对话；需要登录才能看的对话抓不到。
- 分享页里的「下载 / 复制」按钮文字属于页面装饰，复制全文时已自动去掉；但页面结构变了可能残留个别行，可在粘贴框里手动删。
- 时区换算依赖 Node 的 `Intl` 时区数据，需带完整 ICU（官方发行版默认带）。
- 思考过程的耗时取 `elapsed_secs`；接口没给时只显示「思考过程」。

## 推送到 GitHub

仓库状态已经补齐（`.gitignore`、MIT `LICENSE`），clone 或解压后直接推就行：

```bash
cd deepseek-to-doc
git init
git add .
git commit -m "DeepSeek share link to dated HTML/Markdown documents"
# 在 GitHub 上新建一个空仓库后：
git remote add origin git@github.com:<你的用户名>/deepseek-to-doc.git
git branch -M main
git push -u origin main
```

注意 `.gitignore` 已排除 `node_modules/`、日志和环境变量文件，`git add .` 不会把这些带上去；首次提交前不需要也不应该先 `npm install`。

## 部署

先说清楚一件和网络有关的事：Render、Railway 这类海外平台的域名在国内直连基本不可用。按你的访问场景选路线即可。两种方式构建命令都是 `npm install`、启动命令都是 `npm start`，端口代码里读 `process.env.PORT`（本地没设时默认 5178），平台注入的 PORT 会自动生效，不需要改代码。

### 路线一（海外访问）：Render / Railway

Render：New → Web Service → 连接 GitHub 仓库 → Build Command 填 `npm install`，Start Command 填 `npm start`，Health Check Path 填 `/api/health`；免费档长时间没人访问会休眠，首次冷启动要等几秒。

Railway：New Project → Deploy from GitHub repo 选这个仓库，自动识别 Node 服务，Start Command 用 `npm start`；PORT 由平台注入。

### 路线二（国内外都能访问，推荐）：Zeabur / 自有服务器 Docker

国内直连，推荐走能直连的平台或自己的 VPS，仓库里已带 Dockerfile（node:20-alpine，`npm install --omit=dev && npm start`，端口读 PORT）。

Zeabur：控制台直接选「Deploy from GitHub」连这个仓库，或用 Docker 部署方式选这个 Dockerfile；绑定域名后国内一般可直连，免费额度够个人用。

自有服务器（国内 VPS 或有公网 IP 的机器）：

```bash
# 构建并后台跑，PORT 想用 8080 就这样映射
docker build -t deepseek-to-doc .
docker run -d --name deepseek-to-doc -e PORT=8080 -p 8080:8080 --restart unless-stopped deepseek-to-doc
# 浏览器打开 http://<服务器IP>:8080
```

不想用 Docker，装好 Node 20+ 后 `npm install && npm start` 也一样能跑，再配个 systemd 或 nginx 反代即可。

### 备选思路（免费，国内通常可直连）：Cloudflare Workers + Pages

如果不想维护任何服务器，可以往 Cloudflare 上改，思路如下，本项目没有实现：

- 服务端逻辑不多（抓分享接口 + 解析 + 渲染），把 Express 的几个路由改写成 Workers 的 fetch handler 不难；`fetchShare.js` 里用的是标准 `fetch`，Workers 原生支持，几乎不用动。
- `public/` 静态页面放 Pages，Worker 只保留 `/api/*` 路由，Pages 的 Functions 或 Worker Routes 把 `/api/*` 指过去。
- 需要注意两点：一是 Workers 免费档有每天 10 万次请求和 CPU 时间限制，个人用足够；二是生成结果目前放进程内存，Workers 无常驻内存，需要把「预览/下载」改成同一次请求里返回，或塞进 Cache/KV。

## 目录结构

```
deepseek-to-doc/
├── .gitignore            # 忽略 node_modules / 日志 / .env
├── .dockerignore           # Docker 构建时排除的内容
├── Dockerfile              # node:20-alpine，VPS / Zeabur 用
├── LICENSE                # MIT
├── server.js              # Express 服务：代理抓取、生成、预览、下载
├── src/
│   ├── shareUrl.js        # 链接 → 平台 + share id（三平台分发）
│   ├── parseChatGPT.js    # ChatGPT 分享页解析（__NEXT_DATA__ / DOM 兜底）
│   ├── parseClaude.js     # Claude 分享页解析（__NEXT_DATA__）
│   ├── parseCommon.js     # 解析公共工具
│   ├── fetchShare.js      # 调分享接口（带超时、错误码映射）
│   ├── parseShare.js      # 接口 JSON → 统一对话模型
│   ├── htmlFallback.js    # 分享页 HTML 兜底解析
│   ├── paste.js           # 粘贴全文解析
│   ├── groupByDate.js     # 按日期分组
│   ├── renderHtml.js      # HTML 文档
│   ├── renderMarkdown.js  # Markdown 文档
│   ├── markdown.js        # marked 封装（转义、标题降级、代码块标签）
│   ├── localtime.js       # 时区换算
│   └── filenames.js       # 文件名清洗
├── public/                # 页面（原生 HTML/CSS/JS，无构建）
├── samples/               # 实测样本
└── test/                  # node:test 用例
```

## 隐私

文档在内存里最多留一小时，重启即清空，不写数据库、不上传。分享链接本身是公开可访问的，抓取前请确认对话里没有敏感信息。
