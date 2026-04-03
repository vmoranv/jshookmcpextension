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

function extractMarkdownSection(body, label) {
  const re = new RegExp(
    `#{2,6}\\s+${escapeRegExp(label)}\\s*\\r?\\n(?:\\r?\\n)?([\\s\\S]*?)(?=\\r?\\n#{2,6}\\s+|$)`,
    'i',
  );
  const match = body.match(re);
  return (match?.[1] ?? '').trim();
}

function extractSimpleField(body, label) {
  const re = new RegExp(
    `(?:^|\\r?\\n)\\s*${escapeRegExp(label)}\\s*\\r?\\n\\s*([^\\r\\n]+)`,
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

function extractValue(body, label) {
  return (
    firstLine(extractMarkdownSection(body, label)) ||
    firstLine(extractSimpleField(body, label))
  );
}

function parseRepoUrl(repo) {
  const match = String(repo).trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

function deriveSlug(kind, repoName) {
  let slug = String(repoName).trim().toLowerCase();
  slug = slug.replace(/^jshook_plugin_/, '');
  slug = slug.replace(/^jshook_workflow_/, '');
  slug = slug.replace(/^jshook-plugin-/, '');
  slug = slug.replace(/^jshook-workflow-/, '');
  slug = slug.replace(/_/g, '-');
  if (kind === 'plugin') slug = slug.replace(/^plugin-/, '');
  if (kind === 'workflow') slug = slug.replace(/^workflow-/, '');
  return slug;
}

function parseIssue(issue) {
  const body = String(issue?.body ?? '');
  const kind = extractValue(body, 'Kind').toLowerCase();
  const repo = extractValue(body, 'Repository URL');
  const parsedRepo = parseRepoUrl(repo);
  const slug = extractValue(body, 'Slug') || (parsedRepo ? deriveSlug(kind, parsedRepo.name) : '');
  const id =
    extractValue(body, 'Extension ID') ||
    (parsedRepo
      ? (kind === 'workflow'
          ? `workflow.${slug}.v1`
          : `io.github.${parsedRepo.owner.toLowerCase()}.${slug}`)
      : '');
  const ref = extractValue(body, 'Git Ref') || 'main';
  const subpath = extractValue(body, 'Subpath') || '.';
  const entryRaw = extractValue(body, 'Entry File');
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

function issueLabels(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => {
          if (typeof label === 'string') return label;
          return label?.name;
        })
        .filter(Boolean)
        .map((label) => String(label).trim().toLowerCase())
    : [];
}

function isNotPlannedIssue(issue) {
  const reason = String(issue?.state_reason ?? issue?.stateReason ?? '')
    .trim()
    .toLowerCase();
  if (reason === 'not_planned' || reason === 'not planned') {
    return true;
  }
  const labels = issueLabels(issue);
  return labels.includes('not planned') || labels.includes('not-planned');
}

function issueTime(issue) {
  const value = issue?.closed_at || issue?.updated_at || issue?.created_at || '';
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function compareIssuesAscending(left, right) {
  const byTime = issueTime(left) - issueTime(right);
  if (byTime !== 0) return byTime;
  return Number(left?.number ?? 0) - Number(right?.number ?? 0);
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
    // Use gh CLI for authentication (works in GitHub Actions with built-in auth)
    // Extract owner/repo from URL like https://github.com/owner/repo
    const match = item.source.repo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (!match) {
      throw new Error('Invalid GitHub repo URL: ' + item.source.repo);
    }
    const repoRef = `${match[1]}/${match[2]}`;

    // Clone using gh CLI (automatically uses GH_TOKEN for auth)
    run('gh', ['repo', 'clone', repoRef, dir, '--', '--depth', '1']);

    // Checkout the specific ref
    run('git', ['-C', dir, 'fetch', 'origin', item.source.ref]);
    run('git', ['-C', dir, 'checkout', item.source.ref]);

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

    const result = {
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
    };
    if (meta !== null) {
      result.meta = meta;
    }
    return result;
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

  const previousList = Array.isArray(current[key]) ? current[key] : [];
  const listChanged = JSON.stringify(previousList) !== JSON.stringify(sorted);
  if (!listChanged) {
    return false;
  }

  const next = {
    ...current,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    [key]: sorted,
  };

  saveJson(filePath, next);
  return true;
}

const issuesFile = arg('issues-file') ?? '_closed_issues.json';
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

const ignored = [];
for (const issue of [...issues].sort(compareIssuesAscending)) {
  if (isNotPlannedIssue(issue)) {
    try {
      const parsed = parseIssue(issue);
      const key = keyOf(parsed.kind, parsed.slug);
      merged.delete(key);
      ignored.push({ number: issue.number, key, reason: 'not_planned' });
    } catch {
      ignored.push({ number: issue?.number, reason: 'not_planned_unparsed' });
    }
    continue;
  }
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

if (ignored.length > 0) {
  console.log(`[sync-index-from-issues] ignored not-planned issues: ${JSON.stringify(ignored)}`);
}

if (!pluginsChanged && !workflowsChanged) {
  console.log('[sync-index-from-issues] no changes');
} else {
  console.log(
    `[sync-index-from-issues] updated plugins=${pluginsChanged} workflows=${workflowsChanged}`,
  );
}
