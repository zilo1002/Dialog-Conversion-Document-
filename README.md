# AI 对话识别存档（DeepSeek / ChatGPT / Claude）

[![Deploy to Render](https://render.com/images/deploy.svg)](https://render.com/deploy?repo=https://github.com/zilo1002/Dialog-Conversion-Document-)

## 仓库与部署名

这份 README 里的部署链接是按实际仓库写好的：GitHub 用户名 zilo1002，仓库名 Dialog-Conversion-Document-。部署按钮和部署一节里的链接都指向 https://github.com/zilo1002/Dialog-Conversion-Document-。如果你推送时用了别的仓库名，把 README 里这几处链接中的仓库名换成你自己的仓库地址即可，按钮就能直接识别你的仓库。

打开网页就是完整界面：中间一个输入框，粘贴分享链接点「识别存档」，直接生成按日期排版的 HTML 与 Markdown 文档并自动存档，历史文档可反复下载、可删除。

部署一次就好：把仓库推到 GitHub，点上面的按钮在 Render 部署，拿到固定网址就能一直用，本地不需要装任何东西（详见「部署」一节）。想在本地跑，按下面的「快速开始」。

## 快速开始

```bash
npm install
npm start
```

然后打开 http://localhost:5178 ，把分享链接粘进去，点「生成文档」。

- Node 版本：18.17 以上（用到内置 `fetch`；开发验证用的是 Node 24）
- 端口：默认 5178，可用 `PORT=8080 npm start` 改
- 依赖：`express`（本地服务）、`cheerio`（HTML 兜底解析）、`marked`（Markdown 渲染）
- 测试：`npm test`（23 个用例）
- 存档目录：默认项目下的 `data/`（每个文档一个 JSON，含元信息和两种文档内容），可用环境变量 `DATA_DIR` 改；`data/` 不进 git

## 支持的平台（实测结论 2026-11）

| | DeepSeek | ChatGPT | Claude |
|---|---|---|---|
| 分享链接 | chat.deepseek.com/share/* | chatgpt.com/share/*（含 chat.openai.com） | claude.ai/share/* |
| 数据在哪 | 公开接口 `/api/v0/share/content?share_id=` | 分享页 `<script id="__NEXT_DATA__">` 里 `serverResponse.data.mapping` 消息树 | 分享页 `__NEXT_DATA__` 里 `serverData.chat_messages` |
| 逐条时间戳 | 有（`inserted_at`，秒） | 有（`create_time`，秒） | 有（`created_at`，ISO/秒） |
| 标题 | 常是通用占位，用首条提问兜底 | `title` | `name` |
| 本执行环境实测 | 已验证（接口返回完整对话） | 沙箱连不上 chatgpt.com；页面 SSR 已确认含正文，结构按公开导出工具的实测编写，附 DOM 兜底 | claude.ai 对本环境返回 region_unavailable（区域不可用）；结构按公开导出工具的实测编写 |

三个平台的解析都不绕过登录墙、验证码或地区限制：抓不到时返回明确原因并引导「粘贴全文」。测试里的 ChatGPT/Claude 样本是按上述结构构造的合成样本（`samples/sample-chatgpt-share.html`、`samples/sample-claude-share.html`），DeepSeek 样本是真实抓取的返回。

## 界面

- 首屏：一个完整窗口，中间是链接输入框和「识别存档」按钮；没有链接时展开「粘贴全文」也能成文。
- 识别后进入结果页：排版预览（文档本身按日期分节、逐条带时间）、元信息（来源、日期、消息数、时间说明）、下载 HTML / 下载 Markdown，可切换看 Markdown 原文。
- 存档页：识别过的文档都在，卡片列出标题、来源、日期、条数，每张卡可查看、重新下载（HTML 和 Markdown 各一个按钮，可下多次）、删除（点两次确认）。首屏下方同时显示最近 3 条。
- 移动端可用：窄屏下输入框和按钮自动竖排，卡片单列。

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

消息顺序按对话先后输出，保证「先问后答」：DeepSeek 按 parent_id 链重排（接口数组不保证链序，且同一问答回的用户/助手时间戳可能相同），ChatGPT 只走消息树的当前分支（重新生成的旧变体不重复导出），Claude 有 index 按 index 排；时间戳相同或缺失时保持解析出的先后顺序，不靠时间戳重排。

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
- 存档是写在本机/实例的 `data/` 目录里的。Render、Railway 免费实例的磁盘会随重启或重新部署重置，存档会丢；要长期保留，要么挂平台的持久磁盘，要么用自有服务器部署并把 `data/` 备份下来。
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
git remote add origin git@github.com:zilo1002/Dialog-Conversion-Document-.git
git branch -M main
git push -u origin main
```

注意 `.gitignore` 已排除 `node_modules/`、日志和环境变量文件，`git add .` 不会把这些带上去；首次提交前不需要也不应该先 `npm install`。

## 部署

推荐路径不需要本地装任何东西：GitHub 推送 → Render 页面点一次 → 拿到固定网址。构建命令 `npm install`、启动命令 `npm start`、健康检查 `/api/health`（render.yaml 已配好）；端口代码里读 `process.env.PORT`（本地没设时默认 5178），平台注入的 PORT 自动生效。

1. 把仓库推到 GitHub（见上一节的命令）。
2. 打开 https://render.com/deploy?repo=https://github.com/zilo1002/Dialog-Conversion-Document-（README 顶部有同一个按钮），登录后点 Apply / Create Web Service，等一两分钟。仓库名不同的话，把链接里的仓库名换成你的。
3. 拿到固定网址（形如 `https://deepseek-to-doc.onrender.com`），打开就是完整界面，手机浏览器也能用。

免费实例限制：15 分钟无人访问会休眠，首次访问要等几秒；实例磁盘随重启/重新部署重置，`data/` 里的存档会丢（见「已知限制」）。

### 备选

Railway：New Project → Deploy from GitHub repo 选这个仓库，自动识别 Node 服务，Start Command 用 `npm start`；PORT 由平台注入。

Docker 自建：仓库带 Dockerfile（node:20-alpine，`npm install --omit=dev && npm start`，端口读 PORT）。

```bash
docker build -t deepseek-to-doc .
docker run -d --name deepseek-to-doc -e PORT=8080 -p 8080:8080 --restart unless-stopped deepseek-to-doc
# 浏览器打开 http://<服务器IP>:8080
```

不想用 Docker，装好 Node 20+ 后 `npm install && npm start` 也一样能跑；要存档不丢就把 `data/` 挂到持久盘或备份。

## 目录结构

```
deepseek-to-doc/
├── .gitignore            # 忽略 node_modules / 日志 / .env / data
├── render.yaml           # Render Blueprint（一键部署）
├── data/                 # 运行时生成的存档（不进 git）
├── src/
│   ├── convert.js        # 识别转换入口（三平台分发 + 粘贴）
│   ├── archive.js        # data/ 目录持久化存档
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
