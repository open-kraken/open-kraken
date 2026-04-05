# Legacy Golutra Architecture Inventory

## Scope

- This document inventories the legacy `golutra` architecture as reference input only.
- All new migration conclusions in this file target `/Users/claire/IdeaProjects/open-kraken`.
- `/Users/claire/IdeaProjects/golutra` remains source evidence only and must not receive new outputs from this migration round.
- To avoid mixing facts with target-state decisions, every core domain below separates `来源证据` from `open-kraken 迁移结论`.

## Core Mapping Matrix

| 核心域 | 来源证据 | open-kraken 迁移结论 |
| --- | --- | --- |
| 桌面壳 | 旧位置：`/Users/claire/IdeaProjects/golutra/src-tauri/src/main.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/tauri.conf.json`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/app.rs`、`/Users/claire/IdeaProjects/golutra/docs/migration/tauri-web-capability-analysis.md`。结论依据：legacy 运行时依赖 Tauri 多窗口、原生壳、窗口事件与桌面能力。 | 新位置：`/Users/claire/IdeaProjects/open-kraken/web` 承载浏览器应用壳，`/Users/claire/IdeaProjects/open-kraken/backend/go` 承载原本混在桌面宿主里的服务真相，运行与发布约束沉淀到 `docs/production-readiness`。保留单页工作台与终端观察体验；废弃 Tauri 窗口壳、托盘/窗口标签等桌面专属前提。 |
| 聊天 | 旧位置：`/Users/claire/IdeaProjects/golutra/src-tauri/src/application/chat.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/message_service/chat_db/*`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/message.rs`、`/Users/claire/IdeaProjects/golutra/web/src/features/chat/*`、`/Users/claire/IdeaProjects/golutra/docs/migration/go-backend-domain-api-design.md`。结论依据：聊天真相在 Rust chat DB 与 message service，Web 侧已有独立 chat contracts。 | 新位置：聊天领域与持久化真相归并到 `/Users/claire/IdeaProjects/open-kraken/backend/go`，浏览器聊天 UI 落到 `/Users/claire/IdeaProjects/open-kraken/web`，边界契约由 `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md` 与后续 API 文档统一。保留消息时间线、会话切换、实时推送；废弃 Tauri invoke/listen 作为聊天主通道。 |
| 成员/角色 | 旧位置：`/Users/claire/IdeaProjects/golutra/src-tauri/src/message_service/project_members.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/project_members.rs`、`/Users/claire/IdeaProjects/golutra/backend/internal/members/*`、`/Users/claire/IdeaProjects/golutra/backend/internal/roles/*`、`/Users/claire/IdeaProjects/golutra/src/shared/types/memberDisplay.ts`。结论依据：legacy 同时存在 Rust 与 Go 两套成员/角色实现痕迹，需要在新根目录单点收敛。 | 新位置：权限矩阵与 read model 以 `/Users/claire/IdeaProjects/open-kraken/docs/authz-role-model.md` 为文档真相，后端实现统一落到 `/Users/claire/IdeaProjects/open-kraken/backend/go`，展示层落到 `/Users/claire/IdeaProjects/open-kraken/web`。保留 `owner/supervisor/assistant/member` 四角色与成员状态展示；废弃桌面侧自定义角色别名和多处并行角色真相。 |
| 跨 agent 协作 | 旧位置：`/Users/claire/IdeaProjects/golutra/backend/internal/collaboration/*`、`/Users/claire/IdeaProjects/golutra/backend/internal/dispatch/*`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/orchestration/*`、`/Users/claire/IdeaProjects/golutra/docs/migration/go-backend-domain-api-design.md`。结论依据：dispatch、outbox、member-session 绑定与协作不变量已被定义为后端职责，而不是前端职责。 | 新位置：跨 agent 协作真相进入 `/Users/claire/IdeaProjects/open-kraken/backend/go` 的 orchestration / dispatch / collaboration 模块；前端只消费结果态。保留任务分发、completion report、member-session 关联；废弃由桌面壳或页面状态临时解释协作顺序的做法。 |
| 终端调度 | 旧位置：`/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/pty.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/terminal_engine/*`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/bin/shim.rs`、`/Users/claire/IdeaProjects/golutra/backend/go/internal/session/*`、`/Users/claire/IdeaProjects/golutra/backend/go/internal/terminal/*`。结论依据：legacy 已明确 attach/snapshot/delta、shim ready/exit、PTY 生命周期不应继续依赖 Tauri UI。 | 新位置：终端编排、session 生命周期与 dispatch 统一落到 `/Users/claire/IdeaProjects/open-kraken/backend/go`，浏览器终端面板落到 `/Users/claire/IdeaProjects/open-kraken/web`，实时词汇沿用 `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`。保留 attach/snapshot/delta、status、shim 协议；废弃桌面窗口路由和 Tauri 事件作为终端真相。 |
| 路线图 | 旧位置：`/Users/claire/IdeaProjects/golutra/docs/migration/go-backend-domain-api-design.md`、`/Users/claire/IdeaProjects/golutra/docs/migration/acceptance-matrix.md`、`/Users/claire/IdeaProjects/golutra/backend/tests/contract/migration_contract_test.go`。结论依据：legacy 已把 conversation/global roadmap 视为后端定义的资源，并要求 realtime 与浏览器契约一致。 | 新位置：路线图持久化与规则以 `/Users/claire/IdeaProjects/open-kraken/docs/persistence/roadmap-project-data.md` 为当前文档真相，后端实现落到 `/Users/claire/IdeaProjects/open-kraken/backend/go`，前端读写页面落到 `/Users/claire/IdeaProjects/open-kraken/web`。保留 conversation/global roadmap 双层结构与状态流；废弃页面侧自行重定义 roadmap 文档结构。 |
| 项目数据 | 旧位置：`/Users/claire/IdeaProjects/golutra/src/shared/tauri/projectData.ts`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/message_service/project_data.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/project_data.rs`、`/Users/claire/IdeaProjects/golutra/backend/internal/api/project.go`。结论依据：legacy 项目数据由 Tauri bridge 与后端 API 并存，必须在新仓库收敛为服务端单写入口。 | 新位置：项目数据文档和落盘策略固定在 `/Users/claire/IdeaProjects/open-kraken/docs/persistence/roadmap-project-data.md`，后端仓储实现进入 `/Users/claire/IdeaProjects/open-kraken/backend/go`，前端只经 `/Users/claire/IdeaProjects/open-kraken/web` API client 访问。保留项目级元数据与 workspace-first/app-fallback 思路；废弃前端直接桥接本地文件系统。 |
| 技能/命令通道 | 旧位置：`/Users/claire/IdeaProjects/golutra/src-tauri/src/bin/golutra-cli.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/command_ipc.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/command_center.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/skills.rs`、`/Users/claire/IdeaProjects/golutra/backend/internal/http/handlers/skills_handler.go`、`/Users/claire/IdeaProjects/golutra/docs/migration/tauri-web-capability-analysis.md`。结论依据：legacy CLI 与技能枚举不能继续直接挂在 Tauri IPC 上，且已有 Go handler 迁移信号。 | 新位置：命令/技能协议的服务端归宿是 `/Users/claire/IdeaProjects/open-kraken/backend/go`，浏览器与脚本侧入口分布在 `/Users/claire/IdeaProjects/open-kraken/web` 与 `/Users/claire/IdeaProjects/open-kraken/scripts`。保留 CLI 兼容面、技能发现与命令调度；废弃以 Tauri 本地 IPC 作为长期唯一传输层。 |
| 持久化/配置 | 旧位置：`/Users/claire/IdeaProjects/golutra/backend/internal/storage/*`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/storage.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/ports/settings.rs`、`/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/settings.rs`。结论依据：legacy 同时存在 Rust runtime storage 与 Go storage，且迁移文档已要求工作区优先、应用目录回退和配置集中化。 | 新位置：持久化/配置策略统一沉淀在 `/Users/claire/IdeaProjects/open-kraken/backend/go` 与 `/Users/claire/IdeaProjects/open-kraken/docs/persistence`，运行校验和启动脚本落到 `/Users/claire/IdeaProjects/open-kraken/scripts`。保留 workspace-first 与 app fallback、文件锁/版本冲突语义；废弃多运行时各自维护配置副本。 |

## Closed Constraints

### 技能/命令通道分层

来源证据：

- `/Users/claire/IdeaProjects/golutra/src-tauri/src/bin/golutra-cli.rs`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/command_ipc.rs`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/command_center.rs`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/ui_gateway/skills.rs`
- `/Users/claire/IdeaProjects/golutra/backend/internal/http/handlers/skills_handler.go`

open-kraken 迁移结论：

- CLI 或本地自动化入口只负责兼容与接入，不拥有独立业务真相。
- 浏览器和服务端命令变更必须走 HTTP 命令 DTO。
- WebSocket/realtime 只承载 snapshot/delta/status/replay，不承载第二套写协议。
- 跨 agent 编排与终端命令的最终归属是 `backend/go`，其口径对齐 `collaboration.command`、`terminal.dispatch` 以及 API/鉴权契约；`scripts` 只负责入口包装，`web` 只负责消费结果态。
- mock/contracts 当前仍保留一层过渡事件词汇；该层只允许继续存在于既有 compatibility path，不得扩散到新的 route、publisher 或页面契约。
- 统一分层约束已固定在 `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`，并与 `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`、`/Users/claire/IdeaProjects/open-kraken/docs/authz-role-model.md` 交叉对齐。

### 远端部署下的本地能力暴露边界

来源证据：

- `/Users/claire/IdeaProjects/golutra/docs/migration/tauri-web-capability-analysis.md`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/runtime/pty.rs`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/bin/shim.rs`
- `/Users/claire/IdeaProjects/golutra/src/shared/tauri/projectData.ts`

open-kraken 迁移结论：

- 远端部署且无本地 runtime 时，禁止通过浏览器代理暴露本地文件系统、shell、PTY 启动、主机路径读取等能力。
- 可继续暴露聊天、成员、路线图、项目数据，以及已经存在后端 session 的终端快照/状态读取；这些能力经服务端代理，不直接泄露主机级句柄。
- 明确保留本地的能力只有 PTY/shim 生命周期、本地 shell/folder 启动和主机路径解析；其余浏览器可见能力必须通过服务端契约暴露。
- 需要本机执行的能力必须显式标记为 `disabled` 或 `degraded`，并通过健康检查和故障处置文档反映出来。
- 统一边界已固定在 `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`，并与 `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/observability-and-failure-handling.md` 交叉引用。

### 迁移回滚边界

来源证据：

- `/Users/claire/IdeaProjects/golutra/src-tauri/src/message_service/chat_db/*`
- `/Users/claire/IdeaProjects/golutra/src-tauri/src/message_service/project_data.rs`
- `/Users/claire/IdeaProjects/golutra/docs/migration/go-backend-domain-api-design.md`
- `/Users/claire/IdeaProjects/golutra/docs/migration/tauri-web-capability-analysis.md`

open-kraken 迁移结论：

- 回滚只处理 open-kraken 导入尝试产生的新工件，不回写、不清理 legacy Golutra 数据源。
- 回滚不会恢复 live terminal、outbox retry、内存态 orchestration 队列等非迁移对象。
- `failed` 必须先回滚再视为未导入；`partial` 允许保留结果，由操作策略决定是否丢弃。
- 导入执行路径与验证入口固定为 `scripts/bootstrap-migration.sh --check` 和 `scripts/verify-all.sh`，只有在门禁通过后才允许执行 importer 或重试。
- mock/fixture 只能模拟 durable import result，不得模拟 `terminal_session_map`、runtime queue、browser cache 等被明确排除的回滚对象。
- 统一回滚边界已固定在 `/Users/claire/IdeaProjects/open-kraken/docs/migration/data-migration-compatibility-strategy.md`，并与 `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/risk-register.md` 联动。

## 保留能力

- 保留多 agent 并行协作、任务分发与 completion report 流程。
- 保留聊天、成员状态、路线图、项目数据、终端 attach/snapshot/delta 等核心协作能力。
- 保留 CLI 兼容面与 shim 协议，但把宿主从 Tauri 转向 Go runtime。
- 保留工作区优先存储、应用目录回退、版本冲突与基础审计语义。

## 废弃能力

- 废弃 Tauri 多窗口壳、原生标题栏、桌面窗口标签与依赖宿主窗口的交互假设。
- 废弃把 `invoke/listen` 或本地 IPC 当作聊天、终端、项目数据的长期主传输层。
- 废弃前端直接桥接本地文件系统、系统对话框、通知聚合或本地配置读写作为业务真相。
- 废弃多语言、多目录各自维护成员/角色/项目数据真相的状态。

## 迁移边界

- 本文只定义 legacy 架构盘点、模块映射、保留能力、废弃能力与非目标，不直接落任何 Go/React 实现代码。
- 新结论只写入 `/Users/claire/IdeaProjects/open-kraken/docs`，不回写 `/Users/claire/IdeaProjects/golutra`。
- 浏览器侧 DTO、realtime 词汇、角色模型等目标态必须复用 `open-kraken` 已存在的文档契约，而不是在本文件重新发明第二套规范。
- 如果旧仓库出现其他成员并发修改，按当前协作规则避让，不回退、不覆盖、不把该变化写成本文的结论依据。

## 非目标

- 不在本轮确定最终 OpenAPI 细节、数据库选型、部署拓扑实现细节。
- 不在本轮复制或迁移 legacy 源码到 `open-kraken`。
- 不把尚未在 `open-kraken` 固定的接口名称伪装成已完成实现。

## 风险/未知项

- 项目数据与聊天历史的一次性迁移工具实现和人工确认界面仍待落地，但执行路径、触发条件、回滚触发条件与验证入口已固定。
- 终端 runtime 与 shim 在跨平台环境中的最小兼容集已有旧证据，但 `open-kraken` 的正式验证矩阵仍在建设中。
- legacy 仓库中同时存在 Rust、旧 Go、Web 三套过渡实现；凡未被 `open-kraken` 现有文档明示吸收的点，都应视为待确认，而不是默认继承。

## Immediate Consumption

- 后续负责 Go 后端、Web UI、API 契约、数据迁移、部署和测试矩阵的成员，应把本文件当作 legacy 输入索引，而不是实现规范的唯一来源。
- 若某项实现与本文件冲突，以 `open-kraken` 下更窄、更新的专项契约文档为准，并回补这里的映射说明。
