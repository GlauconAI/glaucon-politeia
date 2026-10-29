# Concerto 历史 Project 关联能力

批准：Glaucon 在 Telegram #6019 同意按此前提出的关联映射方案推进。实现权属于 Plato，业务调用与验收属于 main。

## 合同

不改原始 Versions/Items、ID、key、更新时间、冻结内容或事件历史。新增一对一、不可链式拼接的关联表，将历史 source key 映射到当前 target key；不会把历史业务记录复制成新身份。新接口显式区分原始 key 与 effective key，旧 API 继续保留原有语义，不宣称旧 UI 已自动采用映射。

服务器配置 CONCERTO_PROJECT_ASSOCIATION_APPROVALS 保存经 Operator 核验的 sourceProjectKey、targetProjectKey、ownerAgentId、catalogOperationId、catalogReceiptSha256 五元组。它是部署信任输入而不是客户端自报证明；不写入凭据、不自动登记 Trasporto 映射。每次读取/提交均重新验证目标当前 Registry Owner，源仍在 Registry 时也必须同 Owner，禁止退役目标。失配或缺配置 fail closed。

GET /api/concerto/project-associations/snapshot 接受 sourceProjectKey、targetProjectKey、可选 expectedRevision。单个 SQL statement 返回两 key 下全部完整 Versions/Items、独立计数、当前映射、无分页和统一 revision。只有上述审批范围的 current Owner 可读历史 key。Items 引用的 Version 必须存在于全量集合，禁止跨范围和截断。

POST /api/concerto/project-associations 接受 sourceProjectKey、targetProjectKey、expectedRevision、idempotencyKey。服务器从可信审批取 receipt provenance，认证身份来自既有 Bearer。RPC 只向 service_role 开放；数据库事务锁覆盖关联表及两业务表，先验证幂等回执，再验证新鲜全量 revision，再原子登记关联与不可变操作回执。相同请求重放原结果；相同 key 不同内容冲突；已有同映射用新 key 返回同映射但留独立操作回执；反向、链、合并、重复 Version label/backlog 冲突拒绝。失败不改任何业务行或留下半条关联。

工具：concerto_get_project_association_snapshot、concerto_associate_project，薄适配既有认证/HTTPS/错误合同，不接受 caller identity 或审批凭证。

## 边界

本次只交付底层能力及发布候选，不替 main 执行关联，不重复 Shared Catalog 转组。服务端 schema migration、部署审批输入、插件激活与真实认证调用分别验收；源码通过不等于已上线。当前凭据位置仍待确认，不因此停止隔离开发。

## 验证

权限：无 token、错误 token、非 Owner、Owner 更换、来源 Owner 不符、缺审批/重复审批/未知字段、失效目标拒绝。
完整性：全部状态、released/archived 版本、超过 500 Items、空项目、重复 ID、计数/范围/引用错误、漂移。
事务：真实 PostgreSQL service-only grants、双连接并发、幂等重放/冲突、映射链冲突、重复版本、审计插入故障整体回退；迁移前后业务行字节摘要与历史冻结触发器保持不变。
发布：npm run release:verify、插件测试、官方 build/validate/pack、独立安全复核，既有发布入口生成 PR，批准前不合并或应用生产迁移。
