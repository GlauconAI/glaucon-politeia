# Work Tracker 低打扰发布通道 v2 实施计划

## Task 1：建立 RED 测试

- 扩展 `tests/work-tracker-release-channel.test.ts`。
- 为固定 repo、分支、clean、祖先关系、非 force push、PR 创建/复用添加行为测试。
- 为 exact SHA Production deployment 等待和显式 GET 添加测试。
- 为 `operator_approvals` 决策聚合、run 归因和敏感字段不泄漏添加测试。
- 运行聚焦测试，确认新增断言先失败。

## Task 2：实现安全 prepare 入口

- 新增 `scripts/release/work-tracker-release-prepare.mjs`。
- 使用 Node 原生 `child_process`，所有命令以 argv 数组执行。
- 固定 repo、remote、base 和 branch 规则；零参数接口。
- 实现 push、现有 PR 查询、固定 PR 创建和结构化输出。
- 运行聚焦测试直到通过。

## Task 3：把生产 smoke 移入 CI

- 新增 `scripts/release/work-tracker-wait-for-production.mjs`。
- 修改 `.github/workflows/quality.yml`，增加只在 `main` push 运行的 `production-smoke` job。
- 授予 `contents: read` 与 `deployments: read`，不增加写权限。
- 更新 `package.json` 固定脚本入口并通过聚焦测试。

## Task 4：升级审批周报

- 修改 `scripts/release/work-tracker-approval-report.mjs`。
- 保留 Work Tracker rollout 的项目级代理指标。
- 用 `node:sqlite` 只读查询 Plato 范围 `operator_approvals` 的非敏感决策字段，并明确标注 scope。
- 输出人工批准/拒绝、超时、系统取消、pending 及兼容的 rollout 指标。
- 在数据库不可用时输出显式 unavailable 状态。

## Task 5：完整质量门与安全审查

- 运行聚焦测试、`npm run release:verify`、默认 `npm run build`、`npm audit --omit=dev --audit-level=high`。
- 检查 wrapper 不接受自由参数、不含 force、不读取凭据、不把可编辑脚本直接加入 allowlist。
- 请求独立代码审查并修复 Important 以上问题。

## Task 6：安装 host-owned wrapper 与配置规则

- 保存 Codex 配置与 OpenClaw approvals 配置回滚副本。
- 复制已审查 wrapper 到 agent-owned `bin` 目录并记录 SHA-256。
- 添加精确 Codex prefix rule 和 OpenClaw allowlist 绝对路径。
- 用新进程验证配置加载；在无危险写入的验证夹具中验证拒绝路径。
- 更新 Plato `AGENTS.md` 的 Work Tracker 发布纪律。

## Task 7：发布与生产验证

- 使用新 prepare 入口推送并创建 PR，验证此步不出现人工审批。
- 等待 PR checks 和 Vercel Preview。
- 只请求一次 merge 人工授权；超时后先只读核对状态。
- 等待 `main` quality 与 `production-smoke` 完成。
- 读回生产提交与固定 smoke 结果。

## Task 8：更新每周观察

- 更新 automation `9d2f9a56-94e4-4589-bfc6-e90c1edfcee5`，使用新的真实决策字段。
- 读回 canonical job，保留周一 09:00 Vancouver、投递目标和权限边界。
- 记录本次 v2 基线并继续观察四个完整周。
