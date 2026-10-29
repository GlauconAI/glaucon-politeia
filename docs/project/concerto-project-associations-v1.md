# Concerto Project Association V1

## 状态与责任

实现候选，未以本文宣称已部署或 main 已成功调用。Plato 维护底层；业务 Owner 自行执行关联并验收。该接口不执行 Maestro Catalog 转组、目录移动或 Thin Work 变更。

## 信任与当前 Owner

每次请求直接读取数据库中最新成功发布的 Observatory Registry，绕过 Dashboard 的 60 秒缓存，拒绝 stale/unknown；使用显式 project_owner 优先于 group owner。这里的 current 指**最新已发布 Registry**，不承诺即时观察宿主知识库尚未发布的改动。负责人或退役状态变化必须先完成 Registry 正式发布；需要撤销访问时同步撤销服务端 approval／Agent token，不等待下一次日常采集。新 target 缺失或退役时拒绝，仍登记的 source 也必须同 Owner。

运行部署配置 `CONCERTO_PROJECT_ASSOCIATION_APPROVALS` 是非秘密的服务器信任输入，示例（fixture，不可直接当作真实审批）：

```json
[{"sourceProjectKey":"socrates/fixture","targetProjectKey":"shared/fixture","ownerAgentId":"main","catalogOperationId":"catalog:fixture","catalogReceiptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]
```

Operator 在登记配置前核验 Maestro 的不可变原始 receipt：operation id、source/target、Owner 未变、成功终态及原文件 SHA-256。Concerto 不可读取宿主 Vault，**不会把客户端自报 receipt/hash 作为已核验证明**；它只信部署侧已核验的精确配对。无配置、重复/重叠/链式配对、未知字段都 fail closed。部署配置不是实际业务关联；真正登记由 Owner 的 POST 完成。第一版不允许项目合并或多跳链接。

认证复用 `OBSERVATORY_AGENT_CLAIM_KEYS` 的 Agent 哈希映射；身份只来自 Bearer，不接受 caller identity。普通 Agent、persona 别名或 Shared 分组都不能代替 main。

不可回读的敏感旧配置无需重建或覆盖。可另外设置 `CONCERTO_MAIN_API_TOKEN_SHA256` 为一个 64 位小写 SHA-256，用于引导 main 的独立凭据；该凭据只能认证 canonical `main`，旧 main 与其他 Agent 的原凭据保持有效。旧配置仍必须有效，补充哈希格式错误或与其他 Agent 凭据冲突时 fail closed。原始 token 只进入原生 Secret Store，不进入 Vercel、源码或日志。

## 正式 typed 入口

只读：`concerto_get_project_association_snapshot`：

```json
{"source_project_key":"socrates/fixture","target_project_key":"shared/fixture"}
```

对应 `GET /api/concerto/project-associations/snapshot?sourceProjectKey=...&targetProjectKey=...`，可加 expectedRevision（工具字段 expected_revision）。未知及重复 query 拒绝。响应 schema 为 `concerto-project-association-snapshot-v1`：

- `complete:true, page_count:1, next_cursor:null`；Versions 与 Items 所有状态，独立 version_count/item_count，单 SQL statement 的统一 snapshot_revision。
- 每条完整原始行附加 original_project_key / effective_project_key；未关联时 effective 等于 original，关联后两 scope 的 effective 指向 target。
- association 为 null 或已登记的 source/target、创建 actor、Catalog operation id/hash、创建时间。原始 key 与所有冻结字段保持原样。
- 不接受计数截断、重复 ID、越域记录、缺失绑定 Version 或伪造 effective key 的 RPC 响应。

写入：`concerto_associate_project`：

```json
{"source_project_key":"socrates/fixture","target_project_key":"shared/fixture","expected_revision":"从完整快照取得的32位revision","idempotency_key":"fixture:association:1"}
```

对应 `POST /api/concerto/project-associations` 的 camelCase 字段。请求体有界且严格，不接受 token/actor/receipt 参数。返回 association 及 operation（id、actor、key、SHA-256 request fingerprint、source/target、expected_revision、created_at）。操作回执和映射同事务提交；原有 Item event/evidence 及 Version 历史不变。

## 幂等、冲突和恢复

