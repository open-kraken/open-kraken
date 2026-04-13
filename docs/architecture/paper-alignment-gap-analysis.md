# Paper Alignment — Gap Analysis & Phased Plan

**对照论文:** *Agents as Execution Resources: Operating System Primitives for Production Multi-Agent Systems* (open-kraken reference paper)
**范围:** 评估当前 `open-kraken` 仓库与论文架构的差距，给出分阶段对齐路线。
**状态:** 初稿（已按论文 v2 更新），待讨论后固化为执行计划。

---

## 更新说明（v2 相对 v1 的变化）

论文 v2 对存储和协调层做了几处**硬约束**提交，直接改变了本文档原先的一些"待决策"项：

1. **Agent Runtime 升为第 3 条 Primary Contribution**（v1 只是 AEL + CWS 之间的连接件）。
2. **存储层明确三分**（Figure 1 + §6.1 Storage 段）：
   - **etcd** 管协调状态 — Step Lease TTL、FlowScheduler leader election、节点心跳、Policy 热配置。
   - **PostgreSQL** 管数据 — AEL 四层 + `scheduling_arm_stats` + SEM 关系元数据。
   - **Qdrant** 管 SEM 向量索引 — filtered HNSW，避免 SQL 侧 filtered ANN 退化。
3. **§5.3 Step Lease 整个改写** — 不再是 PostgreSQL `FOR UPDATE SKIP LOCKED` 为主，而是 **etcd 原生 lease + CAS + watch + TTL 心跳**。PG 只写审计记录。
4. **§6.1 新增组件指定**：
   - **HashiCorp Vault** 实现 JIT 动态凭据（§8.3.2），Provider API Key 不再进环境变量或 K8s Secret。
   - **Prometheus + Grafana** 作为 Observability Plane 的实际栈，指标名（`agent_steps_total`, `ucb_arm_selection_total`, `provider_cost_usd_total`, `etcd_lease_expiry_total`, `wal_write_latency_seconds`）都被点名。
5. **SEM pre-step enrichment** 明确是 **Qdrant（filter + ANN）→ PostgreSQL（按 id 点查）** 两段式，`MemoryRecord` 新增 `qdrant_id` 字段。
6. **§2.3 新增"storage design"段** — 论文显式区分 etcd (who is doing what) 和 PostgreSQL (what was done)，并指出这条边界是 UCB 收敛（Proposition 5.1）的必要条件。

**对本文档的影响：**
- §0 TL;DR、§1 术语表、§3 Schema、§4.6 Step Lease、§5 Phase 0/1/2/3、§6 风险、§7 下一步都已按 v2 更新。
- Phase 0 原来列的 5 个决策题缩减为 2 个（多数已被论文直接回答）。
- §4.6 Step Lease 从 "PG SKIP LOCKED" 改写为 "etcd CAS + watch"，PG 只保留审计镜像字段。
- 新增 §4.7 Vault + Prometheus/Grafana 段。

---

## 0. TL;DR

当前仓库是一个**多租户终端协作系统**（Workspace / Member / Terminal Session / Chat + 分布式 Node Registry + 扁平 Ledger + KV Memory + Token 计费），具备论文"执行层"所需的底层机能（PTY、Provider 适配、WebSocket 实时、初步 Node 心跳、初步 Orchestrator），**但论文三大核心原语全部缺失或只有雏形**：

| 论文原语 | 当前状态 | 差距等级 |
|---|---|---|
| **AEL (四层 FSM 单调 Ledger)** | 扁平 `LedgerEvent` append-only 日志；SQLite；无 Run/Flow/Step/SideEffect 层级；无 FSM validator | 🔴 缺失核心 |
| **CWS (Cognitive Workload Scheduler)** | 无任何调度器；`tokentrack` 仅事后计费；`Orchestrator` 只是 chat → terminal 的直通分发 | 🔴 完全缺失 |
| **Agent Runtime (AgentInstance 八态 FSM + L1 memory)** | `session.Actor` 五态 FSM（idle/starting/attached/running/exited/error），无 suspend/resume，无 L1 上下文复用机制，实例≈terminal session | 🟡 部分（骨架可复用） |
| **Step Lease (etcd CAS + watch)** | `taskqueue` 有 claimed/running FSM 和 retry，但无 etcd 集成、无 TTL watch 机制、无 compare-and-swap lease 语义 | 🔴 机制完全不对 |
| **SEM (五类型 + confidence decay)** | `memory` 是 `(scope, key) → value` KV，仅 agent/team/global 三 scope；无 pitfall/workflow/iteration/open_issue/artifact 类型；无 decay | 🟡 概念雏形 |
| **Adapter Layer + AEP** | `terminal/provider` 有 OpenAI/Claude/Gemini/Local 的**终端** adapter，但不是论文的 LLM-call-level AEP；无 AgentDescriptor / TaskSpec / ResultContract 形式化 | 🟡 方向对但抽象不对 |
| **Policy Plane** | `authn` + `authz` 提供 JWT 和基础 RBAC；无 Approval / SecretScope / SafetyGate / Trust Attestation 的正式 enforcement point | 🟡 基础在 |
| **五 Plane 分层** | 按包组织，但层次交叉（`orchestration` 同时做 Control + Execution + 消息路由） | 🟡 需要重划 |

**底层基础设施差距（论文 v2 已硬性指定的栈）:**
- 当前所有持久化是 **SQLite + JSON 文件**，完全缺失论文要求的三存储分层：
  - **PostgreSQL 14+**（serializable 事务） — AEL 四层表 + `scheduling_arm_stats` + SEM 关系元数据
  - **etcd 3.5+** — Step Lease TTL / leader election / 节点心跳 / Policy 热配置（**当前完全没有**）
  - **Qdrant** — SEM 向量索引（filtered HNSW）（**当前完全没有**）
- **HashiCorp Vault** — JIT 动态凭据（当前 Provider API Key 是如何管理的需要单独核实，八成是环境变量/配置文件，与 Vault 模式冲突）
- **Prometheus + Grafana** — Observability Plane 实际栈（当前 `observability` 包的集成程度待评估，至少没有论文点名的那些指标）
- 无 **Kubernetes CRD / controller-runtime**（论文强调 K8s-native），虽然 `k8s/` 下有 deployment 清单但非 operator 模式
- **对象存储**用于 AEL >32KB payload 两层模型 — v2 论文没重点讲，Phase 1 可先 inline，后期补 MinIO/S3

**核心结论:** 这不是一次小重构，而是**架构层的范式迁移**。但好消息是：前端 / API contract / 终端执行层 / WebSocket 实时 / 多租户基础设施 **都可以保留**，论文的改造主要落在 **状态层（Ledger/Memory/Schema）** 和 **调度层（Orchestrator → FlowScheduler + CWS）**，以及在现有 session 之上**包一层 AgentInstance Runtime**。

---

## 1. 术语对照表（论文 ↔ 当前代码）

避免重构时的命名混乱，先固定映射：

