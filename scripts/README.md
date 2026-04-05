# scripts

## 职责边界

- 承载统一开发入口、验证脚本、mock 服务、迁移辅助工具、发布辅助脚本和 CI 可复用命令。
- 这里是跨目录执行入口的唯一归口；不要把 shell/js/python 启动脚本散落到仓库根目录。
- 业务实现仍应留在 `backend/go` 或 `web`，本目录只负责编排和自动化。

## 责任成员

- 联调脚手架、mock/fixture、部署运行时、迁移工具和统一验证入口相关成员会在这里落代码。

## 依赖方向

- 可以调用 `backend/go`、`web`、`docs` 和 `e2e` 中已存在的实现或配置。
- 会被开发者、本地调试流程和 CI 作为统一入口使用。
- 不应被产品运行时代码反向依赖为核心业务库。

## 启动入口

- 当前已存在 mock 服务入口：`node scripts/mock-server/server.mjs`
- 当前统一迁移 bootstrap 入口：`bash scripts/bootstrap-migration.sh`
- 当前统一 Go toolchain 检测入口：`bash scripts/check-go-toolchain.sh`
- 当前统一开发启动入口：`bash scripts/dev-up.sh`
- 当前统一开发停止入口：`bash scripts/dev-down.sh`
- 当前统一全量验证入口：`bash scripts/verify-all.sh`
- 当前 runtime 专项验证入口：`bash scripts/verify-runtime.sh`
- 当前非 Git 根文件审计入口：`bash scripts/audit-changes.sh --summary`
- 当前非 Git 根人工复核入口：`bash scripts/audit-changes.sh --review`

## Go 环境约束

- 所有仓库级 Go 命令都必须通过 `scripts/lib/go-env.sh` 解析二进制并清理 shell 注入的 `GOROOT`/`GOPATH`/`GOTOOLDIR`。
- 不要再要求调用者手工写 `GOROOT=/... go test`；统一入口应自行消化本机环境漂移。
- `scripts/check-go-toolchain.sh` 是当前唯一的 Go toolchain 检测与报错入口；`scripts/bootstrap-migration.sh --check` 与 `scripts/verify-runtime.sh` 都委托给它。
- Go 环境漂移的事实口径只允许通过 `bash scripts/check-go-toolchain.sh`、`npm run test:go`、`npm run test:go:workspace`、`npm run test:go:projectdata` 这类仓库入口报告；不要把裸 `go test` 重新写回 README、运行手册或 completion report。
- 对持久化专项只允许引用 `cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:projectdata`，不要再附带显式 `GOROOT` 或裸 `go test` 命令作为“等价入口”。

## 审计约束

- open-kraken 不是 Git 根，不能把 `git status` 当作默认变更审计入口。
- 建议先运行 `bash scripts/audit-changes.sh --summary` 获取当前文件清单，再运行 `bash scripts/audit-changes.sh --review` 判断是否需要人工复核。
- `--review` 以 exit code `20` 标记必须人工复核，当前规则覆盖 `.env`、`.DS_Store`、`.idea/*` 与 `.open-kraken-run/backend.log`。
