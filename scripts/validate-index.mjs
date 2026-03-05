import { readFileSync } from 'node:fs';

const FILES = [
  { path: 'registry/plugins.index.json', key: 'plugins' },
  { path: 'registry/workflows.index.json', key: 'workflows' },
];

const COMMIT_RE = /^[0-9a-f]{40}$/;
const URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function fail(message) {
  console.error(`[validate-index] ${message}`);
  process.exitCode = 1;
}

for (const file of FILES) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file.path, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (parsed.schemaVersion !== 1) {
    fail(`${file.path}: schemaVersion must be 1`);
  }

  if (!Array.isArray(parsed[file.key])) {
    fail(`${file.path}: ${file.key} must be an array`);
    continue;
  }

  const bySlug = new Set();
  const byId = new Set();

  for (const item of parsed[file.key]) {
    const slug = item?.slug;
    const id = item?.id;
    const source = item?.source;

    if (typeof slug !== 'string' || slug.length === 0) {
      fail(`${file.path}: invalid slug`);
      continue;
    }
    if (typeof id !== 'string' || id.length === 0) {
      fail(`${file.path}: invalid id for slug ${slug}`);
      continue;
    }

    if (bySlug.has(slug)) fail(`${file.path}: duplicate slug ${slug}`);
    if (byId.has(id)) fail(`${file.path}: duplicate id ${id}`);
    bySlug.add(slug);
    byId.add(id);

    if (!source || source.type !== 'git') {
      fail(`${file.path}: source.type must be git for ${slug}`);
      continue;
    }

    if (typeof source.repo !== 'string' || !URL_RE.test(source.repo)) {
      fail(`${file.path}: invalid GitHub repo URL for ${slug}`);
    }
    if (typeof source.ref !== 'string' || source.ref.length === 0) {
      fail(`${file.path}: invalid ref for ${slug}`);
    }
    if (typeof source.commit !== 'string' || !COMMIT_RE.test(source.commit)) {
      fail(`${file.path}: invalid commit for ${slug}`);
    }
    if (typeof source.subpath !== 'string' || source.subpath.length === 0) {
      fail(`${file.path}: invalid subpath for ${slug}`);
    }
    if (typeof source.entry !== 'string' || source.entry.length === 0) {
      fail(`${file.path}: invalid entry for ${slug}`);
    }

    if (item.meta !== undefined && (typeof item.meta !== 'object' || item.meta === null || Array.isArray(item.meta))) {
      fail(`${file.path}: meta must be an object when present for ${slug}`);
    }
  }
}

if (process.exitCode === 1) {
  process.exit(1);
}

console.log('[validate-index] OK');
