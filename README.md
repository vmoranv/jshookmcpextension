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
2. 填写 `kind`、`slug`、`id`、`repo`、`ref`、`subpath`、`entry`
3. 给 issue 打上 `register-extension` 标签（模板会默认附带）

## 自动同步机制

GitHub Actions 会在以下时机执行同步：

- `issues` 事件（新建、编辑、重开、关闭、加/去标签）
- `workflow_dispatch` 手动触发
- 每天北京时间 `06:00` 定时任务（UTC `22:00`）

同步逻辑：

1. 扫描所有打开且带 `register-extension` 标签的 issue
2. 解析并校验 issue 中的扩展指针
3. 拉取对应扩展仓库，读取 `meta.yaml`，解析当前 commit
4. 对比 registry 中现有条目，自动处理增删改
5. 更新 `registry/*.index.json` 并自动发起 PR

## 本地校验

```bash
node scripts/validate-index.mjs
```