| 论文概念 | 当前代码概念 | 是否重命名 | 备注 |
|---|---|---|---|
| **Hive** (agent team) | `Workspace` / `Team` | ❌ 保留 `Workspace`（前端深度依赖）；在 AEL 里用 `hive_id` 列同时存储，初期等同 `workspace_id` | 多租户 `tenant_id` 独立引入 |
| **AgentInstance** | `session.Actor` + `SessionInfo` | ✅ 新增 `AgentInstance` 概念，包裹现有 session；session 变成 AgentInstance 的"执行 backend" | session_id 仍可作为 instance_id |
| **agent_type** (静态 7-tuple) | `terminal_type` (claude/gemini/shell) + `Skill` 绑定 | ⚠️ 需要合并抽象为 `AgentDescriptor` | 论文七元组: (C, M, I, O, p̂, r̂, l̂) |
| **Run** | 无对应（最接近是一次 chat → terminal 的分发任务） | ✅ 新增 | 顶层工作单元 |
| **Flow** | 无对应 | ✅ 新增 | Run 下的角色/子任务 |
| **Step** | 无对应（最接近是一次 LLM 调用，但未建模） | ✅ 新增 | 调度、lease、计费、replay 的原子单位 |
| **SideEffect** | `LedgerEvent` 里零散记录的外部交互 | ✅ 新建正式表 | 必须与 Step 原子提交 (T2) |
| **Step Lease** | `taskqueue.Task.claim` | ⚠️ 机制换掉 | v2 论文明确是 **etcd 原生 lease + CAS + watch**；`taskqueue` 的单机 claim 不能扩展成这个，要从零新建 `stepLease` 子系统（基于 etcd client） |
| **Pioneer / Executive / Researcher / Specialist / Pod** | `Member.role` (通过 role 模型) | ⚠️ role 模型需要对齐论文的角色分工 | `internal/domain/role` 可作为入口 |
| **Adapter Layer / AEP** | `terminal/provider` | ⚠️ 需要**新增** LLM 调用级 adapter，不是 terminal 级 | 现有 terminal provider 保留作为"PTY 后端" |
| **SEM (L2/L3)** | `memory` | ⚠️ 重构为 5 类型 + scope L2/L3 + decay + **Qdrant 向量索引** | 现有 KV API 作为 v1 保留；写路径 PG + Qdrant 双写 |
| **AEL (L4)** | `ledger` | ⚠️ 重构为 4 层 FSM | 现有 `LedgerEvent` 作为 v1 audit 子集 |
| **Control Plane** | `orchestration` + 部分 `api/http` | ⚠️ 拆分 | `orchestration` 保留 chat→terminal dispatch，新增 `controlplane` 包放 FlowScheduler |
| **Cognition Plane** | 无对应 | ✅ 新增 | Workload Classifier / Task Decomposer / SEM accessor |
| **Policy Plane** | `authn` + `authz` + 隐藏在各 handler 里的检查 | ⚠️ 抽出统一 enforcement point | 和 **Vault policy** 联动：policy 层负责 `(agent_type, tool)` → Vault policy 映射 |
| **Observability Plane** | `observability` + `ledger` 读路径 + `realtime` | ⚠️ 统一对接 AEL WAL 流 | 指标通道切到 **Prometheus**；现有 `observability` 包作为 Prometheus collector 实现 |
| **etcd (coordination)** | 无对应 | ✅ 新引入 | 论文硬性栈。管 Step Lease / leader election / 节点心跳 / policy 热配置 |
| **Qdrant (vector)** | 无对应 | ✅ 新引入 | SEM L3 向量索引；filtered ANN 查询 |
| **HashiCorp Vault (JIT secrets)** | 环境变量/配置文件里的 API Key（待核实） | ✅ 新引入 | JIT 动态凭据，Step 级 TTL 过期，AgentInstance idle 时无活跃 lease |
| **Prometheus + Grafana** | `internal/observability` (程度待评估) | ⚠️ 接线 | 论文点名的指标：`agent_steps_total` / `ucb_arm_selection_total` / `provider_cost_usd_total` / `etcd_lease_expiry_total` / `wal_write_latency_seconds` |

---

## 2. 包级 Gap 表

按 `backend/go/internal/` 字母序。每个包标注**保留 / 重构 / 新增 / 归档**。

| 包 | 论文对应 | 对齐度 | 行动 | 差距摘要 |
|---|---|---|---|---|
| `api/http` | API Gateway | 🟢 基本对齐 | **保留** + 加 v2 路由 | v1 路由保留；新增 `/api/v2/runs`, `/flows`, `/steps`, `/side-effects` |
| `authn` | Policy Plane · 身份 | 🟢 | **保留** | JWT 已具备，加 tenant claim |
| `authz` | Policy Plane · 授权 | 🟡 | **扩展** | 补 SecretScope / SafetyGate enforcement point |
| `contracts` | DTO 定义 | 🟡 | **扩展** | 新增 RunDTO/FlowDTO/StepDTO/SideEffectDTO/AgentDescriptorDTO |
| `domain/workspace` | Hive | 🟡 | **保留** + 加 `hive_id` 别名 | 概念一致，加多租户字段 |
| `domain/member` | agent_role 绑定 | 🟡 | **保留** + 扩展 | Member 继续存在；新增 AgentInstance 关联 |
| `domain/role` | Pioneer/Executive/… | 🟡 | **扩展** | 补齐论文六角色 + 能力约束 |
| `domain/roadmap` | Task DAG | 🟡 | **重构** | 现有 roadmap 是产品层 task 列表；论文 Task Decomposer 需要 DAG(V, E, w) 数据结构 |
| `domain/conversation` / `message` | 对用户的 chat | 🟢 | **保留** | 不在论文范围，作为 UI 侧交互 |
| `ledger` | **AEL** | 🔴 | **重构（核心）** | 扁平 LedgerEvent → 四层 + FSM validator + T1/T2/T3/T4 事务 |
| `memory` | **SEM** | 🟡 | **重构** | KV → 五类型 + L2/L3 scope + decay |
| `node` | Execution Node / NodeRegistry | 🟡 | **扩展** | JSON → 迁移到 PostgreSQL；加 ready/draining/quarantined 三态 |
| `observability` | Observability Plane | 🟡 | **扩展** | 接入 AEL WAL 流而不是独立 tracer |
| `orchestration` | Control Plane · FlowScheduler（部分） | 🔴 | **拆分** | 现在一个文件做 chat dispatch + invite；拆出 `controlplane/flowscheduler` 包 |
| `platform/http` | 横切 middleware | 🟢 | **保留** | 稳定基础 |
| `platform/runtime` | 配置 / 启动 | 🟢 | **扩展** | 加 Postgres DSN、object storage 端点配置 |
| `plugin` | 扩展机制 | ⚪ | **观望** | 论文未明确涉及 |
| `presence` | Observability · 在线状态 | 🟢 | **保留** | UI 层需要 |
| `projectdata` | 项目元数据 | 🟢 | **保留** | 不在论文核心 |
| `realtime` | Observability WS 推送 | 🟢 | **保留** | 接入 AEL 事件流 |
| `roster` | 团队成员快照（JSON） | 🟡 | **重构** | 迁移到 PostgreSQL；`.open-kraken/roster.json` 废弃为 boot-strap 种子 |
| `session` | **AgentInstance 骨架** | 🟡 | **包一层** | 保留 Actor FSM 作为 backend；在其上新增 AgentInstance 层（8 态） |
| `settings` | 用户偏好 | 🟢 | **保留** | |
| `skill` | **AgentDescriptor · 能力声明** | 🟡 | **重构** | 当前是 Markdown 目录；论文要求 capabilities 集合 + I/O modality + 成本/可靠性估计 |
| `taskqueue` | Step Lease 雏形 | 🟡 | **重构合并** | 合并进新的 `step_lease` 子系统；作为分布式锁基础 |
| `terminal` / `terminal/provider` / `terminal/semantic` / `terminal/dispatch` | Execution Plane · PTY backend & Provider Adapter | 🟢 | **保留** | 重要资产，作为 AgentInstance 的实际执行后端 |
| `tokentrack` | CWS cost 观测源 | 🟡 | **扩展** | 事后计费 → 作为 Ĉ(a,p,τ) 历史数据；加 UCB `scheduling_arm_stats` 表 |
| `pty` | PTY 基元 | 🟢 | **保留** | |
| `authn/adapter` | provider 身份 | 🟢 | **保留** | |
| `migration` | DB schema migration | 🟡 | **重构** | 从 SQLite 迁到 Postgres；加入 AEL / arm_stats / SEM 的建表脚本 |

