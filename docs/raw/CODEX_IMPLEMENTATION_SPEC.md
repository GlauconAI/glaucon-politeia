# Vibe Academy 完整项目实现文档

本文档用于在新的 Codex 项目中从零实现 `Vibe Academy`。目标是复刻当前项目的完整产品功能、页面结构、数据模型、权限规则和关键交互。

## 1. 项目定位

`Vibe Academy` 是一个面向 AI 编程学习记录的内容社区型网站，整体参考 dev.to 的三栏内容信息流体验。

核心目标：

- 发布和沉淀 AI 编程学习笔记。
- 支持登录、注册、个人资料、头像、评论、点赞、收藏。
- 通过标签组织文章内容。
- 提供 Markdown 写作和阅读体验。
- 提供一个 Bruno Simon 风格的 3D 互动导航实验页。
- 自动采集站内用户提交的 Prompt，并提供管理员后台检索、导出、标记、删除和归档能力。
- 附带一个本地 TODO 工具页，作为可运行项目样例。

## 2. 推荐技术栈

- Framework: Next.js App Router
- Language: TypeScript
- UI: React + Tailwind CSS
- Auth/Data/Storage: Supabase
- Markdown: react-markdown + remark-gfm + rehype-highlight
- 3D: three + @react-three/fiber + @react-three/drei
- Icons: lucide-react
- Date: date-fns
- Test: Vitest + Testing Library

## 3. 环境变量

