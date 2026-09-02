# Work Tracker Project Versions Design

## Goal

为 Work Tracker 增加独立的 Project Version 生命周期，让每个 Work Item 明确归属一个项目版本，并在列表、筛选、新建和详情编辑中保持一致。同时补齐详情页返回入口，并让主页面恢复用户上次选择的 Project。

## Scope

本次作为一个完整版本交付四项能力：

1. Project Version 独立实体、状态与审计。
2. Work Item 版本归属、卡片展示与版本筛选。
3. Work Item 详情页返回 Work Tracker，并保留进入前的筛选上下文。
4. Work Tracker 主页面记住上次选择的 Project。

不改变现有 Work Item 九状态工作流、Ready Gate、Project Control binding、Agent Claim、Evidence 或 Project registry 的权威边界。

## Reuse decision

采用 `adapt`：保留并复用现有 Work Tracker repository、admin-only RPC、事件审计、optimistic concurrency、canonical Project picker 与 URL 筛选模式；新增 Project Version 数据模型和界面。

不复用 `plan_revision` 作为交付版本。`plan_revision` 是批准计划修订号，Project Version 是面向交付的版本生命周期，两者可以同时存在。

不把版本编码进 `milestone_ref` 或自由文本字段，因为那样无法保证状态、Project 归属、唯一性、可靠筛选和审计。

## Data model

新增 `observatory_project_versions`：

- `id`: UUID 主键。
- `project_key`: canonical Project key。
- `version_label`: 用户可见版本号，例如 `v0.1`。
- `title`: 版本名称。
- `description`: 可选说明。
- `status`: `planned | active | released | archived`。
- `target_date`: 可选目标日期。
- `released_at`: 进入 `released` 时记录。
- `is_backlog`: 标识系统保留的“待规划 / Backlog”版本。
- `row_version`: optimistic concurrency 版本号。
- `created_by`, `created_at`, `updated_at`。

同一 Project 下 `version_label` 唯一。系统保留的 Backlog 版本不可删除、不可发布，用于承接没有合理发布版本号的既有 Item。用户版本不提供硬删除；终止使用通过 `archived` 表达。

新增 `observatory_project_version_events`，记录创建、字段更新与状态变化。

`observatory_work_items` 新增 `project_version_id`，外键指向 Project Version。数据库约束和 RPC 必须验证 Work Item 的 `project_ref/project_key` 与 Project Version 的 `project_key` 一致。

## Version lifecycle

允许的状态变化：

- `planned → active | archived`
- `active → released | archived`
- `released → archived`
- `archived` 为终态

第一版允许同一 Project 同时存在多个 active 版本，以支持维护线与下一版本并行。Version manager 只展示合法状态动作。

## Existing data migration

迁移只处理派生关系，不改变 Work Item 内容或工作流状态：

1. 为当前已有 Work Item 涉及的每个 canonical Project 创建一个系统 Backlog 版本。
2. 将既有 Work Item 绑定到所属 Project 的 Backlog。
3. 无法解析 canonical Project 的 legacy Item 保持兼容显示，并在详情页阻止虚构版本绑定；用户选定 canonical Project 后再选择真实版本。
4. 新建 Work Item 必须绑定所选 Project 的一个版本；若该 Project 尚无用户版本，则系统 Backlog 可选。

## Server and repository behavior

- repository 增加 Project Version list/create/update/transition 方法。
- 页面加载 Work Items、active claims 和 Project Versions。
- create/update Work Item RPC 接收 `project_version_id`，并做 Project 一致性校验。
- 所有版本写操作仅允许 admin，通过 security-definer RPC；表保持 RLS 默认拒绝。
- 所有版本和 Work Item 修改继续使用 optimistic concurrency，冲突返回刷新提示。

## Main Work Tracker UI

- Project filter 保持第一筛选维度。
- 选择具体 Project 后出现 Version filter，选项包含“全部版本”、Backlog 与该 Project 的所有版本；每个选项显示版本号和状态。
- 选择“全部 Project”时 Version filter 隐藏并清空版本筛选。
- Work Item 卡片显示版本徽章，例如 `v0.2 · 进行中`；Backlog 显示 `待规划`。
- 工具栏提供“管理版本”入口。Version manager 支持创建版本、编辑名称/说明/目标日期和执行合法状态动作，不提供硬删除。
- 新建 Work Item 时先选 Project，再选该 Project 的版本。

## Detail page and return behavior

- 详情页顶部提供明显的 `← 返回 Work Tracker`。
- 卡片进入详情页时携带经过校验的 Project、Version 和 active/completed view 上下文。
- 返回链接恢复上述筛选；缺少或非法上下文时安全回退到 `/work-tracker`。
- 详情编辑表单中，切换 Project 会清空当前 Version，要求重新选择同一 Project 下的版本。

## Remember last Project

主页面采用 URL + `localStorage`：

1. 有效 URL `project` 参数优先，便于书签和返回链接复现。
2. URL 未指定时，从 `localStorage` 恢复上次有效 Project。
3. 已保存 Project 已不存在或没有任何 Item 时，回退到“全部 Project”。
4. 用户每次切换 Project 后更新 URL 与 `localStorage`。

只持久化 Project，不持久化 Version；Version 仍通过当前 URL/返回上下文保留，避免用户下次进入时被锁在过时发布版本。

## Error handling

- Project registry 或版本读取失败时，Work Tracker 保持现有 unavailable 边界，不显示虚构数据。
- 版本已变更、归档或与 Project 不一致时，写操作失败并提示刷新/重新选择。
- `localStorage` 不可用时静默降级为现有 URL 默认行为。
- legacy Project Item 不自动推断版本。

## Testing and acceptance

- Schema/RPC migration contract tests：约束、RLS、grants、Backlog backfill、Project 一致性、状态图和并发冲突。
- Unit tests：版本状态图、筛选、Project/Version 匹配、URL/localStorage 优先级。
- Component tests：卡片徽章、版本筛选、Version manager、capture/edit 联动和返回链接。
- Page/repository tests：版本数据加载、失败边界和新增字段。
- 完整质量门：Vitest、ESLint、TypeScript、Next.js production build、`git diff --check`。
- 生产发布前应用 Supabase migration，再部署应用；随后做 authenticated desktop/mobile 浏览器验收，确认版本创建与状态推进、Item 绑定/筛选、详情返回和 Project 记忆均真实工作。

## Explicit non-goals

- 不自动从 `plan_revision` 生成发布版本。
- 不增加版本级权限、发布说明生成、燃尽图或跨 Project 版本。
- 不自动记住上次 Version。
- 不改变 Project registry 或 OpenClaw Orchestrator 的 Project 事实来源。