---

## 3. 存储层 Gap（三存储分层）

论文 v2 Figure 1 + §6.1 明确存储分三层，按"数据语义类型"而不是"实现方便"切分。边界是刻意设计的：conflating coordination state 和 operational history 会破坏 UCB 收敛（§2.3 storage note + Proposition 5.1）。

### 3.1 当前持久化（碎片化、全错）

```
backend/go/internal/ledger/     → SQLite: ledger_events
backend/go/internal/memory/     → SQLite: memory_entries
backend/go/internal/tokentrack/ → SQLite: token_events
backend/go/internal/taskqueue/  → SQLite: tasks
backend/go/internal/node/       → nodes.json (互斥锁保护)
backend/go/internal/skill/      → skills.json + markdown 目录
backend/go/.open-kraken/        → roster.json, workspace 元数据
```

相对论文的核心问题：
1. **多库不可跨库事务**：T2 要求 Step 更新 + SideEffect 提交 + Run 预算扣减 **同事务**。当前分散在 3 个 SQLite + 1 个 JSON，跨库事务不可能。
2. **SQLite 无 serializable + `FOR UPDATE`**：AEL T2 要求 serializable isolation，SQLite 只有库级锁，语义不匹配。
3. **没有 etcd** — Step Lease / 节点心跳 / leader election 需要的 TTL + CAS + watch 基元一个都没有。用 PostgreSQL row lock 模拟会失去 TTL 服务器端执行，死连接持锁的情况下无法自动释放。
4. **没有 Qdrant** — SEM pre-step enrichment 需要 filtered ANN，PG 侧 pgvector + JSONB filter 在记录上千万以后会退化为全扫（论文 §5.7.4 明确说过这是切到 Qdrant 的动机）。
5. **JSON 文件存节点/角色**：重启/多实例一致性差。

### 3.2 目标存储分层

#### 3.2.1 PostgreSQL 14+ — 数据层（"what was done"）

存放一切需要 ACID、immutability、结构化查询的东西：

```
  -- AEL 四层
  runs               (id, tenant_id, hive_id, state, policy_set_id,
                      token_budget, tokens_used, cost_usd, version)
  flows              (id, run_id, tenant_id, agent_role, assigned_node, state, version)
  steps              (id, flow_id, run_id, tenant_id, state,
                      lease_node_id, lease_expires_at,   -- 审计镜像（见 §4.6）
                      agent_id, provider, input_ref, input_hash,
                      event_stream, output_ref, tokens_used, cost_usd,
                      duration_ms, failure_reason, version)
  side_effects       (id, step_id, run_id, tenant_id, seq,
                      target_system, operation_type, idempotency_class,
                      idempotency_key, request_payload, response_payload,
                      state, policy_outcome, executed_at)

  -- CWS 学习状态
  scheduling_arm_stats (agent_type, provider, workload_class, regime,
                        pull_count, reward_sum, reward_sq_sum, last_updated)

  -- Agent Runtime 持久态
  agent_instances    (instance_id, agent_type, provider, tenant_id,
                      state, assigned_step, context_l1_ref,
                      spawned_at, last_active)

  -- SEM 关系元数据（内容 + qdrant_id 指针）
  sem_records        (id, type, scope, hive_id, run_id, key,
                      content, qdrant_id,                 -- ← 新增：指向 Qdrant 里的向量点 ID
                      created_by, source_step, confidence,
                      version, superseded_by, resolved_at, created_at)

  -- Control Plane 元数据
  agent_descriptors  (id, version, capabilities[], model_type,
                      input_modalities[], output_modalities[],
                      preferred_providers[], concurrency, tool_permissions[],
                      cost_estimate_fn, ...)   ← 替代 skills.json
  policy_sets        (id, rules, created_at, version)
  apex_decisions     (id, type, blueprint_ref, evidence, requested_by, expires_at, outcome)

  -- Observability 镜像（作为 Prometheus 的事件级补充，不替代 Prometheus）
  orchestration_events (id, type, actor, payload, created_at)
```

保留的遗留表（作为 v1 兼容 / audit-only 视图）：
```
  ledger_events      → 从 steps + side_effects 投影的 view，或只读历史数据
  memory_entries     → 从 sem_records 投影的 KV view
  token_events       → 保留，与 steps.tokens_used / cost_usd 双写或迁移
```

**FSM 约束 + immutability**：所有 terminal state 的记录通过 FSM validator + ENUM defense-in-depth 双重保证不可变。

**WAL 消费**：Prometheus 和 CWS 的 arm stats 更新器都通过 `pgx` logical replication 消费 PostgreSQL WAL 流，而非轮询。

#### 3.2.2 etcd 3.5+ — 协调层（"who is doing what right now"）

存放一切瞬时的、TTL 驱动的、需要 CAS + watch 的状态：

```
  /leases/step/{step_id}    → {node_id, lease_id}         TTL = 30s（由 etcd 服务端执行）
  /nodes/{node_id}/status   → {state, capacity}            TTL = 15s，节点每 5s 续约
  /leader/scheduler         → {instance_id, elected_at}    TTL = 30s，FlowScheduler leader
  /leader/wal_consumer      → {instance_id}                TTL = 30s，CWS WAL 消费者唯一性
  /policy/{tenant_id}/hot   → {policy_version, rules}      热配置，Policy Plane 订阅 watch
```

**约束**：
- 所有 etcd key 的值**都是瞬时的**。节点宕机或网络分区时 TTL 自动过期，无需清理进程。
- etcd **不存任何操作历史**。Lease 被 grant/revoke 的事件通过 FlowScheduler 镜像到 PG `steps` 的审计字段和 `orchestration_events` 表。
- PG 的 `steps.lease_node_id / lease_expires_at` 字段**不是**授权源；它们是 etcd lease 状态的异步镜像，用于审计查询。授权判定始终走 etcd CAS。

#### 3.2.3 Qdrant — 向量层（"what is similar to what")

存放 SEM 记录的 embedding + filter 字段：

