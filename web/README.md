# web

## 职责边界

- 承载 React 应用壳、路由、状态层、页面功能、API client、样式系统、前端单测以及面向浏览器的交互逻辑。
- 所有前端实现都应落在本目录；不要把页面组件、样式资产或调试脚本散落到仓库根目录。
- 需要的 API 契约应从 `/Users/claire/IdeaProjects/open-kraken/docs` 和 `/Users/claire/IdeaProjects/open-kraken/backend/go` 已固定的契约读取，而不是在根目录临时定义。

## 责任成员

- React 应用壳、聊天 UI、成员协作面板、终端面板、路线图页面、视觉系统、mock 联调与前端测试相关成员会在这里落代码。

## 依赖方向

- 依赖 `/Users/claire/IdeaProjects/open-kraken/docs` 中的文档契约与 `/Users/claire/IdeaProjects/open-kraken/backend/go` 暴露的后端接口语义。
- 可被 `/Users/claire/IdeaProjects/open-kraken/e2e` 与 `/Users/claire/IdeaProjects/open-kraken/scripts` 调用验证或启动。
- 不应反向驱动后端目录结构，也不应把通用运行脚本直接写到本目录外的根层散点文件。

## 启动入口

- 当前已实现验证入口：`cd web && npm test`
- 当前已实现真实页面路由验证入口：`npm run test:web:routes`
- 当前已实现 smoke 入口：`cd web && npm run test:e2e:smoke`
- 当前已实现浏览器自动化占位入口：`npm run test:e2e:browser`
- 预期统一前端开发入口占位：`scripts/dev-up.sh`
- 预期统一前端验证入口占位：`scripts/verify-all.sh`