必须支持：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`，用于服务端归档等管理操作
- `PROMPTS_RETENTION_SECRET`，Prompt 归档接口鉴权
- `PROMPTS_DEV_ACCESS_HELP`，开发环境后台访问辅助提示，可选

## 4. 全局体验与布局

### 4.1 全局页面结构

全站采用固定顶部导航 + 桌面三栏布局：

- 顶部 Header 固定在顶部。
- 左侧导航栏在桌面端显示。
- 中间为主内容。
- 右侧信息面板在桌面端显示。
- 移动端隐藏左右栏，主内容单列展示。

页面最大宽度约 `1280px`，顶部预留 Header 高度。

### 4.2 顶部 Header

Header 包含：

- 品牌入口：`Vibe Academy`
- 副标题：`Vibe First, Code Later — My AI Coding Journey`
- 搜索框：输入关键词后跳转 `/search?q=...`
- 写作按钮：跳转 `/editor`
- 主题切换按钮
- 用户菜单

用户菜单行为：

- 未登录：显示“登录”，点击进入 `/auth`
- 已登录：显示用户邮箱，点击展开菜单
- 菜单项：
  - 个人资料：`/profile/me`
  - 退出登录：调用 Supabase signOut，然后刷新页面

### 4.3 左侧导航

固定导航项：

- 首页：`/`
- 互动实验：`/lab/world`
- TODO：`/todos`
- Vibe Coding：`/tags/vibe-coding`
- Trae Solo：`/tags/trae-solo`
- 我的项目：`/tags/projects`
- 踩坑日记：`/tags/pitfalls`
- 个人资料：`/profile/me`
- Prompt 管理：`/admin/prompts`

左侧还需要一块说明区：

- 支持写作、评论、点赞、收藏与资料维护。
- 布局与交互对标 dev.to，专注内容展示。

### 4.4 右侧面板

右侧包含：

- 欢迎卡片
  - 标题：欢迎来到 Vibe Academy
  - 简介：这里记录 AI 编程学习笔记
  - 按钮：开始写作、了解 Vibe Coding
- 热门标签
  - Vibe Coding
  - Trae Solo
  - 项目
  - 踩坑

## 5. 主题系统

支持浅色/深色主题切换。

要求：

- 页面初始加载时避免主题闪烁。
- 使用本地存储保存用户选择。
- 支持 system/light/dark 中至少 light/dark 两种实际渲染结果。
- Header、卡片、输入框、按钮、Markdown 内容、后台表格均需适配暗色模式。

## 6. 认证系统

### 6.1 登录/注册页

路径：`/auth`

功能：

- 邮箱密码登录。
- 邮箱密码注册。
- GitHub OAuth 登录。
- Google OAuth 登录。
- 支持 `redirectTo` 查询参数，登录成功后返回目标页面。
- 缺少 Supabase 环境变量时显示明确错误提示。

注册行为：

- 调用 Supabase `signUp`。
- 如果 Supabase 开启邮箱验证，显示“请前往邮箱完成确认”一类提示。

登录行为：

- 调用 Supabase `signInWithPassword`。
- 登录成功后确保 profile 存在。
- 跳转 `redirectTo` 或首页。

### 6.2 OAuth Callback

路径：`/auth/callback`

行为：

- 读取 URL 中的 `code`。
- 调用 Supabase `exchangeCodeForSession`。
- 跳转 `redirectTo` 或首页。

### 6.3 Profile 自动创建

当用户首次登录或访问 `/profile/me`：

- 如果 `profiles` 表中没有当前用户记录，自动创建。
- `username` 基于邮箱前缀 slug 化，并追加随机数或 user id 片段避免冲突。
- `display_name` 默认使用邮箱前缀。
- `bio` 和 `avatar_url` 默认为空字符串。

## 7. 内容系统

### 7.1 首页文章流

路径：`/`

功能：

- 展示已发布文章。
- 每页 10 条。
- 按 `published_at` 倒序。
- 支持 `?page=数字` 分页。
- 显示上一页/下一页。
- 空状态提示“暂无文章，可以从写作发布第一篇”。

首页顶部需要介绍卡：

- 标题：Vibe Academy
- 副标题：Vibe First, Code Later — My AI Coding Journey
- 简介：dev.to 风格三栏布局，支持登录/评论/点赞/收藏/个人资料，数据保存到 Supabase。
- 主按钮：查看互动实验模块，跳转 `/lab/world`

### 7.2 文章卡片

每个文章卡片显示：

- 标题，点击进入 `/posts/[slug]`
- 作者昵称，点击进入 `/profile/[username]`
- 发布时间相对时间
- 摘要
- 标签列表
- 点赞按钮和数量
- 收藏按钮和数量

交互：

- 未登录点击点赞/收藏，跳转 `/auth?redirectTo=当前路径`
- 已登录点击点赞：插入或删除 `post_reactions`
- 已登录点击收藏：插入或删除 `bookmarks`
- 点赞/收藏采用乐观 UI 更新，结束后刷新当前路由数据

### 7.3 写作页

路径：`/editor`

字段：

- 标题
- 标签，最多选择 3 个
- Markdown 正文

操作：

- 保存草稿
- 发布

规则：

- 未登录提交时跳转 `/auth?redirectTo=/editor`
- 标题和正文为空时按钮禁用
- slug 根据标题生成，最大 64 字符
- 如果 slug 已存在，追加随机 4 位数字
- 摘要从 Markdown 正文自动生成，去除代码块、行内代码和 Markdown 符号，默认最多 140 字
- 保存草稿：`status = draft`，`published_at = null`
- 发布：`status = published`，`published_at = 当前时间`
- 成功后跳转 `/posts/[slug]`

标签：

- 写作页从 `tags` 表读取已有标签。
- 前端最多允许选中 3 个。
- 发布成功后写入 `post_tags`。

当前版本没有实现：

- 编辑已有文章
- 删除文章
- 新建标签 UI

新实现可以先保持一致，也可以作为后续增强。

### 7.4 文章详情页

路径：`/posts/[slug]`

功能：

- 根据 slug 查询文章。
- 不存在时返回 404。
- 显示面包屑：首页 / slug。
- 显示标题、作者、标签。
- 显示点赞/收藏操作。
- 渲染 Markdown 正文。
- 显示评论区。

Markdown 要求：

- 支持 GFM。
- 支持代码高亮。
- 支持暗色模式。

### 7.5 搜索页

路径：`/search?q=关键词`

功能：

- 搜索已发布文章。
- 搜索范围：标题和正文。
- 返回最多 30 条。
- 结果使用文章卡片展示。
- 无关键词时提示“请输入关键词后再搜索”。
- 无结果时提示“没有找到相关结果”。
- 提供返回首页链接。

实现注意：

- 需要对用户输入做安全处理，避免 Supabase `.or()` 查询字符串被特殊字符破坏。

### 7.6 标签页

路径：`/tags/[tag]`

功能：

- 根据标签 slug 查询标签。
- 不存在返回 404。
- 展示标签名称和描述。
- 查询该标签下已发布文章。
- 文章按发布时间倒序。
- 文章卡片展示点赞、收藏、作者状态。
- 无文章时显示空状态。

## 8. 评论系统

### 8.1 评论区

文章详情页下方显示评论区。

功能：

- 显示评论总数。
- 支持一级评论和嵌套回复。
- 按 `created_at` 升序。
- 评论内容使用 Markdown 渲染，支持 GFM 和代码高亮。
- 评论作者显示昵称；无资料时显示“匿名”。

### 8.2 发布评论

功能：

- 评论输入框支持 Markdown。
- 未登录提交时跳转登录页。
- 已登录用户可发布一级评论。
- 提交成功后清空输入框并刷新页面数据。
- 失败时显示错误提示。

### 8.3 回复评论

功能：

- 每条评论有“回复”按钮。
- 点击后进入回复状态。
- 回复提交时写入 `parent_id`。
- 支持取消回复。

### 8.4 删除评论

规则：

- 只有评论作者本人看到删除按钮。
- 删除时必须同时过滤 `id` 和 `author_id`。
- 删除成功后刷新页面数据。

## 9. 用户个人主页

### 9.1 `/profile/me`

行为：

- 未登录：跳转 `/auth?redirectTo=/profile/me`
- 已登录但无 profile：自动创建 profile，然后跳转真实 username 页面
- 已登录且有 profile：跳转 `/profile/[username]`

### 9.2 公开资料页

路径：`/profile/[username]`

显示：

- 头像
- 昵称
- username
- 简介
- 文章列表

如果 profile 不存在，跳转首页。

### 9.3 本人编辑资料

只有当前登录用户访问自己的 profile 时显示编辑区。

可编辑：

- 昵称
- 个人简介
- 头像

头像上传：

- 使用 Supabase Storage。
- bucket 名称：`avatars`
- 建议 public。
- 上传路径：`{user_id}/{uuid}.{ext}`
- 上传成功后获取 public URL 并写入 `profiles.avatar_url`。

保存行为：

- 昵称和简介通过保存按钮更新。
- 头像选择文件后立即上传并保存。
- 成功显示“已保存”。
- 失败显示错误信息。

### 9.4 我的内容

本人主页有 Tab：

- 我的文章
- 我的收藏

我的文章：

- 显示该用户所有文章，包括草稿和已发布。
- 本人可看到状态徽标：
  - 已发布
  - 草稿

其他用户主页：

- 展示文章列表。
- 当前实现会查询该作者全部文章；重新实现时建议只向非本人展示 published 文章。

我的收藏：

- 仅本人可见。
- 从 `bookmarks` 查询收藏文章。
- 按收藏时间倒序。
- 只展示已发布文章。

## 10. Prompt 自动采集系统

这是项目的后台数据能力，必须作为独立模块实现。

### 10.1 客户端采集 Provider

全站包裹 `PromptCaptureProvider`。

监听事件：

- `submit`
- `click`
- `keydown`

采集来源：

- 表单内 textarea。
- 表单内 contenteditable。
- 点击提交类按钮时，从所属 form/section/main/body 找最长的 textarea 或 contenteditable 文本。
- textarea 中按 `Ctrl + Enter` 或 `Cmd + Enter` 也触发采集。

提交按钮识别：

- button type submit。
- 文案或 aria-label 包含：
  - 发送
  - 提交
  - 发布
  - 保存
  - send
  - submit
  - publish
  - save

过滤规则：

- 不采集 `/auth` 路径。
- 不采集 password 表单。
- 不采集包含 `autocomplete=current-password` 或 `autocomplete=new-password` 的表单。
- 文本 trim 后长度必须在 3 到 20000 之间。

### 10.2 客户端 session 和幂等 key

client session:

- localStorage key：`prompt_capture_client_session_id`
- 如果不存在，生成 random UUID。

idempotency key:

- 使用 sha256。
- 输入由以下内容组合：
  - clientSessionId
  - sourceUrl
  - content
  - 当前分钟 bucket

### 10.3 客户端提交与重试

提交接口：

- `POST /api/prompts`

请求体：

- `content`
- `clientSessionId`
- `sourceUrl`
- `idempotencyKey`

要求：

- 使用 `keepalive: true`
- 失败时最多自动重试 3 次
- 延迟大约为 250ms、700ms、1600ms，并加少量随机 jitter
- 重试时显示 Toast
- 成功显示“Prompt 已记录”
- 失败写入重试队列并显示“Prompt 记录失败，已加入重试队列”

失败队列：

- localStorage key：`prompt_capture_failures_v1`
- 最多 50 条
- 字段：
  - idempotencyKey
  - attempts
  - lastError
  - lastAttemptAt
  - payload
  - contentLength
- 浏览器恢复 online 时自动 flush。

### 10.4 Prompt 入库接口

接口：`POST /api/prompts`

服务端行为：

- 解析 JSON。
- 校验 content/clientSessionId/sourceUrl/idempotencyKey。
- 获取当前 Supabase 用户，允许匿名。
- 获取 IP：
  - 优先 `x-forwarded-for`
  - 其次 `x-real-ip`
- 获取 user-agent，最多 512 字符。
- 检测敏感内容。
- 插入 `prompts`。

响应：

- 新增成功：201，返回 `{ id, createdAt }`
- 幂等重复：200，返回 `{ id, createdAt, idempotent: true }`
- 参数错误：400
- 入库失败：500

### 10.5 敏感内容检测

需要检测常见密钥/令牌形态。

现有高亮默认词：

- `sk-`
- `sb_publishable_`
- `eyJ`

flags 格式：

```json
{
  "has_sensitive": true,
  "sensitive_hits": [{ "type": "openai_key" }]
}
```

## 11. Prompt 管理后台

### 11.1 权限规则

路径：`/admin/prompts`

访问条件：

- 当前用户已登录。
- `profiles.is_admin = true`

非管理员：

- 生产环境返回 404。
- 开发环境如果 `PROMPTS_DEV_ACCESS_HELP=1`，显示开发辅助信息。

### 11.2 后台页面功能

后台包含：

- 标题和说明。
- 导出 CSV 按钮。
- 最近 24 小时提交趋势。
- 筛选区。
- Prompt 表格。
- 分页控件。
- 批量标记/删除。

筛选字段：

- 关键词：Postgres websearch 全文检索
- 来源 URL：模糊匹配
- 用户 ID：精确匹配
- 高亮词：前端展示用，逗号分隔
- 开始时间：ISO 字符串
- 结束时间：ISO 字符串
- 每页条数：10、20、50、100

表格列：

- 选择框
- 时间
- 来源
- 用户
- 内容
- 标记

内容展示：

- 保留换行。
- 自动换行。
- 按高亮词 mark。
- 如果 flags.has_sensitive 为 true，显示“敏感命中”徽标。
- 显示 client session id。

### 11.3 Prompt 查询接口

接口：`GET /api/prompts`

仅管理员可访问。

查询参数：

- `q`
- `from`
- `to`
- `userId`
- `source`
- `page`
- `pageSize`

行为：

- 只查询 `deleted_at is null`。
- 默认 page = 1。
- pageSize 限制 1 到 100。
- 按 `created_at desc`。
- `q` 使用 `content_tsv` 的 websearch。

返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

### 11.4 批量操作接口

接口：`POST /api/prompts/bulk`

仅管理员可访问。

请求体：

```json
{
  "ids": ["uuid"],
  "op": "mark",
  "reason": "manual"
}
```

支持 op：

- `mark`
- `unmark`
- `delete`

规则：

- ids 必须是 UUID。
- ids 数量 1 到 500。
- `delete` 是软删除，更新 `deleted_at`。
- `mark` 更新 `marked = true` 和 `marked_reason`。
- `unmark` 清除标记。

### 11.5 CSV 导出接口

接口：`GET /api/prompts/export`

仅管理员可访问。

支持与查询接口相同的筛选条件：

- q
- from
- to
- userId
- source

行为：

- 最多导出 10000 条。
- 按 `created_at desc`。
- 返回 `text/csv; charset=utf-8`。
- 文件名：`prompts.csv`。

### 11.6 最近 24 小时统计接口

接口：`GET /api/prompts/stats`

仅管理员可访问。

行为：

- 调用 RPC `prompts_stats_last_24h`。
- 返回最近 24 个小时 bucket。
- 没有数据的小时补 0。

返回：

```json
{
  "items": [
    { "bucket": "2026-01-01T00:00:00.000Z", "count": 0 }
  ]
}
```

### 11.7 归档接口

接口：`POST /api/prompts/retention`

鉴权：

- 请求头 `x-retention-secret` 必须等于 `PROMPTS_RETENTION_SECRET`。

行为：

- 使用 Supabase service role client。
- 调用 RPC `archive_prompts`，参数 `days_old = 90`。
- 返回移动数量。

## 12. 内置 TODO 工具页

路径：`/todos`

这是 `Vibe Academy` 内的轻量 TODO 工具，不是独立 `scenario-todo` 项目。

### 12.1 功能

- 创建待办。
- 编辑待办标题。
- 编辑备注。
- 设置优先级：高 / 中 / 低。
- 完成/取消完成。
- 删除待办。
- 筛选：
  - 全部
  - 进行中
  - 已完成
- 排序：
  - 按优先级
  - 创建时间新到旧
  - 创建时间旧到新
- 导出 JSON。
- 导出 CSV。
- 本地持久化。

### 12.2 数据结构

```ts
type TodoPriority = "low" | "medium" | "high"