```
Collection: sem_records
  vector dim: 768 or 1024（取决于 embedding 模型）
  payload schema:
    record_id:   UUID       ← 回 PG 主键
    hive_id:     UUID       ← filter 常用
    scope:       string     ← step/flow/run/hive
    type:        string     ← pitfall/workflow/iteration/open_issue/artifact
    confidence:  float
    created_at:  int64
  index: HNSW，filter 在索引层执行（filterable payload）
```

**双写约束**：SEM 写入流程必须**先 PG 后 Qdrant**。PG 提交成功但 Qdrant 失败时，记录 `qdrant_id = NULL` 并由后台 reconciler 补索引。这保持 AEL 关联正确（source_step 必须存在）而允许 Qdrant 暂时落后。

**Qdrant 可用性降级**：pre-step enrichment 查询 Qdrant 超时/失败时，fallback 到纯 PG `type + scope + confidence` 过滤（无向量相似度），质量下降但不中断 Step 执行。这符合论文 §5.7.5 "SEM advisory" 的可用性契约。

### 3.3 索引（论文 Appendix A.4）

PostgreSQL partial index：
- `idx_steps_pending`（FlowScheduler 拉取待分配 Step）
- `idx_runs_tenant_active`（多租户 dashboard）
- `idx_steps_run_audit`（Run 审计查询）
- `idx_side_effects_step`（replay / 幂等去重）
- `idx_arm_stats_lookup`（UCB 打分时按 `(agent_type, workload_class, regime)` 查）
- `idx_steps_lease_expiry` — 保留作为**备份恢复路径**，当 etcd watch 丢失事件时 T4 扫描器仍能捕获过期 lease；但它不是主路径。

Qdrant：payload filterable 字段 = `{hive_id, scope, type, confidence}`，HNSW 参数 `m=16, ef_construct=128` 作为起点。

etcd：不需要用户自定义索引（内部 B+tree 按 key prefix 查询已经够用）。

---

## 4. 核心组件 Gap 深潜

### 4.1 AEL（最关键）

**当前**: `internal/ledger/model.go` 只有 `LedgerEvent{ID, WorkspaceID, TeamID, MemberID, NodeID, EventType, Summary, CorrelationID, SessionID, ContextJSON, Timestamp}`，`service.go` 提供 `Append/Query`。

**论文要求**:
1. **四层数据模型**: Run → Flow → Step → SideEffect
2. **FSM validator**: 每次 UPDATE 前验证状态转移，terminal state 为 absorbing node；ENUM defense-in-depth
3. **T1 Lease issuance 的 PG 部分**: 预算原子扣减 + steps 审计镜像字段（`lease_node_id`/`lease_expires_at`）。**但 lease 本身的独占授权在 etcd**（见 §4.6）— PG 的 T1 只负责：① 读 pending step、② 扣预算、③ 写审计镜像，不负责"谁拿到 lease"的判定
4. **T2 Step completion**: Serializable isolation，Step 状态 + SideEffect 提交 + Run 成本更新 + `scheduling_arm_stats` 更新（VERIFIABLE/PROXIED regime） **同一事务**
5. **T3 Lease renewal**: etcd 侧 keepalive；PG 侧可选地更新 `lease_expires_at` 镜像（非关键路径）
6. **T4 Lease expiry recovery**: etcd watch fire 时由 FlowScheduler 处理；PG 侧的 T4 扫描器**降级为备份路径**（etcd watch 丢事件时兜底）
7. **两层 payload 模型**: ≤32KB inline，>32KB 走对象存储 + SHA-256 hash（Phase 1 可暂时全 inline）
8. **WAL 流**: `pgx` logical replication 给 CWS arm stats 更新器 和 Prometheus event scraper 实时消费

**改造幅度**:
- `internal/ledger` 完全重写（~2000 行新代码）
- 驱动层：SQLite → PostgreSQL (`jackc/pgx`)
- 新增依赖：`pgx` logical replication、`etcd/clientv3`（Step Lease 必需）；对象存储可延迟到 Phase 2+
- 所有现有的 `ledger.Append` 调用点（`handler.go`、`orchestration`、各 handler）需要：要么映射到 v1 audit API（读写旧 `ledger_events`），要么改写到 AEL v2。

**迁移策略**:
- **并存期**：v1 `ledger_events` 表继续存在，只接收旧调用；v2 AEL 四层表启动后同时接受新代码写入。
- **单向投影**：v2 Step 提交时也向 v1 `ledger_events` 投影一条 summary 记录，保持 Observability UI 不破坏。
- **最终删除 v1**：所有读路径迁移到 v2 后废弃 v1 表。

### 4.2 CWS

**当前**: 零实现。`orchestration.DispatchChatToTerminal` 只做 `memberID → sessionID` 的静态查找，没有任何 (agent, provider) 候选集评估。`tokentrack` 记账，但从未被读回做决策。

**论文要求**:
1. **Workload Classifier**: 给每个 Step 打 regime 标签（VERIFIABLE/PROXIED/OPAQUE）
2. **Feasibility filter**: 五个硬约束 + DAG critical-path 约束 + SEM pitfall 排除
3. **UCB-1 arm selection**: 维护 `scheduling_arm_stats` 表，score = r̄ + √(2 ln t / n)
4. **三层信号设计（OPAQUE）**: DAG 反向传播 + Run-level outcome + 稀疏人工标注
5. **VERIFIABLE speculative execution**: cost 升序 tier 遍历，失败则写 SEM pitfall
6. **WAL 驱动的实时 reward 更新**: 从 AEL logical replication 流消费 terminal event

**新增包**:
```
internal/cognitive/classifier/   → WorkloadClassifier
internal/cognitive/scheduler/    → BudgetAwareScheduler (CWS 核心)
internal/cognitive/armstats/     → scheduling_arm_stats 读写
internal/cognitive/walconsumer/  → AEL WAL → arm reward 翻译
```

**前置依赖**: AEL 必须先落地（CWS 靠 WAL 流驱动）。**CWS 不能独立先做**。

### 4.3 Agent Runtime

**当前**: `session.Actor` 五态 FSM (`idle → starting → attached → running → exited/error`) + 丰富的终端上下文（PTY、buffer、intelligence / semantic 层）。这其实**非常适合**作为论文 Agent Runtime 的底层执行引擎。

**论文要求**:
1. **八态 FSM**: `created → scheduled → running → idle → suspended → resumed → terminated → crashed`
2. **AgentInstance 持久身份**: 跨 Step 保留 `instance_id` 和 `context_l1`
3. **Pool 管理**: 按 `(agent_type, provider, tenant)` 维护实例池，lazy spawn + idle timeout reap
4. **JIT 权限**: 只在执行 Step 期间授予当前 Step 所需权限；idle 实例无活跃权限
5. **Suspension 语义**: Policy approval 等待期间 context 保留，lease 续约而非过期
6. **L1 → L2 promotion on crash**: 临终前把有价值的上下文升级到 Run SEM

**改造策略**:
- **不重写 session**，在其之上加 `internal/runtime/instance` 包：
  - `AgentInstance` 结构体包含 `session.Actor` 作为一个字段
  - 实现八态 FSM（映射关系：session 的 `idle/attached/running` → instance 的 `scheduled/idle/running`）
  - 新增 `suspended/resumed/crashed` 三态（session 的 exit/error 映射到 crashed）
