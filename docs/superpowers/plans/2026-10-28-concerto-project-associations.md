# Concerto Project Associations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提供经 current Owner 和可信转组审批授权的完整历史快照与原子 Project 关联接口。

**Architecture:** 复用 Registry Owner、Bearer、Supabase service-only RPC 与 typed plugin。新增独立关联/回执表，不改冻结业务行；可信审批由服务器部署配置提供，客户端不能指定或伪造身份及审批。

**Tech Stack:** Next.js route handlers、TypeScript/Zod、PostgreSQL、Vitest、Node test、OpenClaw tool plugin。

---

### Task 1: 权限和全量合同（先红后绿）

Files: tests/concerto-project-associations.test.ts; lib/observatory/project-associations.ts。

- [ ] 测试先定义 parseAssociationApprovals、authorizeAssociation、validateAssociationSnapshot 的真实样例。拒绝未审批 pair、Owner 失配、重复配置、跨 scope/重复 ID/计数错误、缺失绑定 Version；全状态与 501 项不截断。
- [ ] `npx --no-install vitest run tests/concerto-project-associations.test.ts` 观察缺少实现失败。
- [ ] 使用 strictObject 与既有 normalizeRegistryOwnerAgentId 实现合同，验证通过。

### Task 2: 原子数据库与真实事务验收

Files: supabase/migrations/20261029000100_concerto_project_associations.sql; scripts/concerto/verify-project-associations-local.mjs。

- [ ] 先写一次性 loopback Postgres verifier，严格要求 CONCERTO_DISPOSABLE_PG_URL 为 localhost:高端口/postgres，不读取生产 env；测试缺失 RPC 红灯。
- [ ] 实现 read_observatory_project_association_snapshot(source,target)、associate_observatory_project_as_agent(actor,isOwner,source,target,catalogOperation,catalogHash,revision,key)。仅 service_role EXECUTE；RLS 和表 grant 禁止直接访问。原子锁、请求 hash、幂等与冲突、冻结行不变。
- [ ] 验证全量、权限、相同请求 replay、变更请求冲突、同 pair 新 key、反向/链/重复标签、强制回执失败 rollback 和双连接 drift；输出可机器读取的完成摘要。

### Task 3: Route / Repository

Files: lib/observatory/project-association-repository.ts; lib/observatory/project-association-route.ts; app/api/concerto/project-associations/route.ts; app/api/concerto/project-associations/snapshot/route.ts; tests/concerto-project-association-routes.test.ts。

- [ ] 先写 handler 注入测试：错误 token401、缺审批503、非 Owner403、错误参数400、revision drift409、无泄漏错误503、成功 no-store；断言未经授权不创建 repository。
- [ ] RPC repository 将错误映射为固定 code，不返回 SQL 内容。验证完整响应后才向 Owner 返回；POST 从审批配置取 provenance，调用者仅提交 pair/revision/key。
- [ ] Route 使用 bounded JSON 和 strict input；GET 未知参数拒绝。确认所有权限判断发生于 RPC 前。

### Task 4: typed plugin 和文档

Files: openclaw-plugin/src/tools.js; openclaw-plugin/test/tools.test.js; openclaw-plugin/openclaw.plugin.json; docs/project/concerto-project-associations-v1.md。

- [ ] 先更新工具测试为 14 个，加入参数/URL/body、身份不可伪造、无 token 不暴露断言，运行 Node test 观察红灯。
- [ ] 添加两个薄工具、同步 manifest，不改变既有十二工具。文档给出审批配置 schema、只读/写入样例、错误和恢复、旧 API 原始 scope 边界、业务操作留给 main。
- [ ] 插件 Node test 与 route/schema tests 通过后运行 `npm run release:verify`。

### Task 5: 发布准备与接通门

- [ ] 独立 review 安全/并发/冻结边界，修复具体发现，复跑受影响验证。
- [ ] commit 精确候选；通过 host-owned work-tracker-release-prepare.sh 准备正式 PR；默认分支合并与数据库迁移按独立门处理。
- [ ] 官方 plugin build/validate/pack 冻结候选，记录 SHA-256。配置接通依赖凭据保存位置；不自动 reload 或触碰 Gateway 生命周期。
- [ ] 持久化当前结果及剩余唯一操作，交付 main 正式合同；不得以候选测试替代真实认证与业务验收。