type Todo = {
  id: string
  title: string
  notes: string
  priority: TodoPriority
  completed: boolean
  createdAt: string
  updatedAt: string
}
```

localStorage key：

- `vibe-academy.todos.v1`

JSON 格式：

```json
{
  "version": 1,
  "todos": []
}
```

### 12.3 页面展示

顶部：

- 标题 TODO
- 功能说明
- 导出 JSON
- 导出 CSV
- 统计：总计、进行中、已完成

表单：

- 标题
- 优先级
- 备注
- 筛选按钮
- 排序选择
- 添加待办按钮

列表：

- 完成状态按钮
- 标题
- 备注
- 优先级 badge
- 创建时间
- 更新时间
- 编辑按钮
- 删除按钮

## 13. 3D 互动实验页

路径：`/lab/world`

### 13.1 页面目标

构建 Bruno Simon 风格的轻量 3D 内容导航实验。它不是普通介绍页，而是网站各核心入口的互动宇宙。

### 13.2 页面结构

- 顶部深色 Hero
  - 标题：Bruno Simon 风格的轻量验证模块
  - 简介：可点击的作品宇宙
  - 操作提示：
    - 滚轮切换卡片
    - 点击卡片进入页面
    - 右侧导航快速切换
- 主体两栏：
  - 左侧 3D World Prototype
  - 右侧说明面板

右侧说明面板：

- 设计拆解
- 探索目标
- 下一步判断标准
- 返回首页按钮

### 13.3 3D 卡片数据

需要至少包含：

- Welcome Gate -> `/`
- Vibe Coding -> `/tags/vibe-coding`
- Trae Solo -> `/tags/trae-solo`
- Pitfall Notes -> `/tags/pitfalls`
- Project Dock -> `/todos`
- Creator Room -> `/profile/me`

每个节点字段：

```ts
type VibeStageSection = {
  id: string
  title: string
  subtitle?: string
  body: string[]
  href: string
  cta: string
  theme: "blue" | "emerald" | "amber" | "violet"
}
```

### 13.4 3D 交互要求

- 使用 Canvas 渲染。
- 卡片沿 Z 轴排布。
- 当前 activeIndex 影响相机位置。
- 鼠标指针产生轻微视差。
- 卡片 hover 时聚焦并改变 cursor。
- 点击非当前卡片：聚焦该卡片。
- 点击当前卡片：跳转对应 href。
- 滚轮切换 activeIndex。
- Enter 打开当前卡片。
- 卡片有浮动、缩放、旋转和 emissive 发光效果。
- 需要 Suspense fallback，避免加载空白。

## 14. 数据库设计

### 14.1 profiles

```sql
profiles (
  user_id uuid primary key,
  username text unique not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### 14.2 posts

```sql
posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  slug text unique not null,
  title text not null,
  excerpt text not null default '',
  content_md text not null,
  status text not null check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

索引：

- `author_id`
- `published_at desc`

### 14.3 tags

```sql
tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text not null default '',
  created_at timestamptz not null default now()
)
```

### 14.4 post_tags

```sql
post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  unique (post_id, tag_id)
)
```

### 14.5 comments

```sql
comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  parent_id uuid,
  content_md text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