- `session.Actor` 的 intelligence / semantic 层继续独立演化
- 新表 `agent_instances`（见 3.2）

### 4.4 SEM

**当前**: `internal/memory/model.go` 提供 `MemoryEntry{Key, Value, Scope: agent|team|global, TTLSeconds}`。纯 KV，无结构化类型。

**论文要求**:
1. **5 种记录类型**: `pitfall / workflow / iteration / open_issue / artifact`
2. **scope**: `step / flow / run / hive`
3. **confidence decay**: hive-scoped 记录 TTL 过后 confidence 减半，<0.1 归档
4. **pre-step enrichment**: 自动按 embedding 相似度注入 relevant pitfalls/open_issues 到 Step context（上限 2000 tokens）— v2 论文明确是 **Qdrant filtered ANN + PG 点查** 两段式
5. **自动 iteration records**: 每次 Step retry 无需 agent 主动写
6. **冲突合并**: `c_merged = 1 − (1 − c₁)(1 − c₂)`

**两段式查询（论文 §5.7.4 的正式流程）**:

```
# Stage 1: Qdrant — filter + ANN（<1ms，HNSW 索引层执行 filter）
results = qdrant.search(
  collection = "sem_records",
  vector     = embed(step.task_description),
  filter     = {hive_id: step.hive_id,
                scope:   ["run", "hive"],
                confidence: {gte: 0.1}},
  limit      = 20,
)
record_ids = [r.payload["record_id"] for r in results]

# Stage 2: PostgreSQL — 按主键批量点查（<1ms）
records = pg.query(
  "SELECT * FROM sem_records WHERE id = ANY($1)", record_ids,
)
```

总延迟目标 <3ms，即使 L3 collection 到百万级记录也不退化（HNSW + filterable payload 的 filter 不会退化为全扫，这是相对 pgvector 的主要动机）。

**改造方案**:
- **新表** `sem_records`（见 §3.2.1），`qdrant_id` 字段指向向量点
- **新增 Qdrant collection** `sem_records`（见 §3.2.3）
- **写路径双写**：先 PG 提交（保证 source_step FK 正确），再写 Qdrant；失败时 `qdrant_id = NULL`，由后台 reconciler 重建
- 旧 `memory_entries` 保留并提供 `KV view` 读 API 兼容
- **新增依赖**：
  - `qdrant-go` client
  - **Embedding 模型** — 初期可以用本地 `bge-m3` / `gte-multilingual-base`（纯 CPU 推理），或转而调 Provider 的 embedding API（有成本，但和 CWS 预算挂钩后可审计）
- **读路径降级**：Qdrant 超时/宕机 → fallback 到 PG `type + scope + confidence` 简单过滤（无相似度排序），这是论文 §5.7.5 "SEM advisory 可用性契约"允许的行为

**注意**:
1. SEM 写的第一条规则是 `source_step` 必须引用存在的 AEL Step — 意味着 **SEM 必须在 AEL 之后落地**。
2. 即便 Qdrant 挂了 SEM 也不能挂 — 向量层是加速层，不是授权源。

### 4.5 Adapter Layer + AEP

**当前**: `internal/terminal/provider` 有 OpenAI/Claude/Gemini/Local 的**终端命令生成**适配（用于启动 PTY 会话），但它不是论文讲的"LLM 调用级" adapter — 论文的 adapter 是把一次 LLM 推理请求翻译成 provider API 调用，并归一化 token 计数 / tool use / streaming 到 AEP `event_stream`。

**改造方案**:
- **保留** `terminal/provider` 作为"PTY 后端启动器"（Claude Code / Gemini CLI 这类交互终端）
- **新增** `internal/adapter/llm/{openai,claude,gemini,local}` 作为论文的 LLM 调用级 adapter
  - 输入: AEP `TaskSpec`
  - 输出: AEP `ResultContract` + `event_stream` 写入 AEL
  - 统一 `idempotency_class` 打标
- **AEP 规范放在** `internal/aep/`（协议定义、DTO、版本常量）

### 4.6 Step Lease（etcd 原生）

**当前**: `internal/taskqueue` 有 task claim 语义，但完全是单 SQLite 上的行锁，不能扩展到论文 v2 要求的分布式 lease。**这个包不能原地"扩展"，需要从零新建基于 etcd 的 lease 子系统**。

**论文 v2 §5.3 的机制**（完全改写版）:

论文明确放弃了 "PostgreSQL `FOR UPDATE SKIP LOCKED` + `lease_expires_at` 每秒扫描器" 的方案，改用 **etcd 原生 lease**。动机（论文原文）：
> "A PostgreSQL advisory lock held by a dead connection requires session-level cleanup that cannot be relied upon in a distributed failure scenario. etcd leases carry a TTL enforced server-side, so a node that crashes or is partitioned automatically releases its lease without requiring any cleanup process."

**机制**（论文伪代码直接摘录 + 我们项目的落地注释）:

**(1) Lease 授权** — FlowScheduler 发布 Step：
```go
// 先在 etcd grant 一个带 TTL 的 lease
lease, _ := etcd.Grant(ctx, 30 /*seconds*/)

// CAS：只有 /leases/step/{id} 不存在时才能建立
txn := etcd.Txn(ctx).
  If(clientv3.Compare(clientv3.Version(leaseKey), "=", 0)).
  Then(clientv3.OpPut(leaseKey, nodeID, clientv3.WithLease(lease.ID))).
  Else()  // 另一个 scheduler 抢到了，skip

resp, _ := txn.Commit()
if resp.Succeeded {
    // 写 PG 审计（AEL T1）：Step → leased + 扣预算 + 镜像 lease 字段
    ael.T1_LeaseMirror(stepID, nodeID, leaseExpiry)
    dispatchToNode(nodeID, stepID, lease.ID)
}
```

PostgreSQL 的 `steps.lease_node_id / lease_expires_at` 字段**只是镜像**，不是授权源。真正的独占授权是 etcd CAS 的 `If Version == 0` 条件。

**(2) Lease 续约** — 执行节点 keepalive：
```go
ka, _ := etcd.KeepAlive(ctx, leaseID)
for range ka {
    // Lease 保持 alive；忽略返回值
}
// 当 ka channel close → 说明 etcd 认定 lease 已过期（节点 GC 停顿 / 网络分区 / etcd 主动失效）
// 节点必须立即停止执行当前 Step，不能再提交 T2（提交会被 Trust Attestation 拒绝）
```

**(3) Lease 过期监听** — FlowScheduler 订阅删除事件：
```go
watchChan := etcd.Watch(ctx, "/leases/step/", clientv3.WithPrefix(),
                        clientv3.WithFilterPut())  // 只关心 DELETE 事件
for resp := range watchChan {
    for _, ev := range resp.Events {
        if ev.Type == mvccpb.DELETE {
            stepID := parseStepID(ev.Kv.Key)
            ael.RecordLeaseExpired(stepID)        // 写 orchestration_events
            scheduler.Reassign(stepID)            // 进入重新派发流程
        }
    }
}
```

