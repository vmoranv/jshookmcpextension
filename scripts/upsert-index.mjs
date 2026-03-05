import { readFileSync, writeFileSync } from 'node:fs';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const kind = arg('kind');
const slug = arg('slug');
const id = arg('id');
const repo = arg('repo');
const ref = arg('ref') ?? 'main';
const commit = arg('commit');
const subpath = arg('subpath') ?? '.';
const entry = arg('entry');

if (!kind || !['plugin', 'workflow'].includes(kind)) {
  throw new Error('kind must be plugin or workflow');
}
if (!slug || !id || !repo || !commit || !entry) {
  throw new Error('required args: slug, id, repo, commit, entry');
}

const file = kind === 'plugin' ? 'registry/plugins.index.json' : 'registry/workflows.index.json';
const key = kind === 'plugin' ? 'plugins' : 'workflows';

const parsed = JSON.parse(readFileSync(file, 'utf8'));
const list = Array.isArray(parsed[key]) ? parsed[key] : [];

const next = {
  slug,
  id,
  source: {
    type: 'git',
    repo,
    ref,
    commit,
    subpath,
    entry,
  },
};

const idx = list.findIndex((item) => item?.slug === slug || item?.id === id);
if (idx >= 0) {
  list[idx] = next;
} else {
  list.push(next);
}

list.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
parsed[key] = list;
parsed.updatedAt = new Date().toISOString();

writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
console.log(`[upsert-index] updated ${file} for ${kind}:${slug}`);