索引：

- `(post_id, created_at asc)`

### 14.6 post_reactions

```sql
post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  type text not null default 'like' check (type in ('like')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, type)
)
```

### 14.7 bookmarks

```sql
bookmarks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
)
```

### 14.8 prompts

```sql
prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  client_session_id text not null,
  source_url text not null,
  ip inet,
  user_agent text,
  content text not null,
  idempotency_key text not null,
  flags jsonb not null default '{}',
  marked boolean not null default false,
  marked_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  content_tsv tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  unique (client_session_id, idempotency_key)
)
```

索引：

- `created_at desc`
- `(user_id, created_at desc)`
- `(client_session_id, created_at desc)`
- `(source_url, created_at desc)`
- `content_tsv` GIN

### 14.9 prompts_archive

结构接近 `prompts`，用于归档旧数据。

## 15. RLS 权限规则

### profiles

- 所有人可读。
- 登录用户只能插入自己的 profile。
- 登录用户只能更新自己的 profile。

### posts

- 所有人可读 published 文章。
- 作者可读自己的草稿和已发布文章。
- 登录用户只能创建自己的文章。
- 作者可更新/删除自己的文章。

### tags

- 所有人可读。
- 登录用户可插入标签。

### post_tags

- 所有人可读。
- 只有文章作者可写该文章的 post_tags。

