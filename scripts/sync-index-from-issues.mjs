import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(body, label) {
  const re = new RegExp(
    `###\\s+${escapeRegExp(label)}\\s*\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n###\\s+|$)`,
    'i',
  );
  const match = body.match(re);
  return (match?.[1] ?? '').trim();
}

function firstLine(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
}

function parseIssue(issue) {
  const body = String(issue?.body ?? '');
  const kind = firstLine(extractSection(body, 'Kind')).toLowerCase();
  const slug = firstLine(extractSection(body, 'Slug'));
  const id = firstLine(extractSection(body, 'Extension ID'));
  const repo = firstLine(extractSection(body, 'Repository URL'));
  const ref = firstLine(extractSection(body, 'Git Ref')) || 'main';
  const subpath = firstLine(extractSection(body, 'Subpath')) || '.';
  const entryRaw = firstLine(extractSection(body, 'Entry File'));
  const entry = entryRaw || (kind === 'workflow' ? 'workflow.ts' : 'manifest.ts');

  const missing = [];
  if (!kind) missing.push('kind');
  if (!slug) missing.push('slug');
  if (!id) missing.push('id');
  if (!repo) missing.push('repo');

  if (missing.length > 0) {
    throw new Error(`Issue #${issue.number} missing fields: ${missing.join(', ')}`);
  }
  if (!['plugin', 'workflow'].includes(kind)) {
    throw new Error(`Issue #${issue.number} has invalid kind: ${kind}`);
  }

  return {
    kind,
    slug,
    id,
    source: {
      type: 'git',
      repo,
      ref,
      subpath,
      entry,
    },
    fromIssue: true,
    issueNumber: issue.number,
  };
}

function parseMetaYaml(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  const meta = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return meta;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function keyOf(kind, slug) {
  return `${kind}:${slug}`;
}

function normalizeCurrent(kind, item) {
  return {
    kind,
    slug: item.slug,
    id: item.id,
    source: {
      type: 'git',
      repo: item?.source?.repo,
      ref: item?.source?.ref || 'main',
      subpath: item?.source?.subpath || '.',
      entry: item?.source?.entry || (kind === 'workflow' ? 'workflow.ts' : 'manifest.ts'),
    },
    fromIssue: false,
  };
}

function resolveFromRepo(item) {
  const dir = mkdtempSync(join(tmpdir(), 'jshook-registry-sync-'));
  try {
    try {
      run('git', ['clone', '--depth', '1', '--branch', item.source.ref, item.source.repo, dir]);
    } catch {
      run('git', ['clone', item.source.repo, dir]);
      run('git', ['-C', dir, 'checkout', item.source.ref]);
    }

    const commit = run('git', ['-C', dir, 'rev-parse', 'HEAD']);
    const entryPath = resolve(dir, item.source.subpath, item.source.entry);
    if (!existsSync(entryPath)) {
      const issueHint = item.issueNumber ? `Issue #${item.issueNumber} ` : '';
      throw new Error(
        `${issueHint}entry not found: ${item.source.subpath}/${item.source.entry} @ ${item.source.repo}#${item.source.ref}`,
      );
    }

    const metaPath = resolve(dir, item.source.subpath, 'meta.yaml');
    const meta = parseMetaYaml(metaPath);

    return {
      kind: item.kind,
      slug: item.slug,
      id: item.id,
      source: {
        type: 'git',
        repo: item.source.repo,
        ref: item.source.ref,
        commit,
        subpath: item.source.subpath,
        entry: item.source.entry,
      },
      meta,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function syncOne(filePath, key, nextList) {
  const current = loadJson(filePath);
  const sorted = [...nextList].sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

  const seenSlug = new Set();
  const seenId = new Set();
  for (const item of sorted) {
    if (seenSlug.has(item.slug)) throw new Error(`Duplicate ${key} slug: ${item.slug}`);
    if (seenId.has(item.id)) throw new Error(`Duplicate ${key} id: ${item.id}`);
    seenSlug.add(item.slug);
    seenId.add(item.id);
  }

  const next = {
    ...current,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    [key]: sorted,
  };

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  if (changed) saveJson(filePath, next);
  return changed;
}

const issuesFile = arg('issues-file') ?? '_open_issues.json';
const issues = loadJson(issuesFile);
if (!Array.isArray(issues)) {
  throw new Error('issues-file must contain a JSON array');
}

const pluginIndex = loadJson('registry/plugins.index.json');
const workflowIndex = loadJson('registry/workflows.index.json');

const merged = new Map();
for (const item of pluginIndex.plugins ?? []) {
  const normalized = normalizeCurrent('plugin', item);
  merged.set(keyOf(normalized.kind, normalized.slug), normalized);
}
for (const item of workflowIndex.workflows ?? []) {
  const normalized = normalizeCurrent('workflow', item);
  merged.set(keyOf(normalized.kind, normalized.slug), normalized);
}

for (const issue of issues) {
  const parsed = parseIssue(issue);
  merged.set(keyOf(parsed.kind, parsed.slug), parsed);
}

const resolved = [];
const removed = [];
for (const item of merged.values()) {
  try {
    resolved.push(resolveFromRepo(item));
  } catch (error) {
    if (item.fromIssue) {
      throw error;
    }
    removed.push({ kind: item.kind, slug: item.slug, reason: String(error) });
  }
}

const plugins = resolved.filter((item) => item.kind === 'plugin').map(({ kind, ...rest }) => rest);
const workflows = resolved.filter((item) => item.kind === 'workflow').map(({ kind, ...rest }) => rest);

const pluginsChanged = syncOne('registry/plugins.index.json', 'plugins', plugins);
const workflowsChanged = syncOne('registry/workflows.index.json', 'workflows', workflows);

if (removed.length > 0) {
  console.log(`[sync-index-from-issues] removed stale pointers: ${JSON.stringify(removed)}`);
}

if (!pluginsChanged && !workflowsChanged) {
  console.log('[sync-index-from-issues] no changes');
} else {
  console.log(
    `[sync-index-from-issues] updated plugins=${pluginsChanged} workflows=${workflowsChanged}`,
  );
}
