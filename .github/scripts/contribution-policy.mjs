import { createHash } from 'node:crypto';

export const noHumanQA = '⚠️ **No human QA** — this PR has not been verified by a human yet. Remove this line once a human confirms the happy path.';
export const headings = {
  author: '提交者身份', type: '变更类型', summary: '变更说明', validation: '验证方式与结果',
  screenshots: '截图 / 录屏', qa: '人工 QA 状态', bug: '问题描述', steps: '复现步骤',
  expected: '预期与实际行为', version: '版本', feature: '功能描述', motivation: '使用场景与动机',
  help: '遇到的问题', goal: '希望达到的目标', attempts: '已经尝试的方法', environment: '版本与运行环境',
};
export const typeLabels = ['bug', 'feat', 'test', 'help'];
export const ciWorkflows = ['eslint.yml', 'go-ci.yml', 'rust-ci.yml', 'runtime-ci.yml', 'migrations.yml', 'install-ci.yml', 'electron-ci.yml', 'docker-pr.yml', 'contribution-policy-ci.yml'];

// Fenced examples must not supply headings or checked choices for the outer form.
export function sections(body = '') {
  const result = new Map();
  let heading;
  let fence;
  for (const line of body.replace(/<!--[^]*?-->/g, '').split(/\r?\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
      else if (heading) result.get(heading).content.push(line);
      continue;
    }
    if (delimiter) { fence = delimiter[1]; continue; }
    const match = line.match(/^#{2,3}\s+(.+?)\s*#*$/);
    if (match) {
      heading = match[1].trim();
      if (result.has(heading)) throw new Error(`章节重复：${heading}`);
      result.set(heading, { content: [], plain: [], choices: [] });
    } else if (heading) {
      result.get(heading).content.push(line);
      result.get(heading).plain.push(line);
      const checked = line.match(/^\s*-\s+\[[xX]\]\s+(.+?)\s*$/);
      if (checked) result.get(heading).choices.push(checked[1]);
    }
  }
  return result;
}

export function validate(body, isPR) {
  const errors = [];
  let parts;
  try { parts = sections(body ?? ''); } catch (error) { return { errors: [error.message] }; }
  const content = key => parts.get(headings[key])?.content.join('\n').trim() ?? '';
  function required(key) {
    const value = content(key);
    if (!value || /^(?:_?No response_?|N\/?A|无|待填写|请填写[。.]?|\.\.\.)$/i.test(value)) errors.push(`请填写「${headings[key]}」。`);
  }
  function choice(key, allowed) {
    const field = parts.get(headings[key]);
    const plain = field?.plain.join('\n').trim() ?? '';
    const values = isPR ? (field?.choices ?? []) : (plain ? [plain] : []);
    if (values.length !== 1 || !allowed.includes(values[0])) {
      errors.push(`「${headings[key]}」必须选择一项：${allowed.join(' / ')}。`);
      return undefined;
    }
    return values[0];
  }
  const author = choice('author', ['Human', 'Agent']);
  const type = choice('type', isPR ? ['bug', 'feat', 'test'] : ['bug', 'feat', 'help']);
  if (isPR) {
    ['summary', 'validation', 'screenshots', 'qa'].forEach(required);
    const qa = choice('qa', ['尚未人工验证', '已获人工确认']);
    if (qa === '尚未人工验证' && !(body ?? '').trimEnd().endsWith(noHumanQA)) errors.push('尚未人工验证时，请在描述末尾保留 No human QA 声明。');
    if (qa === '已获人工确认') {
      const evidence = content('qa').replace(/^\s*-\s+\[[ xX]\].*$/gm, '').replace(noHumanQA, '').trim();
      if (!evidence || /^(?:待填写|N\/?A)$/i.test(evidence)) errors.push('请在「人工 QA 状态」注明确认人及确认记录。');
      if ((body ?? '').includes(noHumanQA)) errors.push('已获人工确认时，请移除 No human QA 声明。');
    }
  } else {
    const fields = { bug: ['bug', 'steps', 'expected', 'version'], feat: ['feature', 'motivation'], help: ['help', 'goal', 'attempts', 'environment'] };
    (fields[type] ?? []).forEach(required);
    if (author === 'Agent') required('screenshots');
  }
  return { author, type, errors };
}

export function bodyFingerprint(pr) {
  return createHash('sha256').update(JSON.stringify([pr.head.sha, pr.base.ref, pr.body ?? ''])).digest('hex').slice(0, 24);
}

const handWrittenIcons = new Set(['Codex.vue', 'CodexColor.vue', 'Misskey.vue']);
export function excluded(path) {
  if (/^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|go\.sum|skills-lock\.json)$/.test(path.split('/').at(-1))) return true;
  if (/^spec\/(docs\.go|swagger\.(json|yaml))$/.test(path) || /\.pb\.go$/.test(path)) return true;
  if (/^(packages\/sdk\/src\/|internal\/db\/postgres\/sqlc\/)/.test(path)) return true;
  if (path.startsWith('packages/icons/src/')) return !handWrittenIcons.has(path.slice('packages/icons/src/icons/'.length)) || !path.startsWith('packages/icons/src/icons/');
  return path === 'apps/web/src/components/file-manager/seti/vs-seti-icon-theme.json';
}
export function sizeLabel(additions, deletions) {
  const n = Math.max(additions, deletions);
  return `size:${n < 50 ? 'XS' : n < 500 ? 'S' : n < 1000 ? 'M' : n <= 3000 ? 'L' : 'XL'}`;
}
export function classify(files) {
  let additions = 0;
  let deletions = 0;
  let ignored = 0;
  const changes = new Set();
  const shared = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|eslint\.config\.mjs|tsconfig\.json|vitest\.config\.ts)$/;
  for (const file of files) {
    const paths = [file.filename, file.previous_filename].filter(Boolean);
    // Count a rename into/out of generated output: only exclude when both sides are generated.
    if (paths.every(excluded)) ignored++;
    else { additions += file.additions; deletions += file.deletions; }
    for (const path of paths) {
      if (/^(apps\/web\/|packages\/(ui(?:\/|$)|icons\/|config\/|sdk\/)|patches\/)/.test(path) || shared.test(path)) changes.add('change:web');
      if (/^(apps\/desktop\/|packages\/config\/)/.test(path) || shared.test(path)) changes.add('change:desktop');
      if (/^db\/(?:[^/]+\/)*migrations\//.test(path)) changes.add('change:migrations');
      if (/^(cmd\/|internal\/|conf\/|db\/|spec\/)/.test(path) || /^(go\.(mod|sum)|sqlc\.yaml|openapi-ts\.config\.ts)$/.test(path)) changes.add('change:server');
    }
  }
  return { additions, deletions, ignored, size: sizeLabel(additions, deletions), changes: [...changes].sort() };
}