### comments

- 所有人可读。
- 登录用户只能用自己的 user id 创建评论。
- 评论作者可更新/删除自己的评论。

### post_reactions

- 所有人可读。
- 登录用户只能插入/删除自己的 reaction。

### bookmarks

- 当前实现 bookmarks 可被所有人 select。
- 登录用户只能插入/删除自己的 bookmark。
- 新实现建议：公开只读聚合数量，收藏明细只允许本人或管理员读取。

### prompts

- 匿名和登录用户都可 insert。
- 登录用户可读自己的 prompts。
- 管理员可读全部 prompts。
- 只有管理员可 update/delete。

### prompts_archive

- 只有管理员可 select。

## 16. 种子数据

至少需要创建以下标签：

- `vibe-coding` / Vibe Coding
- `trae-solo` / Trae Solo
- `projects` / 项目
- `pitfalls` / 踩坑

可选初始文章：

- Vibe Coding 方法论介绍
- Trae Solo 使用笔记
- 项目复盘
- 踩坑日记

## 17. API 路由清单

- `GET /api/prompts`
- `POST /api/prompts`
- `POST /api/prompts/bulk`
- `GET /api/prompts/export`
- `GET /api/prompts/stats`
- `POST /api/prompts/retention`
- `GET /auth/callback`

