# Supabase Data API 显式授权

## 变更与影响

Supabase 官方通知：[public 新表不再自动暴露给 Data API](https://github.com/orgs/supabase/discussions/45329)。2026-10-30 起适用于现有项目；已有表保留权限。新项目、Preview 和 `supabase db reset` 重放迁移也需要显式授权。`service_role` 可绕过 RLS，但仍需要表级权限。

本项目使用 `supabase-js` 和 REST Data API，属于适用范围。只读生产检查确认现有表保留访问权限；本次没有修改生产数据库，也没有提前切换 Supabase 默认行为。

## 本地候选

`20261023000100_explicit_data_api_grants.sql` 为遗留建表迁移补齐：

- `prompts`：匿名角色授予 INSERT 和 SELECT（提交 API 使用 RETURNING／重复提交查询）；行级读取仍由已有 RLS 限制，没有新增匿名读取策略。登录角色的读写继续受现有 RLS 限制。
- 后台发布／导入使用的 `profiles`、`posts`、`tags`、`post_tags`，以及 Prompt 管理使用的 `prompts`：显式授予服务端角色所需 DML。
- 不改变 Tracker 私有表、幂等操作表的显式撤权，不增加可绕过 Prompt RLS 的匿名访问路径。
- 不重写已应用的历史迁移，不使用 `GRANT ... ON ALL TABLES`，不恢复全 schema 默认授权，不关闭 RLS。

在原有宽松默认权限的数据库上，该迁移是补充声明，不会撤销已有权限；不能把本迁移当作现有授权收紧工具。

匿名角色获得 SELECT 只表示请求可以进入 RLS 检查。已有 `prompts_select_own_or_admin` 不允许无身份的匿名用户读取行，`INSERT ... RETURNING` 与重复查询仍可能被拒绝。这是既有接口与 RLS 的兼容问题，本候选没有扩大读取策略，也没有修复匿名提交；表级权限测试不能证明匿名提交端到端成功。

## 后续开发规则

每次新建 API 可访问的表，在同一迁移内写出最小 `GRANT`、启用 RLS、添加对应策略。内部表保留显式撤权。使用 identity／sequence 时另行检查序列授权。不要因为 API 提示缺权限就向所有角色批量放权。

## 验证与上线边界

`tests/data-api-grants.test.ts` 在零平台默认授权的假设下检查显式表 ACL，以及 Tracker 撤权边界；它不是完整 PostgreSQL／RLS 集成测试。

本地 PGlite PostgreSQL 零默认表授权验证通过：重放 19 份迁移、检查 20 项服务端权限、14 项私有表拒绝访问、全部 public 表启用 RLS、匿名角色无法读到 Prompt 行。测试以 auth stub 替代托管认证，省略 pgcrypto 扩展声明（使用内置 UUID 函数），排除 Storage 迁移和下面的数据依赖迁移；不能把它当成完整 Supabase 验收。

另发现现有 `20260902000100_work_tracker_shared_assignment_fix.sql` 强制要求 20 条历史生产修复事件；空数据库重放会报 `Expected 20 audited assignment corrections, found 0`。这属于已有的环境重建阻塞，独立于本次 Supabase 通知。本候选不绕过或修改该历史生产校验，完整新环境重建仍需单独处理这一问题。

本地没有运行中的 Docker/Supabase，未完成全量 `db reset`。上线前继续按 `work-tracker-release` 的数据库迁移分支做生产目标锁定、真实 PostgreSQL 回滚演练、独立审查、部署验证。生产授权变更与默认分支合并需要各自的明确授权。不能直接用旧 `supabase:apply-missing`：它只列举较早的固定迁移集，不会发现此文件。

现有生产表不受 10 月 30 日默认权限变更影响，因此无需为此紧急改线上权限、轮换密钥或升级订阅。
