# Rin 公开文章 SEO 优化实施方案

## 1. 背景与现状

当前 Rin 部署在 Cloudflare，前端是 Vite + React SPA，后端是 Cloudflare Worker + D1/对象存储。访问 `/feed/:id` 时，未执行 JavaScript 的客户端只能获得 `index.html` 外壳：

```html
<div id="root"></div>
<script type="module" src="/assets/index-....js"></script>
```

文章内容由浏览器加载 React 后再请求 API 渲染。这样会导致搜索引擎需要进行额外的 JavaScript 渲染，影响抓取速度、正文发现和站内链接发现。

仓库已有以下可复用基础：

- `client/src/components/site-meta.tsx`：页面元数据入口；
- `scripts/seo-render.ts` / `cli/src/tasks/seo-render.ts`：预渲染任务雏形；
- `/rss.json`：公开文章数据源，包含 `id`、`url`、`title`、`summary`、`content_html`、`image`、`date_modified` 和作者信息；
- Cloudflare Worker、D1、R2/S3 兼容对象存储和边缘缓存能力。

## 2. 目标与非目标

### 目标

第一版只优化公开文章的检索和收录：

- `/feed/:id`：正式文章 URL；
- `/:alias`：公开别名入口，canonical 指向正式文章 URL；
- `/`：作为文章发现入口；
- 为公开文章提供可直接读取的 HTML、canonical、摘要、Open Graph、JSON-LD 和内部链接；
- 提供 sitemap、robots 和 Feed 声明；
- 文章发布/修改后可刷新预渲染内容和缓存。

### 非目标

第一版不做完整 React SSR，不迁移 Wouter，不迁移到 VPS，也不重构整个前端架构。以下页面不参与索引：

```text
/admin/*
/login
/profile
/search/*
/writing/*
/callback
/api/*
```

## 3. 方案选择

采用“公开文章预渲染 HTML + Worker 路由返回 + RSS 作为内容源”的方案。

```text
文章数据 / rss.json
        ↓
预渲染器生成文章 HTML
        ↓
R2、S3 兼容存储或 Cloudflare Cache
        ↓
Worker 请求 /feed/:id
        ↓
返回包含正文和 SEO 元数据的 HTML
        ↓
浏览器加载 React 资源并继续接管交互
```

选择理由：

- 保留现有 Cloudflare Worker + D1 架构；
- 利用已有 `seo-render` 和 RSS 数据，不从 SPA 反向抓取；
- 公开文章优先获得完整首屏 HTML；
- 管理、登录等页面继续使用现有 SPA；
- 后续仍可演进为 Worker 动态 SSR。

## 4. 组件和职责

### 4.1 公开内容读取层

统一读取公开文章数据，优先复用 RSS/JSON Feed 的字段。需要保证文章 URL、标题、正文、作者、图片和修改时间可稳定获得，并过滤私有文章。

### 4.2 文章 HTML 生成器

新增独立的 HTML 生成模块，输入文章数据，输出完整文档。不得依赖浏览器 DOM。生成内容至少包括：

- `<title>`；
- `description`；
- `robots`；
- `canonical`；
- Open Graph 和 Twitter Card；
- `Article` JSON-LD；
- 面包屑 JSON-LD；
- `<h1>`、作者、时间和 `<article>` 正文；
- 真实的 `<a href>` 内部链接。

HTML 生成必须安全处理标题、摘要、作者和 URL，文章正文沿用现有受信任的 Markdown/HTML 清洗规则，避免引入 XSS。

### 4.3 Worker 公开页面路由

Worker 对 `/feed/:id` 和公开别名请求预渲染 HTML：

1. 查找预渲染缓存；
2. 命中则返回 HTML；
3. 未命中时使用统一内容读取层生成或回退到 SPA；
4. 正文不存在时返回真实 404，而不是把所有未知路径都返回 200 首页。

预渲染内容和 React 页面必须基于同一份文章数据，避免爬虫和用户看到不同内容。

### 4.4 元数据组件

扩展 `SiteMeta`，统一处理 title、description、canonical、robots、Open Graph、Twitter Card 和 JSON-LD。各页面不再重复写相同的 meta 标签。

## 5. 搜索引擎入口

### robots.txt

允许公开文章，禁止私有功能页和 API，并声明 sitemap：

```text
User-agent: *
Allow: /

Disallow: /admin/
Disallow: /login
Disallow: /profile
Disallow: /search/
Disallow: /writing/
Disallow: /callback
Disallow: /api/

Sitemap: https://rin.6143443.xyz/sitemap.xml
```

### sitemap.xml

