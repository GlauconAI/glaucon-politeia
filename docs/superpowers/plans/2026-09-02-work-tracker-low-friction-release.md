# Work Tracker Low-Friction Release Channel Implementation Plan

1. 为发布管线与审批计数器添加失败测试，覆盖步骤顺序、超时、固定生产来源、敏感正文不出现在报告中。
2. 实现 `scripts/release` 下的验证、smoke 与审批周报模块，并在 `package.json` 暴露固定入口。
3. 添加 GitHub quality workflow，将联网 dependency audit 移到 CI。
4. 运行单元测试、全量单 worker 测试、lint、typecheck、build 与 smoke test。
5. 更新 Plato agent-scoped Codex writable root 与精确命令规则，验证配置可加载；保持 OpenClaw 全局 Guardian 配置不变。
6. 建立每周观察 automation，记录四周后复盘门槛。
7. 请求独立代码审查，修正发现后合并并交付。
