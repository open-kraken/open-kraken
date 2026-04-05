# e2e

## 职责边界

- 承载跨后端与前端的 smoke、integration-like browser flow、回归验收用例与共享端到端测试资产。
- 所有端到端验收脚本都应落在本目录，避免把场景脚本散落到 `web`、根目录或临时文件夹。
- e2e 用例验证系统协同效果，不承担领域实现本体。

## 责任成员

- Web 单测与 e2e smoke、前后端联调脚手架、生产可用性回归清单相关成员会在这里扩展用例与验收脚本。

## 依赖方向

- 依赖 `web`、`backend/go` 和 `scripts` 暴露出的可执行入口或 mock 环境。
- 可读取 `docs` 中的验收矩阵和契约要求作为断言来源。
- 不应被运行时代码依赖，也不应定义新的业务契约来反向约束源码实现。

## 启动入口

- 当前已实现 smoke 入口：`cd web && npm run test:e2e:smoke`
- 当前已实现浏览器自动化占位入口：`npm run test:e2e:browser`
- 当前示例用例位置：`/Users/claire/IdeaProjects/open-kraken/e2e/smoke`
- 当前浏览器自动化占位位置：`/Users/claire/IdeaProjects/open-kraken/e2e/browser`
- 预期统一端到端验证占位：`scripts/verify-all.sh`