从公开文章数据生成，只收录正式 `/feed/:id` URL，使用 `date_modified` 填充 `<lastmod>`。若文章量增长，按搜索引擎限制拆分 sitemap 文件。

### Feed 声明

在公共页面 head 增加：

```html
<link rel="alternate" type="application/feed+json" href="/rss.json" title="cyz" />
```

## 6. 索引策略

公开文章页：

```html
<meta name="robots" content="index,follow" />
```

搜索、登录、后台、个人资料、写作和回调页面：

```html
<meta name="robots" content="noindex,follow" />
```

`/search/*` 不进入 sitemap。别名页面必须使用 canonical 指向正式文章 URL，避免重复收录。

## 7. 缓存与更新

预渲染 HTML 可存放在 R2/S3 兼容对象存储，并由 Worker 或 Cloudflare Cache 提供边缘缓存。建议初始响应头：

```http
Content-Type: text/html; charset=utf-8
Cache-Control: public, max-age=300, s-maxage=3600
```

文章新增或修改时执行：

```text
保存文章
  ↓
更新 rss.json
  ↓
生成 /feed/:id HTML
  ↓
刷新 sitemap lastmod
  ↓
清理旧缓存
  ↓
可选：使用 IndexNow 通知 Bing
```

预渲染任务不应依赖访问线上 SPA 页面来发现链接，以免被 Cloudflare 挑战页、网络波动或 JS 加载影响。优先从 RSS/公开 API 获取完整 URL 集合。

## 8. 内部链接要求

公开 HTML 中必须输出真实链接：

- 首页到文章页；
- 文章到标签页；
- 上一篇/下一篇；
- 相关文章；
- 作者或公开归档页；
- 分页入口（如存在）。

避免只使用 `onClick`、`window.location` 或无限滚动作为唯一导航方式。

## 9. 安全和 Cloudflare 注意事项

- 不根据 User-Agent 返回完全不同的文章内容，避免 cloaking；
- 预渲染 HTML 与正常 React 页面使用相同数据；
- 私有文章不得写入 sitemap、RSS 或预渲染缓存；
- 对文章正文沿用 HTML 清洗和 URL 校验；
- 检查 Cloudflare WAF/Bot 管理规则，避免误拦 Googlebot/Bingbot；
- 对未找到的文章返回 404；
- API、管理页和认证页不应被缓存为公共 HTML。

## 10. 实施顺序

### 阶段一：基础 SEO

- 扩展 `SiteMeta`；
- 补齐 canonical、robots、Open Graph、Twitter Card 和 JSON-LD；
- 调整 robots.txt；
- 新增 sitemap.xml；
- 增加 Feed alternate link；
- 为私有页面设置 noindex。

### 阶段二：公开文章预渲染

- 提取公开文章读取层；
- 实现文章 HTML 生成器；
- 改造 `seo-render`，从 RSS/公开 API 获取 URL；
- 将预渲染 HTML 写入 R2/S3 或缓存；
- 在 Worker 中接入 `/feed/:id` 和别名路由；
- 实现文章更新后的刷新和失效。

### 阶段三：验证和搜索引擎接入

- 用 curl 验证 HTML；
- Google Search Console 提交 sitemap；
- Bing Webmaster Tools 提交 sitemap；
- 可选接入 IndexNow；
- 检查 Cloudflare 日志和爬虫状态。

## 11. 验收标准

### 页面 HTML

```bash
curl -L https://rin.6143443.xyz/feed/31
```

输出中必须直接包含：

- `<title>`；
- `<h1>`；
- 文章正文；
- `<link rel="canonical">`；
- `application/ld+json`；
- 真实 `<a href>` 内部链接。

### 站点文件

```bash
curl -i https://rin.6143443.xyz/robots.txt
curl -i https://rin.6143443.xyz/sitemap.xml
curl -i https://rin.6143443.xyz/rss.json
```

三者都应返回 200，Content-Type 正确，sitemap 只包含公开正式文章 URL。

### 功能和安全

- 公开文章可以在未登录状态访问；
- 私有页面输出 `noindex`；
- 不存在的文章返回 404；
- 文章修改后 HTML、RSS 和 sitemap 时间可更新；
- 预渲染页面与 React 页面正文一致；
- Cloudflare 挑战页不会被保存为文章 HTML。

## 12. 后续扩展

当公开文章预渲染稳定后，再评估：

- Worker 内动态生成 HTML，减少离线构建依赖；
- RSS 2.0 与 JSON Feed 双格式；
- IndexNow 自动通知 Bing；
- 文章标签、作者和归档页的独立 SEO；
- 在确实需要时迁移到完整边缘 SSR。

