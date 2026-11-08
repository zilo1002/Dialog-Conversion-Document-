# AI 对话识别存档（DeepSeek）

[![Deploy to Render](https://render.com/images/deploy.svg)](https://render.com/deploy?repo=https://github.com/zilo1002/Dialog-Conversion-Document-)

## 仓库与部署名

这份 README 里的部署链接是按实际仓库写好的：GitHub 用户名 zilo1002，仓库名 Dialog-Conversion-Document-（2026-11-06 已按 Render Blueprint 同步记录勘误：此前误写成 zilol002，以 zilo1002 为准）。部署按钮和部署一节里的链接都指向 https://github.com/zilo1002/Dialog-Conversion-Document-。如果你推送时用了别的仓库名，把 README 里这几处链接中的仓库名换成你自己的仓库地址即可，按钮就能直接识别你的仓库。

打开网页就是完整界面：中间一个输入框，粘贴 DeepSeek 分享链接点「识别存档」，直接生成按日期排版的 HTML 与 Markdown 文档并自动存档，历史文档可反复下载、可删除。生成前可以勾选删掉思考过程、标题、原始链接、时间信息中的任何一项；生成结果里还包括一份给其他 AI 应用直接用的「AI 对话稿」。

部署一次就好：把仓库推到 GitHub，点上面的按钮在 Render 部署，拿到固定网址就能一直用，本地不需要装任何东西（详见「部署」一节）。想在本地跑，按下面的「快速开始」。

## 快速开始

```bash
npm install
npm start
```

然后打开 http://localhost:5178 ，把分享链接粘进去，点「生成文档」。

- Node 版本：20.18.1 以上（依赖 cheerio 1.1+ 与其内置的 undici 要求这个下限；开发验证用的是 Node 24，Render 默认 Node 22 也满足。package.json 的 engines 已按此声明，Dockerfile 用 node:22-alpine）
- 端口：默认 5178，可用 `PORT=8080 npm start` 改
- 依赖：`express`（本地服务）、`cheerio`（HTML 兜底解析）、`marked`（Markdown 渲染）
- 测试：`npm test`（当前 56 个用例）
- 存档目录：默认项目下的 `data/`（每个文档一个 JSON，含元信息和两种文档内容），可用环境变量 `DATA_DIR` 改；`data/` 不进 git

## 支持的平台（实测结论 2026-11）

只支持 DeepSeek：

| | DeepSeek |
|---|---|
| 分享链接 | chat.deepseek.com/share/* |
| 数据在哪 | 公开接口 `/api/v0/share/content?share_id=` |
| 逐条时间戳 | 有（`inserted_at`，秒） |
| 标题 | 常是通用占位（`Shared Conversation`），用首条提问兜底 |
| 实测 | 已验证：接口返回完整对话，含思考过程片段与逐条时间 |

2026-11-06 按需求移除了 ChatGPT 与 Claude 的识别与解析接口，粘贴这两家的链接会明确提示「暂不支持」。解析不绕过登录墙、验证码或地区限制：抓不到时返回明确原因并引导「粘贴全文」。测试里的 DeepSeek 样本是真实抓取的返回（`samples/sample-share-api.json`）。

## 界面

- 首屏：一个完整窗口，中间是链接输入框和「识别存档」按钮；没有链接时展开「粘贴全文」也能成文。两种方式共用下面这排「生成选项」勾选。
- 排版风格：生成选项里可选三种文档排版——经典文档（默认，卡片式文档）、简洁纯文本（去卡片贴近原始文字）、聊天气泡（问答左右分侧）。结果页预览上方有「排版」按钮实时切换，所选风格随本机存档保存，下载的 HTML 也是该风格。
- 识别后进入结果页：排版预览（文档本身按日期分节、逐条带时间）、元信息（来源、日期、消息数、时间说明）、下载 HTML / 下载 Markdown、复制 AI 对话稿 / 下载对话稿，可切换看 Markdown 原文；页面上还有可点击的公开分享链接（`/share/<id>`）和「复制链接」按钮，存档卡片也有「复制链接」。
- 存档页：识别过的文档保存在这台设备浏览器的 IndexedDB 里，卡片列出标题、来源、日期、条数，每张卡可查看、重命名、重新下载（HTML / Markdown / 对话稿，从本机副本生成）、复制分享链接、删除。新生成的记录点两次「删除并关闭分享」会先撤销服务端公开内容，再删本机副本；旧记录若没有撤销凭据，则明确显示「仅本机删除」。首屏下方同时显示最近 3 条。
- 多选与合订导出：存档卡片可勾选（有全选），勾选后可把所选存档合并导出成一个「合订本」HTML 或 Markdown 文件——按存档时间从新到旧排列，每篇保留自己的标题、来源与日期，HTML 合订本打印时按篇分页。合订本完全由本机浏览器从 IndexedDB 里的存档生成，不需要管理密钥，也不经过服务器。
- 重命名：点卡片上的「重命名」改标题，本机存档的列表、预览标题和下载文件名同步更新，对话正文不变；公开分享页 `/share/<id>` 在服务端，标题保持识别时的样子。
- 隐私边界：访客打开网页看不到任何别人的存档——存档列表只在本机浏览器里；服务端管理接口（列表、预览、下载、管理员删除、备份导出）默认关闭，设置 `ADMIN_KEY` 后才能使用。另有按单条分享专属撤销令牌保护的撤销接口：令牌只交给创建记录的浏览器，服务端仅存哈希。公开分享出口 `/share/<id>` 无需登录，任何拿到链接的人都能读取内容。
- 移动端可用：窄屏下输入框和按钮自动竖排，卡片单列。

## 生成选项（保留什么、删掉什么）

识别时界面上一排勾选，链接模式和粘贴模式共用，勾了什么，文档、对话稿和存档就按什么来存：

| 选项 | 勾上（默认不勾）的效果 | 默认 |
|---|---|---|
| 只留正文 | 思考过程、联网搜索等非正文片段全部删除，只留用户与 DeepSeek 的正文问答；只剩非正文内容的消息整条移除 | 不勾（保留思考过程，文档里折叠） |
| 保存标题 | 不勾时不用首条提问派生的标题，文档标题固定为「DeepSeek 对话」 | 勾 |
| 保存原始链接 | 不勾时文档、对话稿、存档摘要里都不再出现原始链接 | 勾 |
| 保存时间信息 | 不勾时文档不按日期分节、不带逐条时间，存档列表显示「未保存时间」 | 勾 |

## AI 对话稿（给其他 AI 应用用）

结果页和存档里除了 HTML / Markdown 文档，还多一种输出：「AI 对话稿」。它不做文档排版，是一份标准 Markdown 文本：标题、原始 DeepSeek 分享链接块，然后按对话先后用 `## 用户` / `## DeepSeek` 二级标题标注角色，正文原样保留，永远不含思考过程。

关于「让市面上大众 AI 应用都能识别」要如实说明：各 AI 应用（ChatGPT、Claude、Kimi、Grok 等，包括 Today）没有统一的外链内容互认协议，谁都不保证能直接打开一条链接读取内容。所以对话稿采用最大兼容的形式：直接复制（结果页「复制 AI 对话稿」按钮）或下载后粘贴进任何 AI 应用的输入框，AI 都能按角色读懂并继续对话；对话稿里附的原始 DeepSeek 分享链接，能否被目标应用读取取决于该应用自己支不支持抓取外链。界面上也按此说明，不夸大。

存档里保存什么同样跟着生成选项走：标题、原始链接、时间信息、思考过程，不勾的就不存进文档与摘要；存档文件本身仍保留文档与对话稿全文；新记录的「删除并关闭分享」会同时删除本机副本和服务端分享记录，旧记录则可能只能在本机删除。

## 跨 AI 平台读取（公开分享链接）

每份识别存档的对话有一个内容 ID 和一组公开出口，同一份内容、多种格式，无需登录、无特殊请求头、UTF-8：

| 出口 | 内容 |
|---|---|
| `https://<你的域名>/share/<id>` | 主入口：服务端直接返回完整 HTML 页面，标题、角色标记、日期、正文全文都在页面里，不依赖 JavaScript |
| `/share/<id>.md` | 对话稿 Markdown（与结果页「AI 对话稿」同一份内容） |
| `/share/<id>.txt` | 纯文本版：【用户】/【DeepSeek】角色行 + 正文 |
| `/share/<id>.json` | 结构化数据：元信息 + 逐条消息（角色、时间、分片类型，含思考过程原文） |

ChatGPT、Claude、Kimi、Grok 这类具备网页读取能力的 AI 应用，把 `/share/<id>` 链接发给它们即可读取。链接按请求域名自动生成（部署到 Render 后就是 `https://xxx.onrender.com/share/<id>`），也可用 `BASE_URL` 环境变量固定域名。结果页显示可点击的分享链接和「复制链接」按钮，存档卡片同样有「复制链接」。

如实说明：各应用是否真的会去抓、能读到什么，取决于各自版本与配置（比如是否开启浏览 / 联网功能）。链接本身是公开 https、服务端返回、不依赖 JS，符合网页读取条件，但不保证所有 AI 应用都会读取；Hark、Muse、Wabi、Today 需逐个实测后才能确认，本项目不替它们背书。

PDF 出口暂不提供：现有依赖里没有轻量可靠的 HTML 转 PDF 方案，加 puppeteer 这类会明显拖累部署体积，按成本判断先不做。

分享链接默认公开，任何拿到链接的人都能读到对话内容。新生成记录可在存档中点「删除并关闭分享」撤销：服务端校验创建时发给本机的随机令牌后删除分享内容，所有分享格式随即返回不存在；链接只暴露内容 ID，不含撤销令牌。旧记录若没有本机撤销凭据，或已清除浏览器数据，可用管理员接口删除。撤销无法收回他人已复制或下载的内容。本机重命名不影响分享页内容。

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

服务端 `src/fetchShare.js` 负责带浏览器 UA、referer、20 秒超时地请求 DeepSeek 接口；前端只做输入、预览、下载，所以没有 CORS 问题。转换过程中，完整生成结果会由服务端保存到 `data/`，供公开分享出口读取；浏览器也会在 IndexedDB 保留一份本机副本。

## 关于时间（逐条时间有没有）

**有。** 分享接口给每条消息都带 `inserted_at`，所以文档按消息真实时间分组，节标题形如 `2026-04-26 星期日`，每条消息头显示 `05:15 · DeepSeek`。时区默认 `Asia/Shanghai`，页面上可切换；示例样本的 UTC 时间是 2026-04-25 21:15，换算到北京时间是 2026-04-26 05:15，正好跨日，测试里也覆盖了这个点。

只有「粘贴全文」兜底模式没有逐条时间，那时统一挂到你选的日期，文档里会写明「时间粒度只到日」。

## 文档排版

HTML 文档内置三种排版风格，body 上的 `doc-classic` / `doc-plain` / `doc-bubbles` class 决定用哪一套；同一份文档三套样式都在，切风格不重新生成正文。合订本 HTML 沿用第一篇所选风格。

- 按日期分节，节标题滚动时固定在顶部（sticky），并标注该日条数。
- 用户消息浅蓝底，DeepSeek 消息白底；每条带角色和时间。
- 代码块带语言标签（没有语言标记时标 `text`），保留换行和缩进，横向可滚。
- 思考过程默认折叠（`<details>`），点击展开，正文完整保留。
- 内容里的原始 HTML 会被转义，避免把别人对话里的标签当页面结构执行。
- 纯静态 HTML，不带脚本，长对话也不会卡；另附打印样式。

消息顺序按对话先后输出，保证「先问后答」：DeepSeek 按 parent_id 链重排（接口数组不保证链序，且同一问答回的用户/助手时间戳可能相同）；时间戳相同或缺失时保持解析出的先后顺序，不靠时间戳重排。

## 兜底路径

1. **接口失败自动回退**：接口报错时，服务端会再抓一次分享页 HTML，先在 `<script>` 里找内嵌的 `"messages":[...]` JSON，再退到 `cheerio` 的 DOM 启发式提取（`.ds-markdown` 之类），能拿到就照常出文档，并在文档里注明用的是兜底解析。
2. **粘贴全文**：不管上面哪种失败，页面切到「粘贴全文」把内容贴进来就能生成。支持三种写法：
   - 带角色标记：`用户：...` / `DeepSeek：...`（也认 `User:` / `Assistant:` / `【用户】`）
   - 直接粘贴分享页全选复制的内容：按 `Thought for N seconds`、`已思考（用时 N 秒）` 这类行切分问答
   - 什么标记都没有：整段作为一条「未标注角色」的记录，照样出文档，并提示加标记的方法

## 存档保存在哪：本机优先

2026-11-06 起存档默认本地化：

- 浏览器（你的手机 / 电脑）：IndexedDB 保存完整文档和每条新分享的撤销令牌。本机存档列表、预览、下载与合订导出从这份副本读取。换浏览器、换设备或清除浏览器数据会丢失副本与撤销令牌；重要内容请下载备份。
- 服务端 `data/`：每次识别或粘贴生成时，服务端都会保存完整生成结果，用于公开分享出口 `/share/<id>`。这不是纯本机处理；访问公开分享链接无需登录。管理列表、预览、下载与备份接口需要 `ADMIN_KEY`。
- 删除行为：新生成记录的「删除并关闭分享」会把专属撤销令牌发给服务端，服务端只保存其哈希；凭据通过后删除服务端记录并清掉本机副本，因此该分享的 HTML、Markdown、文本和 JSON 出口都失效。无撤销令牌的旧记录，按钮只删本机副本，服务端链接仍有效；旧记录可由管理员用下方接口清理。清除浏览器数据后也会失去撤销令牌。删除不会收回别人先前复制或下载的内容。生成选项决定保存内容包含哪些标题、原始链接、时间信息与思考过程。

### 备份、清理与持久化

- 备份导出：设置 `ADMIN_KEY=你的密钥` 部署后，`curl -H "x-admin-key: 你的密钥" https://你的域名/api/backup -o backup.json` 一次导出 `data/` 里全部存档。建议在 Render 免费实例每次重启前先导。
- 清理服务端单条（管理员方式，适用于旧记录或本机撤销令牌遗失）：`curl -X DELETE -H "x-admin-key: 你的密钥" https://你的域名/api/result/<id>`。新记录也可直接在原浏览器存档卡片中点「删除并关闭分享」。
- Render 持久磁盘：付费档挂磁盘后把应用根目录设为挂载点，`data/` 重启不丢；免费档磁盘随重启重置，靠上面的导出备份。
- Docker / VPS：`docker run -v $(pwd)/data:/app/data ...` 把 `data/` 挂到宿主机，重启不丢。

## 已知限制

- 接口不是官方公开 API，DeepSeek 随时可能改字段或加风控；改了就靠上面的兜底路径。
- 分享接口返回的标题常常只是通用占位（实测 DeepSeek 就是 `Shared Conversation`），这时文档标题取首条提问前 28 个字，并在文档里标注。
- 拿不到逐条时间戳时，文档会明确写「对话日期未知（导入日期 今天）」，不编造时间。
- 服务端 `data/` 会保存用于公开分享的完整记录；Render、Railway 免费实例磁盘随重启重置，可能使分享和管理员存档一并丢失。浏览器 IndexedDB 另存本机副本及新分享撤销凭据；清除浏览器数据会失去这些本机数据。应对见「存档保存在哪：本机优先」一节。
- 撤销只删除本站服务端记录；不能撤回别人已复制、下载或另行保存的内容。旧记录或遗失撤销凭据的记录，需管理员凭 `ADMIN_KEY` 清理。
- 只解析单条分享链接里的对话；需要登录才能看的对话抓不到。
- 分享链接是公开的：拿到 `/share/<id>` 的人无需登录就能读到该份对话全文；注意别把敏感对话的链接发到公开场合。
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

Docker 自建：仓库带 Dockerfile（node:22-alpine，`npm install --omit=dev && npm start`，端口读 PORT）。

```bash
docker build -t deepseek-to-doc .
docker run -d --name deepseek-to-doc -e PORT=8080 -p 8080:8080 --restart unless-stopped deepseek-to-doc
# 浏览器打开 http://<服务器IP>:8080
```

不想用 Docker，装好 Node 20.18.1+ 后 `npm install && npm start` 也一样能跑；要存档不丢就把 `data/` 挂到持久盘或备份。

## 目录结构

```
deepseek-to-doc/
├── .gitignore            # 忽略 node_modules / 日志 / .env / data
├── render.yaml           # Render Blueprint（一键部署）
├── data/                 # 运行时生成的公开分享内容（不进 git；界面存档在浏览器 IndexedDB）
├── src/
│   ├── convert.js        # 识别转换入口（三平台分发 + 粘贴）
│   ├── archive.js        # data/ 目录持久化存档
├── .dockerignore           # Docker 构建时排除的内容
├── Dockerfile              # node:22-alpine，VPS / Zeabur 用
├── LICENSE                # MIT
├── server.js              # Express 服务：代理抓取、生成、预览、下载
├── src/
│   ├── shareUrl.js        # 链接 → share id（只认 DeepSeek）
│   ├── fetchShare.js      # 调分享接口（带超时、错误码映射）
│   ├── parseShare.js      # 接口 JSON → 统一对话模型（parent_id 链排序）
│   ├── htmlFallback.js    # 分享页 HTML 兜底解析
│   ├── paste.js           # 粘贴全文解析
│   ├── convert.js         # 生成选项套用 + 转换编排
│   ├── groupByDate.js     # 按日期分组
│   ├── renderHtml.js      # HTML 文档
│   ├── renderMarkdown.js  # Markdown 文档
│   ├── renderTranscript.js # AI 对话稿（给其他 AI 应用粘贴用）
│   ├── markdown.js        # marked 封装（转义、标题降级、代码块标签）
│   ├── localtime.js       # 时区换算
│   └── filenames.js       # 文件名清洗
├── public/                # 页面（原生 HTML/CSS/JS，无构建）
├── samples/               # 实测样本
└── test/                  # node:test 用例
```

## 隐私

转换后的完整文档会发送到本应用服务端，并保存在 `data/` 目录供公开分享链接读取；浏览器另外保存一份 IndexedDB 副本。分享链接默认公开，任何拿到链接的人都可读取。新记录可在创建它的浏览器中撤销分享并删除服务端副本；不要导入含敏感信息的对话，除非你接受服务端存储与公开链接的风险。