- 超时或送达不明：保留原始 pair、revision、idempotency_key，重试完全相同 POST，返回原回执，不重复创建映射。不要先换 revision 再复用同 key。
- IDEMPOTENCY_CONFLICT：相同 actor/key 不同原请求，停止核对。
- SNAPSHOT_DRIFT：未成功登记的请求已过期；重新读取完整快照，业务 Owner 重新审视，真正的新请求使用新 key。
- ASSOCIATION_CONFLICT：相反/链式/重叠关系、不同 Catalog provenance、重复版本标签或多个 backlog，停止，由业务 Owner 核对，不静默合并或改写冻结行。
- FORBIDDEN：Owner/配对不匹配；不得换身份或访问其他 key。UNAVAILABLE：缺信任配置、陈旧 Registry、未知错误或数据库不可用；检查部署，不返回内部 SQL 或凭据。
- 业务关联没有自动撤销 API；误登记按新的批准修复流程处理，禁止 Agent 私下改表或放宽冻结触发器。

现有 `concerto_get_operation` 读取的是旧 Item 操作表，不读取本接口关联回执；本接口以相同请求 POST 恢复结果。

## 原生 SecretRef（Plugin 0.2.2）

插件支持 `agentTokens.<canonical-agent-id>`，只接受原生 SecretRef 对象。使用 OpenClaw 返回的精确 store SecretRef，不自行猜 provider/id；manifest 声明 capability secret input，仅在工具实际执行时通过公开 toolContext.getRuntimeConfig() 读取最新 runtime-resolved 配置中的本插件、当前 Agent 路径，并检查公开 capability 可用性 guard；每次调用重新读取且不缓存，不读取其他 Agent 路径，不冷解析凭据。

显式配置的 SecretRef 可声明工具，但未解析时实际执行返回 UNAVAILABLE，**不回退**旧 env；未配置该 Agent ref 时兼容原 `CONCERTO_AGENT_API_TOKENS` JSON env map。禁止把整个受保护 JSON opaque sentinel 当作该 map 解析。Token 与后端 hash 必须对应同 Agent；不要在仓库、命令参数或聊天中放明文。

缺工具应分别检查精确插件版本/路径、有效工具策略及凭据 prepared 状态。只需选择本插件或必要工具名，不开启所有 plugin 或扩大 main 的管理权限。加载/配置落盘不等于真实认证调用成功。

## 新旧接口边界

既有 Item API、项目版本 UI 及 `concerto_get_project_work_snapshot` 保留原始 key 语义，不自动追随本映射；V1 快照仍是 Items-only。新的正式关联快照显式提供全量 Versions/Items 和 effective scope，作为本次业务对账的权威入口。下游需要 effective key 时消费此接口，不用普通 Item update 批量改绑 released/archived Versions。

## 验证与发布

```bash
npx --no-install vitest run tests/concerto-project-association-authority.test.ts tests/concerto-project-association-routes.test.ts tests/concerto-project-association-deployment.test.ts tests/concerto-project-associations.test.ts
cd openclaw-plugin && npm test
```

真实 SQL verifier 只允许明确的 loopback 高端口 maintenance database：

```bash
CONCERTO_DISPOSABLE_PG_URL=postgres://test-user@127.0.0.1:55439/postgres node scripts/concerto/verify-project-associations-local.mjs
```

该脚本创建随机 database、应用**真实原始冻结触发器**和候选 SQL、检验部署 launcher 的 check/apply/status、完整 501 Items、权限、幂等/冲突、故障回退、双连接漂移及 byte-identical 原始业务行，最后删除自己创建的 database。它不读 .env 或生产配置。

完整质量门：`npm run release:verify`。数据库独立发布入口：

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/observatory/deploy-concerto-project-associations.ts check
```

默认 check 完整回滚，apply 为独立生产 schema 迁移授权门，status 只读。入口复用既有精确 Supabase 项目/TLS/URL 校验，不接受 URL 覆盖，核验迁移原始字节、service-only EXECUTE、RLS/无直接表授权，保护 Versions/Items 全行；apply 只加 schema/history，不执行任何真实关联。返回 committed-verify-status 错误时先 status，不盲重跑。

推荐上线顺序：schema 经授权 check/apply/status → 部署正式 API → 登记经核验的服务器审批与匹配 Agent 凭据 → 精确 Plugin 候选按宿主 lifecycle 激活 → 验证 main 工具可见及只读快照 → main 自行执行关联并回读。Plato 不替 main 做最后两步的业务验收；底层健康验证不写业务关联。