etcd 的 `DELETE` 事件在 lease TTL 到期时由 etcd server 自动触发，无需应用层扫描。PG 侧的 T4 扫描器只作为**兜底**：如果 watch 连接断开恢复期间丢了事件，扫描器还能捕获残留的 `running` 状态 step。

**(4) 节点健康注册** — 节点自己在 etcd 维护心跳 key：
```go
lease, _ := etcd.Grant(ctx, 15)
etcd.Put(ctx, fmt.Sprintf("/nodes/%s/status", nodeID),
         marshalStatus(Ready, capacity),
         clientv3.WithLease(lease.ID))
etcd.KeepAlive(ctx, lease.ID)  // 每 5 秒续一次
```

FlowScheduler 通过 `etcd.Get("/nodes/", WithPrefix())` 列出健康节点。节点死掉 15 秒后自动从列表消失，不需要独立的心跳监视器。

**(5) 读路径 — "谁持有 lease?"**

```go
// 权威判定：etcd
resp, _ := etcd.Get(ctx, fmt.Sprintf("/leases/step/%s", stepID))
if len(resp.Kvs) == 0 {
    // 没人持有
} else {
    holder := string(resp.Kvs[0].Value)
}

// 审计判定：PG（可能滞后几秒）
pg.QueryRow("SELECT lease_node_id, lease_expires_at FROM steps WHERE id = $1", stepID)
```

**改造包结构**:

```
internal/stepLease/
  ├── etcd_client.go       → 封装 clientv3，提供 Grant/CAS/Watch/Keepalive
  ├── scheduler_side.go    → FlowScheduler 侧：Acquire, ReassignOnExpiry
  ├── node_side.go         → 执行节点侧：Hold, Keepalive, Release
  ├── mirror.go            → 写 PG 镜像字段（调用 ael.T1_LeaseMirror）
  └── watchdog.go          → PG 侧 T4 扫描器（兜底路径，每 5s 跑一次，catch watch lost 遗漏的过期）
```

**现有代码影响**:
- `internal/taskqueue` — 归档或作为"跨 tenant 非 Step 异步任务"保留（备份导出、报告生成之类）。**不**用于 Step Lease。
- `internal/node` — JSON nodes.json 作废，节点注册改写 etcd `/nodes/` 心跳 key；`node.Service` 变成 etcd watcher 包装
- `internal/orchestration` — 调用点从 `taskqueue.Claim` 改为 `stepLease.Acquire`

**Phase 排期**: etcd 客户端和基础 lease API 要在 **Phase 1** 就引入（否则 AEL T1 就没有 lease 的上游依赖）。跨节点的 CAS 竞争测试可以到 **Phase 3** 再做（单节点时 CAS 天然不冲突）。

### 4.7 Vault (JIT secrets) + Prometheus (observability)

v2 论文 §6.1 和 §8.3.2 明确指定了这两个组件，不是可选的。

#### 4.7.1 HashiCorp Vault — JIT 动态凭据

**论文要求**:
1. **Provider API Key 不进环境变量 / K8s Secret / 任何持久存储** — 只存在于 Vault
2. **Step 级 TTL** — Step assignment 时 Agent Runtime 向 Vault 请求一个 `(provider, tool_set)` 范围的 dynamic secret，TTL = `step_estimate × 1.2`
3. **Step 完成 → 显式 revoke**；未 revoke → TTL 到期自动作废
4. **AgentInstance 在 `idle` / `suspended` 状态持有零 Vault lease**
5. **Vault policy 作为 Policy Plane 的第二执行点** — `(agent_type, workload_class)` → 允许的 Vault path pattern，这是应用层 permission check 之外的独立闸门

**当前状态待核实**:
- 仓库里 Provider API Key 现在怎么传进 `terminal/provider`？环境变量？`.open-kraken/` 下的配置？需要翻 `config.go` / `runtime.Config` 确认。
- 如果目前是环境变量/配置文件，**直接和 JIT 模式冲突**，需要 Phase 2 阶段就开始迁移（不能拖到 Phase 4）。

**落地方案**:
- **新增 `internal/secrets/vault/`** 包，封装 Vault client 和 dynamic secret 请求
- **Agent Runtime hook**：AgentInstance 从 `scheduled → running` 时（Step dispatch 点），调用 `vault.IssueStepCredential(stepID, agentType, toolSet, ttl)`；得到的 short-lived token 塞进 L1 context 的非持久化字段
- **Adapter 层消费**：`internal/adapter/llm/*` 从 context 里拿短期 token 调用 provider；不再从全局配置读 key
- **完成 hook**：Step 进入 `idle` 时 `vault.RevokeStepCredential(leaseID)`

**Phase 排期**: Phase 2（和 LLM Adapter 新建一起落地，因为 Adapter 就是消费凭据的地方）。Phase 1 可以先硬编码 key 到 Adapter 配置作为 stub，但必须在代码里标注 `// TODO: Vault JIT, see §4.7.1`。

#### 4.7.2 Prometheus + Grafana — 观测栈

**论文 §6.1 点名的指标**:

| 指标 | 维度 | 用途 |
|---|---|---|
| `agent_steps_total` | `provider`, `workload_class`, `regime`, `state` | 吞吐 + 成功率 |
| `ucb_arm_selection_total` | `agent_type`, `provider`, `workload_class` | CWS 调度分布 |
| `scheduling_score_histogram` | `workload_class` | CWS score 分布 |
| `provider_cost_usd_total` | `provider`, `tenant_id` | 成本聚合 |
| `etcd_lease_expiry_total` | `reason` (expired / revoked) | 节点失败率 |
| `wal_write_latency_seconds` | — | AEL 写入 p99 |

**当前 `internal/observability`** 包程度待确认（见 §2 包级 Gap 表）。大概率现在是自定义 tracer，不是 Prometheus collector。

**落地方案**:
- `internal/observability/prometheus/` 子包，注册上面六个 metric
- 在 AEL T2 提交点、CWS arm selection 点、etcd lease watch 回调点、adapter 返回点打点
- 复用已有的 `/metrics` HTTP endpoint（如果有），否则新增
- Grafana dashboard 定义放 `ops/grafana/` 目录（新建）

**Phase 排期**: Phase 1 就开始打 `agent_steps_total` 和 `wal_write_latency_seconds`（AEL 一落地就有数据可发），其余指标跟着对应组件上线。Grafana dashboard 可以 Phase 3 再做。

---

## 5. 分阶段对齐计划（对应论文 §6.2）

### Phase 0 — 准备（1 周）

**目标**: 剩余决策锁定 + 基础设施 bring-up。论文 v2 已经硬性确认了存储栈，原先的 5 个决策题缩减到 2 个。

1. **剩余决策**（需要用户拍板）:
   - [ ] **命名策略** — `Workspace ↔ Hive`、`Member ↔ AgentInstance` 在代码层和 DB 层如何映射？（建议：代码保留 Workspace/Member，新表加 `hive_id`/`tenant_id`/`instance_id` 作为论文映射，前端不动）
   - [ ] **v1 API 兼容期** — 前端现有 `/api/v1/ledger/events`、`/api/v1/memory/*`、`/api/v1/tokentrack/*` 维持到哪个 Phase？（建议：至少到 Phase 3 结束）

