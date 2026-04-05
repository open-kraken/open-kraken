# Open-Kraken E2E Test Plan

## 1. Node Registry 测试场景

### 1.1 节点注册
- [ ] 新节点向后端注册时，返回唯一 node_id 和注册确认
- [ ] 重复注册同一节点（相同 node_id）时，更新注册信息而非报错
- [ ] 注册缺少必要字段（node_id / capabilities）时，返回 400

### 1.2 心跳维持
- [ ] 注册节点每隔 T 秒发送心跳，后端记录 last_seen 时间戳
- [ ] 心跳响应包含最新的调度指令或配置变更

### 1.3 超时下线
- [ ] 节点停止心跳超过超时阈值后，后端将其标记为 `offline`
- [ ] 已下线节点不再被分配新的 Agent 任务
- [ ] 节点重新上线（再次发送心跳）后，状态恢复为 `online`

### 1.4 Agent 分配
- [ ] 创建 Agent 任务时，调度器选择一个 `online` 节点分配
- [ ] 所有节点离线时，Agent 任务进入 `pending` 队列
- [ ] 节点上线后，`pending` 队列中的任务被自动分配

---

## 2. Skill 系统测试场景

### 2.1 Skill 加载
- [ ] 后端启动时，从 `KRAKEN_SKILLS_DIR` 加载所有 skill 定义
- [ ] Skill 定义格式错误时，记录警告但不阻止启动
- [ ] GET `/api/v1/skills` 返回所有已加载的 skill 列表

### 2.2 Skill 绑定
- [ ] 将 skill 绑定到指定 Agent，返回绑定确认
- [ ] 绑定不存在的 skill 时，返回 404
- [ ] 同一 Agent 绑定多个 skill，均可独立调用

### 2.3 Skill 查询
- [ ] GET `/api/v1/skills/:id` 返回 skill 详情（名称、版本、参数 schema）
- [ ] 按 tag/capability 过滤 skill 列表
- [ ] Agent 执行时，正确调用已绑定的 skill 并返回结果

---

## 3. Token 追踪测试场景

### 3.1 Token 上报
- [ ] Agent 执行完成后，上报 prompt/completion token 用量
- [ ] 上报数据持久化到存储（重启后仍可查询）
- [ ] 上报格式错误时，返回 422 并记录错误

### 3.2 Token 聚合
- [ ] GET `/api/v1/tokens/usage` 返回指定时间范围的聚合用量
- [ ] 支持按 agent_id、node_id、skill_id 分组聚合
- [ ] 聚合结果与各条上报记录之和一致（数值准确性）

### 3.3 实时推送
- [ ] 通过 WebSocket 连接 `/ws`，订阅 token 用量事件
- [ ] 新 token 上报触发 WebSocket 推送到所有订阅客户端
- [ ] 客户端断线重连后，能收到断线期间的累计数据（或重新全量同步）

---

## 4. Memory 存储测试场景

### 4.1 CRUD 操作
- [ ] POST `/api/v1/memory` 创建 memory 条目，返回 id
- [ ] GET `/api/v1/memory/:id` 读取指定条目
- [ ] PUT `/api/v1/memory/:id` 更新条目内容，version 递增
- [ ] DELETE `/api/v1/memory/:id` 删除条目，后续 GET 返回 404

### 4.2 Scope 隔离
- [ ] `scope=agent:{id}` 的 memory 仅对该 agent 可见
- [ ] `scope=global` 的 memory 对所有 agent 可见
- [ ] 跨 scope 读取被拒绝时，返回 403

### 4.3 TTL 过期
- [ ] 创建带 `ttl` 字段的 memory 条目
- [ ] TTL 到期后，GET 返回 404（或 410 Gone）
- [ ] TTL 到期前的续期操作（PATCH ttl）成功延长存活时间

---

## 5. 跨节点场景

### 5.1 多节点并行 Agent 执行
- [ ] 同时向两个节点（agent-node-1、agent-node-2）分配不同 Agent 任务
- [ ] 两个任务并行执行，互不阻塞
- [ ] 各节点的执行结果独立上报，后端正确区分来源

### 5.2 调度均衡验证
- [ ] 批量创建 N 个 Agent 任务，验证调度器在两个节点间均匀分配（±1）
- [ ] 一个节点下线后，新任务全部路由到存活节点

### 5.3 记忆共享（global scope）
- [ ] node-1 上的 Agent 写入 `scope=global` memory
- [ ] node-2 上的 Agent 读取该 memory，内容一致
- [ ] 两个节点并发写入同一 global memory key，后写入的版本生效（last-write-wins 或冲突报错）

### 5.4 跨节点 Token 聚合
- [ ] 两个节点分别上报 token 用量
- [ ] 全局聚合 API 返回两节点的合计值
- [ ] WebSocket 实时事件包含 node_id 字段，订阅方可区分来源

---

## 测试环境要求

- Docker Compose 启动：`bash scripts/docker-up.sh`（含 agent-node1 + agent-node2）
- 或 K8s 部署：`bash scripts/k8s-deploy.sh`
- 后端 `/healthz` 就绪后开始执行测试
- 测试用数据库：独立实例，每次测试前清空（或使用事务回滚）