其他内容功能当前主要直接通过 Supabase client/server client 访问，不需要单独 API。

## 18. 测试要求

至少覆盖：

- slug 生成和摘要生成
- TODO model：创建、更新、删除、筛选、排序、导出
- TODO storage：localStorage 读写和异常容错
- Prompt validation：字段校验、长度限制、URL 校验
- Prompt sensitive detection
- Prompt idempotency sha256
- Prompt capture rules：敏感表单过滤、URL 过滤、文本提取
- Prompt queue：失败队列增删、上限、重复 key 更新
- Prompt API：
  - POST 成功
  - POST 参数错误
  - POST 幂等重复
  - GET 管理员权限
  - bulk 权限和 UUID 校验
  - export CSV
  - stats 补齐 24 小时
  - retention secret 校验

## 19. 实现优先级

### P0：主产品闭环

1. Supabase client/server 封装。
2. 数据库 migration 和 RLS。
3. 全局布局、主题、Header、左右栏。
4. 登录/注册/OAuth callback。
5. Profile 自动创建和个人主页。
6. 首页文章流。
7. 写作发布。
8. 文章详情和 Markdown 渲染。
9. 评论、点赞、收藏。
10. 标签页和搜索页。

### P1：辅助工具和体验

1. 内置 TODO 页面。
2. 头像上传。
3. 更完善的空状态和错误状态。
4. 移动端体验细化。

### P2：高级系统

1. Prompt 自动采集。
2. Prompt 管理后台。
3. CSV 导出。
4. 统计趋势。
5. 归档接口。

### P3：互动实验

1. 3D World 页面。
2. 卡片滚轮/点击/键盘交互。
3. 性能和移动端兼容优化。

## 20. 当前版本已知缺口

如果完全复刻当前项目，可保留这些缺口；如果重做新版，建议补齐。

- 没有编辑已有文章的页面。
- 没有删除文章的 UI。
- 写作页不能创建新标签。
- 搜索查询需要加强特殊字符转义。
- 非本人 profile 页理论上不应展示草稿，应只展示 published。
- bookmarks 明细当前可公开 select，隐私上建议收紧。
- Prompt 后台批量操作后使用 `window.location.reload()`，可改为局部刷新。
- 3D 页面需要做好加载 fallback 和移动端性能控制。