2. **论文已回答、无需再决**:
   - ✅ PostgreSQL — 确定引入（`runs/flows/steps/side_effects/scheduling_arm_stats/sem_records/...`）
   - ✅ etcd — 确定引入（Step Lease + node heartbeat + leader election）
   - ✅ Qdrant — 确定引入（SEM 向量索引）
   - ✅ HashiCorp Vault — 确定引入（JIT Provider 凭据），Phase 2 落地
   - ✅ Prometheus + Grafana — 确定引入，Phase 1 起开始打点
   - ✅ 对象存储 — Phase 1 可先 inline，Phase 2+ 补 MinIO

3. **仓库准备**:
   - [ ] 新建 `internal/ael/`、`internal/runtime/`、`internal/cognitive/`、`internal/aep/`、`internal/stepLease/`、`internal/secrets/vault/` 骨架（空包占位）
   - [ ] 新建 `internal/migration/postgres/` 放 AEL schema SQL（基于论文 Appendix A）
   - [ ] `docker-compose.yml` 新增服务：PostgreSQL 14、etcd 3.5、Qdrant、Vault dev-mode、Prometheus、Grafana
   - [ ] 核实当前 Provider API Key 的存储位置，标注迁移工单
   - [ ] CI 增加 Postgres + etcd + Qdrant 集成测试矩阵

### Phase 1 — AEL + etcd lease 骨架 + 单节点对齐（2–3 周）

**目标**: 把论文 §5.1 + §5.3 + Appendix A 的最小可工作版本跑起来；不引入 CWS（只有 round-robin / 单节点直通）、不引入 SEM、不引入 Qdrant。

1. **Schema 落地**: 建 `runs/flows/steps/side_effects` 四张表 + 所有 FSM enum + 索引（Appendix A.4）
2. **FSM validator**: `internal/ael/fsm.go` 实现状态转移表 + ENUM defense-in-depth
3. **PG 事务**: `internal/ael/tx.go` 实现：
   - T1 PG 侧（预算扣减 + 审计镜像字段）— **lease 判定仍走 etcd**
   - T2 Step + SideEffect + Run cost 原子提交（serializable isolation）
   - T4 备份扫描器（每 5s 跑，兜底 etcd watch 丢事件）
4. **etcd lease 基础**: `internal/stepLease/` 实现 `Acquire / Hold / Keepalive / Release / Reassign` 五个基本操作；单节点即可测出 CAS 竞争
5. **AgentInstance 包裹层**: `internal/runtime/instance/` 引入八态 FSM，`session.Actor` 作为 backend
6. **Prometheus bootstrap**: `internal/observability/prometheus/` 注册 `agent_steps_total`、`wal_write_latency_seconds`、`etcd_lease_expiry_total`
7. **最小 Run**: 一次 chat → 一个 Run → 一个 Flow → 一个 Step → 一个 SideEffect（写 chat reply 到 WebSocket），全链路经过 etcd lease + AEL T1/T2
8. **v1 兼容**: `ledger.Append` 调用点不改，但在 AEL 层投影写入 `ledger_events`（保留前端 audit UI 可用）

**出口标准**:
- 一次 chat 消息完整走完 "etcd lease acquire → AEL T1 mirror → Adapter execute → AEL T2 commit → etcd lease revoke" 链路
- Ledger UI 仍然可用（通过投影）
- `agent_instance` 在 Step 结束后进入 `idle` 而不是 `exited`，下一条消息复用同一实例
- Prometheus `/metrics` 可抓取到 `agent_steps_total` 增长
- 单元测试覆盖 FSM、T1/T2/T4、etcd CAS 双抢不 double-lease
- 集成测试：kill -9 一个 holding 节点，etcd TTL 过期后 Step 自动回 `pending`

### Phase 2 — SEM + Qdrant + LLM Adapter + Vault（2–3 周）

1. **Qdrant bootstrap**: docker-compose 起 Qdrant，`internal/sem/qdrant/` 封装 client
2. **SEM PG schema**: `sem_records` 表 + `qdrant_id` 字段 + confidence decay job
3. **双写路径**: PG 提交 → Qdrant 插入 → `qdrant_id` 回填；失败时 reconciler 重建
4. **两段式查询**: `internal/sem/query.go` 实现 Qdrant filter+ANN → PG 点查；降级 fallback 到纯 PG filter
5. **pre-step enrichment**: Step dispatch 前自动查 pitfall / open_issue 注入 context
6. **自动 iteration 记录**: Step retry 时由 Runtime 写入
7. **LLM Adapter 包**: `internal/adapter/llm/openai.go` 和 `claude.go` 作为头两个 reference 实现（消费 AEP TaskSpec，产出 event_stream）
8. **Vault JIT 凭据**: `internal/secrets/vault/` 实现 `IssueStepCredential / RevokeStepCredential`；LLM Adapter 从 Step context 拿 short-lived token，不再读全局配置
9. **Workload Classifier**: `internal/cognitive/classifier/` 打 regime 标签（基于 TaskSpec `output_format` 字段的朴素规则）

**出口标准**:
- Step input 自动带上相关 pitfall block（Qdrant 命中）
- LLM 调用走新 adapter，AEL 里有完整 `event_stream`
- Provider API Key 不再出现在任何配置文件 / 环境变量
- Qdrant 宕机演练：enrichment 降级，Run 不中断

### Phase 3 — CWS + 真分布式 Step Lease（3–4 周）

1. **`scheduling_arm_stats` 表 + WAL consumer**: `internal/cognitive/walconsumer/`，通过 `pgx` logical replication 订阅 AEL 变更
2. **WAL consumer leader election**: 在 etcd `/leader/wal_consumer` 上选主，避免重复打分
3. **UCB-1 arm selection**: 初期只支持 VERIFIABLE regime（reward 信号最可靠），OPAQUE 用 round-robin 占位
4. **Feasibility filter**: 五约束（capability / budget / deadline / modality / node health）+ SEM pitfall 硬排除
5. **FlowScheduler**: `internal/controlplane/flowscheduler/` 替代现有 `orchestration` 的调度职责；支持多 scheduler 实例并发
6. **Step Lease 真分布式测试**:
   - 多 backend 实例同时跑 FlowScheduler，etcd CAS 保证唯一授权
   - kill -9 执行节点 → etcd TTL 过期 → watch 触发 Reassign → 新节点接手 → AEL 记录完整重试链
7. **Prometheus metrics 补齐**: `ucb_arm_selection_total`、`provider_cost_usd_total`、`scheduling_score_histogram`
8. **Grafana dashboard**: `ops/grafana/` 放 dashboard JSON
9. **`orchestration` 包瘦身**: 只留 chat → terminal 的 UI 适配路径

**出口标准**:
- 两个 backend 实例同时抢一个 Step，etcd CAS 让一个成功，另一个 skip 重试
- 节点宕机，etcd watch 在 TTL 内触发 Reassign（p95 < TTL+5s）
- CWS 在相同 workload class 上重复调度时，低成本 provider 的 `ucb_arm_selection_total` 单调增长
- Grafana 能可视化 arm 分布、p99 write latency、cost per tenant

### Phase 4 — Policy Plane 完整化 + 多租户 + 蓝图演化（长期）

