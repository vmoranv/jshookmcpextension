# jshookmcpextension

[英文](./README.md) | [中文](./README.zh.md)

## 快捷入口

[![注册扩展](https://img.shields.io/badge/%E6%B3%A8%E5%86%8C-%E6%89%A9%E5%B1%95-2ea44f?style=for-the-badge)](https://github.com/vmoranv/jshookmcpextension/issues/new?template=register-extension.zh.yml)
[![插件索引](https://img.shields.io/badge/%E6%9F%A5%E7%9C%8B-%E6%8F%92%E4%BB%B6%E7%B4%A2%E5%BC%95-0969da?style=for-the-badge)](https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/plugins.index.json)
[![工作流索引](https://img.shields.io/badge/%E6%9F%A5%E7%9C%8B-%E5%B7%A5%E4%BD%9C%E6%B5%81%E7%B4%A2%E5%BC%95-8250df?style=for-the-badge)](https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/workflows.index.json)

> **点这里注册**：[打开“注册扩展”Issue 模板](https://github.com/vmoranv/jshookmcpextension/issues/new?template=register-extension.zh.yml)

`vmoranv/jshookmcp` 的扩展指针注册仓库（registry-only）。

本仓库不存放插件或工作流源码，只维护扩展仓库的 Git 指针与元信息快照，供 `jshookmcp` 按指针拉取。

## 目录说明

- `registry/plugins.index.json`：插件指针索引
- `registry/workflows.index.json`：工作流指针索引
- `scripts/`：索引同步与校验脚本
- `.github/ISSUE_TEMPLATE/`：Issue 模板目录
- `.github/workflows/auto-register-extension.yml`：自动同步流程

## 如何注册扩展

通过 GitHub Issue 提交扩展仓库信息：

1. 使用 `注册扩展` 模板创建 issue
2. 只填写必填项：`Kind` 和 `Repository URL`
3. 保留 `register-extension` 标签（模板会默认附带）
4. 人工审查通过后关闭 issue

只有关闭后的 issue 会进入同步。

## 注册示例

**插件示例**

- 类型：`plugin`
- 仓库地址：`https://github.com/example/jshook_plugin_demo`
- 标题：`[register] plugin: https://github.com/example/jshook_plugin_demo`

**工作流示例**

- 类型：`workflow`
- 仓库地址：`https://github.com/example/jshook_workflow_demo`
- 标题：`[register] workflow: https://github.com/example/jshook_workflow_demo`

**要求**

- 仓库应可公开访问
- 保留 `register-extension` 标签
- 审查通过后关闭 issue，Action 才会同步

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

`jshookmcp` 本体可按以下流程浏览并拉取插件或工作流：

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
