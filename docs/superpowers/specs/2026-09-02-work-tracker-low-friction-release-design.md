# Work Tracker Low-Friction Release Channel Design

## Goal

为 `glaucon-politeia` 建立 Plato 专属的低打扰开发与发布通道：日常开发、测试、构建和只读验收尽量连续完成；生产写入继续保留明确授权门；按周量化审批变化，验证成熟后再决定是否推广为通用实践。

## Boundaries

- 保持 Codex `workspace-write` 与 OpenClaw Guardian `auto_review`，不启用全局 Full Access。
- 权限只覆盖 Plato 与 `glaucon-politeia` 的 Git 元数据，不扩大到其他 Agent、仓库、浏览器 profile、NAS 或用户目录。
- 不永久放行数据库迁移、PR 合并、生产部署、强推、删除、凭据或权限变更。
- 项目脚本不得读取或打印凭据；生产 smoke test 只允许固定的 `https://402v.com` 页面。
- CI 只做验证。Vercel 仍通过既有 GitHub 集成部署，不新增密钥。

## Design

### 1. One deterministic local quality gate

`npm run release:verify` 串行运行：

0. 清理可再生的 `.next/types`，避免旧构建缓存污染独立 typecheck。
1. 全量 Vitest，固定单 worker，消除当前并发超时抖动。
2. ESLint。
3. TypeScript typecheck。
4. `git diff --check`。

每步固定超时、失败即停止，并输出机器可读的最终摘要。默认 Turbopack production build 与依赖漏洞审计放在 CI 中执行：前者需要本机 sandbox 不允许的临时端口，后者需要访问 npm registry。这样避免日常本地验证反复请求权限，同时保留生产路径覆盖。

### 2. Fixed-origin production smoke test

`npm run release:smoke` 只访问 `https://402v.com/` 与 `https://402v.com/work-tracker`，使用 GET、固定超时与有限重试，验证最终来源仍为 `402v.com`、状态正常、页面返回 HTML。脚本不接受任意 URL，不执行登录或写操作。

### 3. GitHub quality gate

PR 与 `main` push 自动执行锁定依赖安装、`release:verify`、默认 Turbopack production build 和 production dependency audit。Vercel Preview/Production 保持既有集成。通过 CI 后不再由本地重复执行相同联网检查。

### 4. Narrow Codex permission adjustment

Plato 的 agent-scoped Codex 配置仅增加该仓库 Git common directory 为 writable root。新增规则只允许固定的 `npm run release:verify`；不允许通用 shell、Node、Python、curl、GitHub 写操作或生产命令。

OpenClaw host allowlist 不加入任何指向 agent 可编辑脚本的永久执行规则。生产动作继续由 Guardian 审查并合并成一次清晰授权，避免为了减少弹窗引入可绕过的可写脚本白名单。

### 5. Weekly observation

每周生成过去七天的低打扰发布报告，至少记录：

- 与 `glaucon-politeia` 相关的 Codex sessions 数量。
- 明确请求 sandbox escalation 的调用数量。
- Gateway host 执行调用数量。
- 发布/生产变更次数与人工授权门数量（无法自动判定时标记为待人工核对）。
- 成功完成、拒绝、回退与异常情况。

报告只输出计数和分类，不收集对话正文、命令正文或凭据。连续四个完整周后再评估是否推广。

## Expected behavior

- 常规代码编辑、测试、lint、typecheck、build 与 Git staging/commit 应在受限 sandbox 内连续运行。
- 网络、GitHub 写入、生产数据库与部署仍可能出现授权；标准发布应将它们收敛为一次发布门，但不承诺任何开发都永久零弹窗。
- 新类别、高风险动作或规则失配仍会触发审批，这是预期保护。

## Acceptance

- `release:verify` 在最新 `main` 单 worker 模式通过并输出结构化摘要；CI 的默认 production build 通过。
- `release:smoke` 拒绝可配置外部来源，固定生产页面验收通过。
- GitHub workflow 语法和命令与本地脚本一致。
- agent-scoped Codex 配置可解析，规则检查通过；全局 OpenClaw 安全模式不变。
- 周报脚本对合成 fixtures 有测试，输出中不含会话正文或命令正文。
- 每周观察任务已启用，首次正式周报前保留当前基线。
