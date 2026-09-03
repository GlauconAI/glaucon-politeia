# Work Tracker 低打扰发布通道 v2 设计

## 目标

在不扩大生产权限的前提下，把正常单轮发布从多次人工审批收敛为：

1. 本地编辑、提交和质量门不需要人工审批；
2. 安全的非强制推送与 PR 创建由一个固定、不可由项目代码改写的入口完成；
3. 合并 PR 保留一次人工生产授权；
4. Vercel Production 等待与固定生产 smoke 由 GitHub Actions 自动完成；
5. 周报直接统计 OpenClaw 的真实人工审批决策，不再用 escalation 数量代替弹窗数。

## 当前问题

v1 已解决本地 Git 元数据写入和 `npm run release:verify`，但发布链仍把 push、PR 创建、merge 和 smoke 分成多个审批点。本次实际记录为 10 次用户审批、1 次因 run 结束而取消的 approval；第二轮热修复将发布链重复了一次。

## 安全边界

- 固定仓库：`GlauconAI/glaucon-politeia`。
- 固定基线：`origin/main`。
- 只允许安全命名的非默认分支，禁止在 `main` / `master` 上运行。
- 工作区必须干净，分支必须包含且领先 `origin/main`，只执行普通 fast-forward push，不允许 force。
- PR title 只取当前提交标题，PR body 使用固定模板；入口不接受任意 repo、remote、ref、URL、命令或正文参数。
- merge、生产数据库、删除、强推、凭据和权限修改不进入永久白名单。
- host-owned 可执行文件位于 Plato agent 配置目录，项目 worktree 对其不可写；仓库只保留可审查源码与安装哈希。

## 方案

### 1. Host-owned `release-prepare`

仓库提供 `scripts/release/work-tracker-release-prepare.mjs` 作为受测源码。发布时将其复制到：

`/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare`

固定入口零参数运行，依次完成：

1. 校验当前目录属于指定 Git common directory；
2. 校验 `origin` URL、分支名和 clean 状态；
3. 只读 fetch `origin/main`；
4. 校验 `origin/main` 是 `HEAD` 祖先且当前分支至少领先一个提交；
5. 普通 `git push --set-upstream origin HEAD:refs/heads/<branch>`；
6. 复用现有 open PR，或用固定 repo/base/head 创建 PR；
7. 只输出结构化状态和 PR URL。

OpenClaw 只对白名单中的这个 host-owned 绝对路径免人工审批，不对白名单加入 `git`、`gh`、`node`、`bash` 或仓库内可编辑脚本。

### 2. 单一 merge 门

PR checks 全部通过后，使用一个标准合并命令请求一次人工授权。若调用超时，先只读查询 PR state 和 merge commit；只有确认尚未合并时才允许重新请求，禁止在 Gateway 和 Codex 两层直接盲目回退。

### 3. CI Production smoke

`quality.yml` 在 `main` push 的质量门成功后运行独立 `production-smoke` job：

1. 用 GitHub Deployments API 的显式 GET 查询当前 `GITHUB_SHA`；
2. 只接受固定仓库与 Production environment；
3. 有界等待 Vercel deployment status 为 success，失败或超时即失败；
4. 调用固定 `https://402v.com` 的现有 `release:smoke`。

这样正常发布不再需要本地联网 smoke 审批。浏览器验收保留为发现 UI 缺陷时的专项步骤，不作为每次标准发布门。

### 4. 真实审批 telemetry

周报同时读取：

- Codex rollout 元数据：相关 sessions、escalation 请求、Gateway exec 调用、拒绝代理指标；
- OpenClaw `operator_approvals`：人工 `allow-once`、`allow-always`、人工拒绝、超时、系统取消和 pending。

OpenClaw 当前 approval 表没有 project 字段，新 runtime 的本地 trajectory 文件也不是稳定接口。因此周报明确拆成两层：Work Tracker rollout 指标保持项目级；真实人工决策直接从 `operator_approvals` 统计 Plato 全 Agent 范围，并显式标注 scope。它不读取或输出 `presentation_json`、命令正文、对话正文、设备 ID 或凭据，也不会把无法可靠归因的数据伪装成项目级数字。

## 失败处理

- prepare 入口任何校验失败都在 push 前退出；若 push 已完成而 PR 创建失败，重跑会复用远端分支并创建/复用 PR。
- CI deployment 查询必须显式 GET，禁止使用会默认 POST 的 `gh api -f` 形式。
- API、Vercel 或网络超时不会自动触发新的写操作。
- telemetry 数据库不可读时周报明确标记 unavailable，不伪造 0。

## 验收标准

- 固定入口拒绝错误 repo、默认分支、脏工作区、无领先提交、分叉历史、危险分支名和任何参数。
- 固定入口只执行非 force push，并能创建或复用 PR。
- `main` CI 等待 exact SHA 的 Production deployment 后执行固定 smoke。
- 周报能从注入样本和真实只读数据库正确区分人工批准、拒绝、超时和取消，且输出不含敏感正文。
- `npm run release:verify`、默认 Turbopack build、生产依赖审计通过。
- 全流程正常发布只产生一次 merge 人工审批；异常热修复每轮最多再增加一次 merge 审批。
