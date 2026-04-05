# backend/go

## 职责边界

- 承载 Go 后端代码：领域模型、鉴权、HTTP/WebSocket API、realtime 事件、terminal orchestration、持久化接口与后台服务测试。
- 这里是后端实现唯一落点；不要把后端源码、协议草案或临时服务代码散落到仓库根目录。
- 共享后端测试夹具可放在 `/Users/claire/IdeaProjects/open-kraken/backend/tests`，但运行时实现保持在本目录下。

## 责任成员

- Go 后端相关成员会在这里落代码，包括领域模型、实时契约、终端编排、持久化、鉴权、HTTP/WebSocket API 与 Go 测试矩阵。

## 依赖方向

- 可以依赖本目录内模块与 `/Users/claire/IdeaProjects/open-kraken/backend/tests` 中的测试夹具。
- 可以被 `/Users/claire/IdeaProjects/open-kraken/web`、`/Users/claire/IdeaProjects/open-kraken/docs`、`/Users/claire/IdeaProjects/open-kraken/e2e` 和 `/Users/claire/IdeaProjects/open-kraken/scripts` 引用。
- 不应依赖 `web` 的实现细节，也不应把脚本逻辑直接塞进后端包。

## 启动入口

- 当前 Go workspace 入口：`/Users/claire/IdeaProjects/open-kraken/go.work`
- 当前 Go toolchain 检测入口：`bash ./scripts/check-go-toolchain.sh`
- 当前模块入口：`bash ./scripts/verify-go-tests.sh workspace`
- 预期统一服务启动占位：`scripts/dev-up.sh`
- 预期后端专项验证占位：`scripts/verify-all.sh`

## 当前持久化基线

- 领域仓储当前默认落到 `workspace/.open-kraken/domain` 下的 JSON 文档，由 `internal/domain/repository.FileStore` 提供最小可运行实现。
- 最小查询维度固定为 `workspaceId` 与 `conversationId`，避免服务层直接依赖文件路径。
- 后续若切换到 SQLite/Postgres，只替换 `internal/domain/repository` 的实现，不改调用方接口与测试入口。
- 团队统一检测入口使用仓库根脚本：`bash ./scripts/check-go-toolchain.sh`。它会打印继承环境与仓库实际采用的 Go binary/GOROOT/GOVERSION，并在解析失败时给出稳定退出码。
- 团队统一验证入口使用仓库根脚本：`bash ./scripts/verify-go-tests.sh workspace`。脚本会自动解析并使用仓库级 Go toolchain，避免手工导出环境变量。
- 领域主链路唯一验证入口是 `npm run test:go:domain`。它同时覆盖 `internal/domain/...` 与 `tests/contract/...`，用于冻结 repository 落地边界、message 状态枚举与跨层契约。
- roadmap/project-data 并发基线仍是单写进程；唯一专项验证命令是 `npm run test:go:projectdata`。
- 该专项入口的统一口径是：pass=`0`，blocked=`61`，fail=`60`，若显式声明 `OPEN_KRAKEN_PROJECTDATA_WRITER_MODE=multi` 则以 preflight `10` 拒绝未支持拓扑，避免把 optimistic version check 误当成跨进程锁。