1. Approval / SecretScope / SafetyGate / Trust Attestation 独立 enforcement point
2. Apex Decision 审批流
3. 多租户 row-level security
4. Blueprint Evolution Engine（论文 §5.8）
5. System Orchestrator council（论文 §5.9）

**说明**: Phase 4 是论文的"完整体"，当前不建议排期，等 Phase 1–3 稳定后再讨论。

---

## 6. 风险与未决问题

### 6.1 会破坏现有 demo 的点

| 风险点 | 原因 | 缓解 |
|---|---|---|
| Ledger UI 空白 | `ledger` 包重构，旧 API 可能暂时不可用 | Phase 1 强制要求 v1 投影写入，UI 不动 |
| 终端会话断流 | AgentInstance 包裹层引入 bug | `session.Actor` 完全保留，AgentInstance 只是外壳；有 feature flag 回退 |
| SQLite → PostgreSQL 影响本地开发 | 开发者要起 PostgreSQL + etcd + Qdrant | `docker-compose.yml` 一键启动完整栈；CI 强制 Postgres+etcd+Qdrant 矩阵 |
| `nodes.json` 文件替换 | 现有节点注册读路径依赖文件 | Phase 1 双写：新代码写 etcd `/nodes/`，旧代码继续读 JSON，逐步迁移 |
| Provider API Key 运行时改变 | Vault JIT 引入后，现有 Adapter 从全局配置读 key 的路径作废 | Phase 1 保留旧路径 + `// TODO: Vault`，Phase 2 再切；灰度时留 feature flag |

### 6.2 新版特有的技术风险

1. **etcd quorum 丢失**：etcd 是 Step Lease 的授权源。etcd 集群半数节点挂掉 → 集群进入只读 → FlowScheduler 无法新发 lease → 整个调度栈停摆。缓解：dev 单节点即可，prod 至少 3 节点 etcd；backend 实例监控 etcd 健康，etcd 不可用时进入"排空模式"（完成 in-flight Step 但不接受新 Run）。
2. **etcd watch 事件丢失**：watch 连接短暂断开期间的 DELETE 事件不会补发。PG 侧 T4 备份扫描器（Phase 1 必做）是这种场景的兜底。扫描器周期 5s + TTL 30s 意味着最坏情况下 lease 过期到 reassign 的延迟是 ~35s。
3. **Qdrant 和 PG 不一致**：双写不是原子的。PG 成功 Qdrant 失败 → `qdrant_id = NULL`，enrichment 查不到该记录。Reconciler job 定期扫描 `qdrant_id IS NULL` 并补索引；可接受的最坏情况是新 pitfall 记录延迟几秒才对 pre-step enrichment 可见。
4. **Vault lease TTL 与 Step 实际时长失配**：估计太短 → Step 执行中凭据过期 → LLM 调用中途失败；估计太长 → 凭据浪费 / 安全窗口过大。缓解：TTL = `step_estimate × 1.2`，Step 执行中如检测到剩余时间 <20% 主动续约。对长 Step（>5min）做保护性续约。
5. **`pgx` logical replication 单点**：Phase 3 引入 WAL consumer 后，单 consumer 宕机 → CWS reward 更新暂停。Phase 3 必须在 etcd `/leader/wal_consumer` 上做 leader election，非 leader 做热备。
6. **Embedding 模型选型**：纯 Go embedding 库选择有限；用 `bge-m3` 意味着要起一个 Python sidecar（或直接调 Provider embedding API）。前者增加部署复杂度，后者有成本。建议 Phase 2 用 Provider API 跑通，Phase 3 看量再决定是否本地化。
7. **Kubernetes CRD**: 论文强调 K8s-native。当前 `k8s/` 只是 deployment 清单。是否引入 controller-runtime + Run CRD？这是 Phase 4 的事，不必现在急。

### 6.3 命名 / 产品语义问题（需要用户决策）

1. **`Member` 指人类还是泛指 agent？** 当前代码 Member 既是人类也可以是 AI（`role.roleType`）。论文清晰区分 `tenant_user` 和 `agent_instance`。建议：
   - 新增 `agent_instances` 表独立于 `members`
   - `Member` 保留为"人类用户在 Workspace 的身份"
   - 一次对话 = 人类 Member 发起 Run，Run 分配给 AgentInstance 执行
2. **`Workspace` 是否有可能包含多个 `Hive`？** 论文允许一个租户多个 Hive。当前 Workspace 概念等于"一个 monorepo 文件夹"。建议短期内 `workspace_id = hive_id`，长期解耦。
3. **roadmap 是否就是 Run 的 task DAG？** 现有 `domain/roadmap` 是产品层的任务列表，论文 Task Decomposer 要求形式化 DAG。短期保留两套（roadmap 给 UI，内部 DAG 给调度器），长期合并。

---

## 7. 建议的下一步（给用户）

在 Phase 0 决策完成前，建议**先不动代码**。得益于论文 v2 的硬性确认，原先的 5 个决策缩到 2 个：

1. **命名策略** — `Workspace / Member` 在代码层保持不变，新表加 `hive_id / tenant_id / instance_id`；前端 API 不动。是否同意？
2. **v1 API 兼容期** — `/api/v1/ledger/events`、`/api/v1/memory/*`、`/api/v1/tokentrack/*` 维持到 Phase 3 结束（约 7–10 周后）。是否同意？

副问题（不是 blocker，但最好同步确认）：
- **当前 Provider API Key 是怎么传的？** 环境变量 / `.open-kraken/` 配置文件 / 别的？（影响 Vault 迁移路径的设计）
- **Phase 1 目标确认**：一次 chat 消息完整走完 "etcd lease → AEL T1/T2 → Prometheus 可观测"。是否同意？

用户确认后，我会把 Phase 0 + Phase 1 拆成 1–2 天粒度的工单清单继续推。

---

## 附录 A — 论文章节与本文档章节映射

| 论文章节 | 本文档相关章节 |
|---|---|
| §2.3 Storage design note (etcd vs PG 边界) | §3.2.1–§3.2.3 |
| §3 Architecture Overview + Figure 1 | §1 术语对照 / §2 包级 Gap / §3.2 |
| §4 Adapter Layer + AEP | §4.5 |
| §5.1 AEL | §4.1 + §3.2.1 |
| §5.2 CWS | §4.2 |
| §5.3 Step Lease (etcd-native) | §4.6 + §3.2.2 |
| §5.4 Agent Formal Model + AgentInstance | §4.3 |
| §5.5 Policy Plane | §2（`authz` 行）+ §4.7.1 Vault + Phase 4 |
| §5.6 Task Decomposition | §6.3（roadmap 讨论） |
| §5.7 SEM + Qdrant 两段式查询 | §4.4 + §3.2.3 |
| §5.7.6 四层记忆模型 | §4.4 结尾 |
| §5.8 Blueprint Evolution | Phase 4 |
| §5.9 Decision Hierarchy | Phase 4 |
| §6.1 Implementation: PG + etcd + Qdrant + Vault + Prometheus | §3.2 + §4.7 |
| §6.2 Phased Roadmap | §5 |
| §8.3.2 JIT privilege model (Vault) | §4.7.1 |
| Appendix A Schema & Transactions | §3.2.1 + §4.1 |
