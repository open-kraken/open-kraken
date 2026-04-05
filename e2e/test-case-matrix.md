# Open-Kraken T11 测试用例矩阵

> 对齐前端 API 契约（commit 45c4f9c），覆盖 T04-T07 后端接口。
> 状态：待执行（等待 T04-T07 完成解锁）

---

## API 契约覆盖范围

| 接口 | 方法 | T11 覆盖 |
|------|------|---------|
| `/api/v1/nodes` | GET | TC-N01 |
| `/api/v1/nodes/{id}` | GET | TC-N02 |
| `/api/v1/nodes/{id}/agents` | POST | TC-N03 |
| `/api/v1/nodes/{id}/agents` | DELETE | TC-N04 |
| `/api/v1/tokens/stats` | GET | TC-T01 |
| `/api/v1/tokens/activity` | GET | TC-T02 |
| `/api/v1/tokens/events` | POST | TC-T03 |
| `/api/v1/skills` | GET | TC-S01 |
| `/api/v1/members/{id}/skills` | GET | TC-S02 |
| `/api/v1/members/{id}/skills` | PUT | TC-S03 |
| WebSocket `/ws` — `node.snapshot` | SUB | TC-W01 |
| WebSocket `/ws` — `node.updated` | SUB | TC-W02 |
| WebSocket `/ws` — `node.offline` | SUB | TC-W03 |
| WebSocket `/ws` — `token.stats_updated` | SUB | TC-W04 |

---

## 一、Node Registry（GET /api/v1/nodes、GET /api/v1/nodes/{id}）

### TC-N01 GET /api/v1/nodes — 节点列表

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-N01-01 | 无节点时返回空列表 | 数据库清空 | `200 { nodes: [] }` | P1 |
| TC-N01-02 | 返回所有已注册节点 | 已注册 2 个节点 | `200 { nodes: [n1, n2] }`，含 id/status/capabilities | P1 |
| TC-N01-03 | online 节点状态过滤 | 1 online + 1 offline | `?status=online` 仅返回 online 节点 | P2 |
| TC-N01-04 | 响应字段完整性 | 1 个节点在线 | 每个节点含 `id, status, last_seen, capabilities, agent_count` | P1 |

### TC-N02 GET /api/v1/nodes/{id} — 节点详情

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-N02-01 | 获取存在节点详情 | 节点已注册 | `200`，返回完整节点信息 | P1 |
| TC-N02-02 | 节点不存在 | id 未注册 | `404 { error: "node not found" }` | P1 |
| TC-N02-03 | 详情包含 agent 列表 | 节点有 2 个运行中 agent | `agents[]` 字段非空 | P2 |

### TC-N03 POST /api/v1/nodes/{id}/agents — 分配 Agent

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-N03-01 | 向 online 节点分配 agent | 节点 online | `201`，返回 agent_id | P1 |
| TC-N03-02 | 向 offline 节点分配 agent | 节点 offline | `409` 或 `422`，拒绝分配 | P1 |
| TC-N03-03 | 节点不存在时分配 | id 无效 | `404` | P1 |
| TC-N03-04 | 请求体缺少必要字段 | 省略 skill_id | `400 { error: ... }` | P2 |
| TC-N03-05 | 分配后节点 agent_count +1 | 节点原有 0 个 agent | GET /api/v1/nodes/{id} 返回 agent_count=1 | P2 |

### TC-N04 DELETE /api/v1/nodes/{id}/agents — 移除 Agent

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-N04-01 | 移除存在的 agent | 节点有 agent | `200` 或 `204` | P1 |
| TC-N04-02 | 移除不存在的 agent | agent_id 无效 | `404` | P1 |
| TC-N04-03 | 移除后节点 agent_count -1 | 节点有 1 个 agent | 移除后 GET 返回 agent_count=0 | P2 |

---

## 二、Token 追踪（GET /api/v1/tokens/stats、/api/v1/tokens/activity、POST /api/v1/tokens/events）

### TC-T01 GET /api/v1/tokens/stats — Token 统计

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-T01-01 | 无数据时返回零值 | 数据库清空 | `200 { prompt_tokens: 0, completion_tokens: 0, total: 0 }` | P1 |
| TC-T01-02 | 上报后统计正确 | POST 2 条事件 (100+200 tokens) | total=300，分项正确 | P1 |
| TC-T01-03 | 按时间范围过滤 | 有昨天和今天的数据 | `?from=today` 仅返回今天数据 | P2 |
| TC-T01-04 | 按 node_id 聚合 | 两节点各上报 | `?node_id=node-1` 仅返回该节点统计 | P2 |

### TC-T02 GET /api/v1/tokens/activity — Token 活动记录

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-T02-01 | 返回活动记录列表 | 已上报 3 条事件 | `200 { events: [...] }` 含 3 条 | P1 |
| TC-T02-02 | 分页（limit/offset） | 已上报 10 条事件 | `?limit=5` 返回 5 条，含 next cursor | P2 |
| TC-T02-03 | 记录字段完整性 | 1 条事件 | 含 `timestamp, node_id, agent_id, prompt_tokens, completion_tokens` | P1 |
| TC-T02-04 | 按 agent_id 过滤 | 两个 agent 各有记录 | `?agent_id=x` 仅返回该 agent 记录 | P2 |

