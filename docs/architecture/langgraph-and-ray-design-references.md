# LangGraph and Ray: design references (external sources)

This document summarizes public design narratives for **LangGraph** and **Ray** so open-kraken can align terminology and tradeoffs for **multi-agent orchestration, long-running execution, and cross-node work**. **It is not a technology commitment:** the authoritative implementation remains `backend/go` and contracts under `docs/`.

---

## 1. LangGraph (agent runtime)

**Primary source:** LangChain team post *[Building LangGraph: Designing an Agent Runtime from first principles](https://blog.langchain.com/building-langgraph/)* (Nuno Campos).

### 1.1 Problem framing: how agents differ from traditional backends

The post summarizes how LLM agents differ from traditional software and derives production-oriented capabilities:

| Dimension | Summary |
|-----------|---------|
| **Latency** | Shifts from millisecond APIs to second–minute–hour runs; **parallelism** (without data races) and **streaming** (perceived latency) matter. |
| **Reliability** | Long tasks fail expensively; blind full retries are costly; **task queues** (decouple trigger from execution) and **checkpointing** (resume from intermediate state) matter. |
| **Non-determinism** | **Human-in-the-loop** (interrupt/resume/approval) and **tracing** (observable trajectories) matter. |

The post’s shortlist for production agents maps to **parallelization, streaming, task queues, checkpointing, human-in-the-loop, tracing**; very short, tool-free, single-prompt agents may not need a full framework.

### 1.2 Why not a DAG, and not the same as classic durable execution

- **DAG-style workflow frameworks:** agent graphs are often **cyclic**, which conflicts with acyclic DAG assumptions.  
- **Classic durable execution engines** (Temporal-style families): for LLM agents, the post cites gaps such as **streaming**, **extra latency between steps**, and **performance degradation as history grows**, which may not match conversational or long-chain agents.

LangGraph is positioned as a **low-level, controllable, durable** runtime direction for that era.

### 1.3 Design philosophy (summary)

- **Few assumptions; control and durability:** minimize baked-in assumptions about future LLM shapes; focus on “slow, failure-prone, open-ended I/O.”  
- **Feels like writing code:** public APIs stay close to framework-free code; **runtime is decoupled from SDKs** (runtime *PregelLoop* vs SDKs such as StateGraph / imperative APIs, each evolving independently).  
- **Composable building blocks:** e.g. human-in-the-loop via `interrupt()` when needed, not forced high-level abstractions.

### 1.4 Execution model: structured steps + BSP/Pregel-style execution

**Structured agents** (discrete steps/nodes) are treated as prerequisites for checkpointing and human-in-the-loop; execution uses **BSP / Pregel**-style ideas and **deterministic concurrency** (avoid races that make outputs irreproducible):

- **Channels** hold versioned state; **nodes** subscribe and run when channels change.  
- Each iteration: select nodes → **run in parallel with isolated state copies** → **merge writes in deterministic order** back to channels.  
- **Checkpointing:** serialize channel values and versions for resume across machines and long idle periods.  
- **Streaming:** collect intermediate output inside nodes and at step boundaries; multiple stream modes exist (e.g. values, updates, messages, checkpoints—see official docs).

**Further reading:** [LangGraph documentation](https://langchain-ai.github.io/langgraph/) (as linked from the post).

---

## 2. Ray (distributed computing core)

**Primary source:** Ray documentation *[Key Concepts](https://docs.ray.io/en/latest/ray-core/key-concepts.html)*.

### 2.1 Core primitives

| Primitive | Intent |
|-----------|--------|
| **Tasks** | Stateless remote functions; **async** execution on workers; CPU/GPU/custom resources; cluster scheduler placement. |
| **Actors** | Extend from functions to **classes**: stateful workers (services); methods run on a **dedicated worker** with mutable state; resource requirements supported. |
| **Objects** | Tasks and actors produce **remote objects**; referenced by **object refs**; cached in a distributed **shared-memory object store** (typically one per node). |
| **Placement groups** | **Atomic multi-node resource reservations**; PACK vs SPREAD strategies for locality or gang-scheduling. |
| **Environment dependencies** | Remote machines need consistent deps; cluster prep or **runtime environments** apply. |

### 2.2 Design tradeoffs (common summary)

Ray targets **general distributed and ML workloads**, emphasizing **fine-grained scheduling** and **memory/data locality**; versus “persist everything to disk,” it often accepts **recomputation** to improve latency and throughput (see official architecture material for details). If open-kraken adopts similar ideas, **control-plane durability, audit ledger, and RPO** must be defined explicitly; **do not** assume Ray’s defaults satisfy product constraints.

**Further reading:** [Ray Core — Tasks](https://docs.ray.io/en/latest/ray-core/tasks.html), [Actors](https://docs.ray.io/en/latest/ray-core/actors.html), [Objects](https://docs.ray.io/en/latest/ray-core/objects.html).

---

## 3. Conceptual alignment with open-kraken (not an implementation)

| Topic | LangGraph | Ray | open-kraken mainline |
|-------|-----------|-----|----------------------|
| **Long runs & recovery** | Checkpoints, thread-level resume narrative | Recomputation on failure; actor state needs explicit design | Ledger, memory, node registry; **queued long tasks and recoverable execution** still evolving (`action-items-and-current-state.md`) |
| **Parallelism & determinism** | Deterministic merge order for parallel nodes | Task/actor scheduling and locality | Cross-node scheduling must stay **observable and auditable** |
| **Where state lives** | Channels/reducers made explicit | Actor-local vs remote objects | **Nodes, members, skill bindings** held by backend contracts |
| **Queues** | Post ties general task queues to LangGraph Platform, etc. | Cluster queues and reservations | Product vision **queues, retries, migration** should align with ops docs |

---

## 4. References and links

1. LangChain, *Building LangGraph: Designing an Agent Runtime from first principles*, <https://blog.langchain.com/building-langgraph/>  
2. Ray Project, *Key Concepts*, <https://docs.ray.io/en/latest/ray-core/key-concepts.html>  
3. Ray Project, *Tasks*, <https://docs.ray.io/en/latest/ray-core/tasks.html>  
4. Ray Project, *Actors*, <https://docs.ray.io/en/latest/ray-core/actors.html>  
5. Ray Project, *Objects*, <https://docs.ray.io/en/latest/ray-core/objects.html>  

If LangGraph’s official doc site moves, follow the current LangChain / LangGraph main site.

---

## 5. Revision note

- Initial version: design summaries from the sources above; **does not** list LangGraph or Ray as repository dependencies or default stacks.
