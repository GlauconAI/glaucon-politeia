# Work Tracker 四分组与卡片密度优化设计

## 目标

在不改变九种底层状态、合法转换图和审计记录的前提下，让 Work Tracker 的日常看板在桌面首屏完整呈现主要工作流，并提高每列可见 Item 数量。

## 已批准的产品边界

- 日常看板只显示四个视觉工作分组：
  - 待处理：`inbox`、`triage`
  - 待执行：`ready`、`reopened`
  - 进行中：`in_progress`、`blocked`、`waiting`
  - 待验收：`review`
- `done` 进入独立“已完成”视图，不占日常四列。
- 九种底层状态和现有状态转换规则保持不变。
- Quick Capture 由右侧常驻栏改为页面顶部主操作按钮，点击后打开固定右侧抽屉；抽屉可用关闭按钮、遮罩点击和 Escape 关闭。
- 卡片状态操作使用三点菜单，菜单仅展示当前状态允许到达的目标状态。标题继续进入详情页。
- 不在合并后的视觉分组之间启用拖拽。合并分组可能包含多个合法目标状态，拖拽会产生歧义；显式菜单更可审计，也适用于键盘和触屏。
- 卡片增加类型标识：想法、功能、Bug 使用图形、文字和颜色三重区分；异常/恢复状态继续使用独立状态徽章。

## Project 筛选

Project registry 已包含 `status`，无需新增生命周期字段。是否“被 Work Tracker 跟踪”由当前是否存在至少一个 Item 可靠推导。

- Quick Capture 仍可选择全部 canonical Project，避免阻止首次为某 Project 创建 Item。
- `Filter by Project` 只显示当前至少拥有一个 Item、且能由 canonical registry 解析的 Project。
- 未解析的 legacy Project 继续在卡片上明确标记，不伪造成 canonical Project。
- URL 中的 `?project=` 仅在目标 Project 当前有 Item 时生效；否则回退 `All tracked Projects`。
- 搜索框与下拉框固定使用相同控件高度、边框、内边距和行高。

## 卡片信息层级

卡片默认只呈现：类型、具体状态、优先级、标题、Project、Agent Claim 状态和三点操作。版本、Milestone、Project Control binding 等审计细节保留在详情页，不再占用看板纵向空间。

类型视觉语义：

- 想法：紫色、菱形图形。
- 功能：蓝色、加号图形。
- Bug：红色、感叹号图形。

Blocked、Waiting、Reopened 使用更强的状态色，确保它们在合并分组中仍可被快速发现。

## 组件边界

- `WorkTrackerCaptureDrawer`：只管理抽屉开关、Escape、遮罩和对话框语义，复用现有 `QuickCapture`。
- `WorkTrackerBoard`：管理视图切换、Project 筛选、四分组、已完成视图和状态操作。
- `work-tracker-projects.ts`：提供“从现有 Item 推导被跟踪 Project”的纯函数，供服务端 URL 校验和客户端筛选共同使用。
- `work-items.ts`：输出视觉分组常量和状态标签，保持底层转换图独立。

## 错误与空状态

- 数据加载失败继续 fail closed，不暴露数据库细节。
- 无任何 Item 时提示从顶部 Quick Capture 新建。
- 当前 Project 或视图无 Item 时给出对应空状态，不渲染九个空列。
- mutation 失败继续显示服务端返回的稳定错误；成功继续显示版本号。

## 验收

- 自动化：新增纯函数、组件与页面测试，先观察失败，再实现通过；随后运行完整 Vitest、ESLint、TypeScript 和 Next.js build。
- 浏览器：在 1280px 桌面和 390×844 移动端验证四分组、抽屉、筛选项目集合、等高控件、类型徽章、三点菜单、已完成视图和控制台错误。
- 发布：推送到 canonical `main`，等待 Vercel Git integration 完成，再在 `https://402v.com/work-tracker` 做生产验收。