### TC-T03 POST /api/v1/tokens/events — Token 上报

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-T03-01 | 正常上报 | — | `201`，数据写入存储 | P1 |
| TC-T03-02 | 上报后 stats 更新 | 上报前 total=0 | 上报后 GET /stats total 增加 | P1 |
| TC-T03-03 | 缺少必要字段 | 省略 node_id | `400` | P1 |
| TC-T03-04 | 负数 token 值 | prompt_tokens=-1 | `422` | P2 |
| TC-T03-05 | 重启后数据持久 | 上报后重启后端 | GET /activity 仍可查到数据 | P2 |

---

## 三、Skill 系统（GET /api/v1/skills、GET/PUT /api/v1/members/{id}/skills）

### TC-S01 GET /api/v1/skills — Skill 列表

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-S01-01 | 返回所有 skill | SKILLS_DIR 有 3 个 skill | `200 { skills: [s1,s2,s3] }` | P1 |
| TC-S01-02 | 无 skill 时返回空列表 | SKILLS_DIR 为空 | `200 { skills: [] }` | P1 |
| TC-S01-03 | Skill 字段完整性 | 1 个 skill | 含 `id, name, version, description, parameters_schema` | P1 |

### TC-S02 GET /api/v1/members/{id}/skills — 成员 Skill 查询

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-S02-01 | 获取已绑定 skill 列表 | member 绑定了 2 个 skill | `200 { skills: [s1, s2] }` | P1 |
| TC-S02-02 | 未绑定任何 skill | 新 member | `200 { skills: [] }` | P1 |
| TC-S02-03 | member 不存在 | id 无效 | `404` | P1 |

### TC-S03 PUT /api/v1/members/{id}/skills — 更新成员 Skill 绑定

| ID | 测试用例 | 前置条件 | 期望结果 | 优先级 |
|----|---------|---------|---------|--------|
| TC-S03-01 | 绑定新 skill | member 无 skill | `200`，GET 验证已绑定 | P1 |
| TC-S03-02 | 全量替换绑定列表 | 已绑定 s1，PUT [s2] | 绑定变为仅 s2 | P1 |
| TC-S03-03 | 绑定不存在的 skill | skill_id 无效 | `404` | P1 |
| TC-S03-04 | member 不存在 | id 无效 | `404` | P1 |
| TC-S03-05 | 空数组清空绑定 | 已绑定 2 个 | PUT [] → GET 返回空 | P2 |

---

## 四、WebSocket 事件（/ws）

### TC-W01 node.snapshot — 初始快照

| ID | 测试用例 | 期望结果 | 优先级 |
|----|---------|---------|--------|
| TC-W01-01 | 连接后立即收到 snapshot | `{ type: "node.snapshot", nodes: [...] }` | P1 |
| TC-W01-02 | snapshot 包含所有当前节点 | 已注册 2 节点，snapshot.nodes 长度=2 | P1 |

### TC-W02 node.updated — 节点状态变更推送

| ID | 测试用例 | 期望结果 | 优先级 |
|----|---------|---------|--------|
| TC-W02-01 | 节点心跳更新触发事件 | 收到 `{ type: "node.updated", node: { id, last_seen } }` | P1 |
| TC-W02-02 | Agent 分配触发事件 | POST agent 后收到 node.updated（agent_count 变化） | P2 |

### TC-W03 node.offline — 节点下线推送

| ID | 测试用例 | 期望结果 | 优先级 |
|----|---------|---------|--------|
| TC-W03-01 | 节点超时后触发 offline 事件 | 收到 `{ type: "node.offline", nodeId: "..." }` | P1 |
| TC-W03-02 | 多个订阅客户端均收到 | 2 个 WS 客户端均收到 offline 事件 | P2 |

### TC-W04 token.stats_updated — Token 统计推送

| ID | 测试用例 | 期望结果 | 优先级 |
|----|---------|---------|--------|
| TC-W04-01 | 上报 token 后触发推送 | POST /events 后 WS 收到 `{ type: "token.stats_updated", stats: {...} }` | P1 |
| TC-W04-02 | stats 数值与 REST API 一致 | WS 推送值 = GET /tokens/stats 返回值 | P1 |
| TC-W04-03 | 断线重连后收到最新 stats | 断开重连后立即收到当前统计 | P2 |

---

## 五、跨节点集成场景

| ID | 场景 | 步骤 | 期望结果 | 优先级 |
|----|------|------|---------|--------|
| TC-X01 | 两节点并行 agent 执行 | 同时向 node-1/node-2 POST agent，各执行 | 两任务独立完成，互不阻塞 | P1 |
| TC-X02 | 节点下线触发重路由 | node-1 下线后 POST agent | 任务路由到 node-2 | P1 |
| TC-X03 | 跨节点 token 聚合 | node-1 上报 100，node-2 上报 200 | GET /stats total=300 | P1 |
| TC-X04 | WS 多节点事件区分 | 两节点分别触发 token 上报 | WS 事件含 node_id，可区分来源 | P2 |

---

## 执行顺序建议

```
Phase 1（解锁后立即）：P1 级别，单接口 happy path
  TC-N01 → TC-N02 → TC-T01 → TC-T03 → TC-S01

Phase 2：P1 级别，错误处理 + 边界
  TC-N03 → TC-N04 → TC-T02 → TC-S02 → TC-S03

Phase 3：WebSocket 事件验证
  TC-W01 → TC-W02 → TC-W03 → TC-W04

Phase 4：P2 + 跨节点集成
  TC-X01 → TC-X02 → TC-X03 → TC-X04
```

## 测试环境

- 启动：`bash scripts/docker-up.sh`（含 agent-node1 + agent-node2）
- 后端就绪检查：`curl http://localhost:8080/healthz`
- 每个 Phase 前执行数据库清空（或使用独立测试容器）
