# docs

## 职责边界

- 承载迁移设计、模块映射、契约说明、运行手册、风险清单、验收矩阵与发布说明。
- 文档是跨成员协作的事实来源，但不是源码落点；不要把实现代码或临时脚本堆到这里。
- 需要保留的旧 Golutra 信息应以迁移后的文档形式沉淀在本目录，而不是继续写回旧仓库。

## 责任成员

- 架构盘点、API/realtime 契约、鉴权模型、部署方案、数据迁移、生产可用性、测试矩阵与迁移说明相关成员会在这里落文档。

## 依赖方向

- 可以引用 `backend/go`、`web`、`scripts`、`e2e` 的事实状态作为说明依据。
- 会被 `web`、`backend/go`、`scripts` 和协作成员作为契约输入读取。
- 不应成为运行时代码依赖，也不应反向承载实现层的临时补丁。

## 启动入口

- 当前文档检索入口：`rg -n "migration|contract|auth|mock" docs`
- 生产可用性入口：`/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/README.md`
- 当前仓库级生产可用性验证入口：`npm run verify:migration`、`bash scripts/verify-runtime.sh`、`curl -i http://127.0.0.1:8080/healthz`
- 预期统一文档校验占位：`scripts/verify-all.sh`
- 预期迁移总览入口：`/Users/claire/IdeaProjects/open-kraken/README.md`
