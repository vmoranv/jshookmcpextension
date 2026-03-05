# jshookmcpextension

`vmoranv/jshookmcp` 的扩展指针注册仓库（registry-only）。

本仓库不存放插件或工作流源码，只维护扩展仓库的 Git 指针与元信息快照，供 `jshookmcp` 侧按指针拉取。

## 目录说明

- `registry/plugins.index.json`：插件指针索引
- `registry/workflows.index.json`：工作流指针索引
- `scripts/`：索引同步与校验脚本
- `.github/ISSUE_TEMPLATE/register-extension.yml`：扩展注册模板
- `.github/workflows/auto-register-extension.yml`：自动同步流程

## 注册方式

通过仓库 Issue 提交扩展仓库信息：

1. 使用 `Register Extension` 模板创建 issue
2. 必填仅 `Kind` 与 `Repository URL`
3. 给 issue 打上 `register-extension` 标签（模板会默认附带）
4. 人工审查通过后关闭 issue（只有关闭后的 issue 会进入同步）

## 自动同步机制

GitHub Actions 会在以下时机执行同步：

- `issues.closed` 事件（且 issue 带 `register-extension` 标签）
- `workflow_dispatch` 手动触发
- 每天北京时间 `06:00` 定时任务（UTC `22:00`）

同步逻辑：

1. 扫描所有已关闭且带 `register-extension` 标签的 issue
2. 解析并校验 issue 中的扩展指针
3. 拉取对应扩展仓库，读取 `meta.yaml`，解析当前 commit
4. 对比 registry 中现有条目，自动处理增删改
5. 更新 `registry/*.index.json` 并直接提交到 `master`

说明：

- 未关闭的 issue 仅作为待审状态，不会参与 Action 同步
- 已在 registry 的历史条目，即使没有对应 issue，也不会仅因“缺 issue”被删除
- 仅在远端仓库不可访问或入口文件失效时，脚本才会清理失效指针

## jshookmcp 拉取方式

`jshookmcp` 本体可按以下流程浏览并拉取插件/工作流：

1. 拉取索引：

```bash
curl -L https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/plugins.index.json
curl -L https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/workflows.index.json
```

2. 通过 `slug` 或 `id` 选中条目，读取：

- `source.repo`
- `source.commit`（优先固定 commit，保证可复现）
- `source.subpath`
- `source.entry`

3. 从扩展仓库拉取并读取入口文件（示例）：

```bash
git clone https://github.com/vmoranv/jshook_plugin_ida_bridge tmp_ext
git -C tmp_ext checkout 20da9249d8eeb82a658c66817c7e2bf966bad95b
cat tmp_ext/manifest.ts
cat tmp_ext/meta.yaml
```

4. 插件读取 `manifest.ts`，工作流读取 `workflow.ts`，并结合 `meta.yaml` 展示元信息。

## 本地校验

```bash
node scripts/validate-index.mjs
```
