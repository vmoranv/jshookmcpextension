# jshookmcpextension

[English](./README.md) | [Chinese](./README.zh.md)

## Quick Links

[![Register Extension](https://img.shields.io/badge/Register-Extension-2ea44f?style=for-the-badge)](https://github.com/vmoranv/jshookmcpextension/issues/new?template=register-extension.yml)
[![Plugin Index](https://img.shields.io/badge/View-Plugin%20Index-0969da?style=for-the-badge)](https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/plugins.index.json)
[![Workflow Index](https://img.shields.io/badge/View-Workflow%20Index-8250df?style=for-the-badge)](https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/workflows.index.json)

> **Register here**: [Open the `Register Extension` issue template](https://github.com/vmoranv/jshookmcpextension/issues/new?template=register-extension.yml)

Registry-only repository for extension pointers used by `vmoranv/jshookmcp`.

This repository does **not** store plugin or workflow source code. It only maintains Git pointers and metadata snapshots for extension repositories so that `jshookmcp` can fetch them by reference.

## Directory Layout

- `registry/plugins.index.json`: plugin pointer index
- `registry/workflows.index.json`: workflow pointer index
- `scripts/`: index sync and validation scripts
- `.github/ISSUE_TEMPLATE/`: issue templates
- `.github/workflows/auto-register-extension.yml`: automated sync workflow

## How to Register an Extension

Submit extension repository information through a GitHub Issue:

1. Create an issue with the `Register Extension` template
2. Fill in only the required fields: `Kind` and `Repository URL`
3. Keep the `register-extension` label on the issue (the template adds it by default)
4. Close the issue after manual review is approved

If review rejects the registration, close it as `not planned` instead. `not planned` issues are excluded from synchronization.

Only closed issues with the `register-extension` label are candidates for synchronization. Issues closed as `not planned` are excluded.

## Registration Examples

**Plugin example**

- Kind: `plugin`
- Repository URL: `https://github.com/example/jshook_plugin_demo`
- Title: `[register] plugin: https://github.com/example/jshook_plugin_demo`

**Workflow example**

- Kind: `workflow`
- Repository URL: `https://github.com/example/jshook_workflow_demo`
- Title: `[register] workflow: https://github.com/example/jshook_workflow_demo`

**Requirements**

- The repository should be publicly accessible
- Keep the `register-extension` label on the issue
- Close the issue after approval so the sync Action can process it

## Automatic Sync

GitHub Actions runs the sync process at the following times:

- On `issues.closed` when the issue has the `register-extension` label
- On manual `workflow_dispatch`
- Daily at `06:00` Beijing time (`22:00` UTC)

Sync flow:

1. Scan all closed issues with the `register-extension` label
2. Exclude issues closed as `not planned`
3. Parse and validate extension pointers from the issue body
4. Fetch the extension repository, read `meta.yaml`, and resolve the current commit
5. Compare against the existing registry entries and apply additions, updates, or removals
6. Update `registry/*.index.json` and commit the result directly to `master`

Notes:

- Open issues are treated as pending review and are not synchronized
- Issues closed as `not planned` are excluded from synchronization; if they match an existing pointer, the next sync removes that pointer
- Existing historical registry entries are not removed only because their issue is missing
- Pointers are cleaned up only when the remote repository becomes inaccessible or the entry file is invalid

## How `jshookmcp` Fetches Extensions

`jshookmcp` can browse and fetch plugins/workflows with the following process:

1. Fetch the indexes:

```bash
curl -L https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/plugins.index.json
curl -L https://raw.githubusercontent.com/vmoranv/jshookmcpextension/master/registry/workflows.index.json
```

2. Select an entry by `slug` or `id`, then read:

- `source.repo`
- `source.commit` (pinning a commit is preferred for reproducibility)
- `source.subpath`
- `source.entry`

3. Fetch the extension repository and read the entry files, for example:

```bash
git clone https://github.com/vmoranv/jshook_plugin_ida_bridge tmp_ext
git -C tmp_ext checkout 20da9249d8eeb82a658c66817c7e2bf966bad95b
cat tmp_ext/manifest.ts
cat tmp_ext/meta.yaml
```

4. For plugins, read `manifest.ts`; for workflows, read `workflow.ts`; combine that with `meta.yaml` to present metadata.

## Local Validation

```bash
node scripts/validate-index.mjs
```
