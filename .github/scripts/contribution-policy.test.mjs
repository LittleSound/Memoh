import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { bodyFingerprint, classify, excluded, headings, noHumanQA, sizeLabel, validate } from './contribution-policy.mjs';
import { readLabels, sync } from './sync-labels.mjs';

export function validPR() {
  return readFileSync(new URL('../pull_request_template.md', import.meta.url), 'utf8')
    .replace('- [ ] Agent', '- [x] Agent').replace('- [ ] bug', '- [x] bug').replace('- [ ] 尚未人工验证', '- [x] 尚未人工验证')
    .replace('## 变更说明', '## 变更说明\n修复正文变更后 CI 不恢复的问题。')
    .replace('## 验证方式与结果', '## 验证方式与结果\n已运行控制器回归测试。')
    .replace('## 截图 / 录屏', '## 截图 / 录屏\n只修改工作流，没有可见产品界面；使用工作流测试验证。');
}
function issue(type, author = 'Human') {
  const fields = { bug: ['bug', 'steps', 'expected', 'version'], feat: ['feature', 'motivation'], help: ['help', 'goal', 'attempts', 'environment'] };
  return `### 提交者身份\n${author}\n\n### 变更类型\n${type}\n\n` + fields[type].map(key => `### ${headings[key]}\n可复现的具体说明`).join('\n\n');
}

test('PR template can be completed and enforces unique identity/type choices', () => {
  assert.deepEqual(validate(validPR(), true).errors, []);
  assert.ok(validate(validPR().replace('- [ ] Human', '- [x] Human'), true).errors.length);
  assert.ok(validate(validPR().replace('- [ ] feat', '- [x] feat'), true).errors.length);
  assert.ok(validate(validPR().replace('- [x] bug', '- [x] help'), true).errors.length);
  assert.ok(validate(readFileSync(new URL('../pull_request_template.md', import.meta.url), 'utf8'), true).errors.length);
});
test('CLI issue bodies obey all three templates; agents explain missing screenshots', () => {
  for (const type of ['bug', 'feat', 'help']) {
    assert.deepEqual(validate(issue(type), false).errors, []);
    assert.ok(validate(issue(type, 'Agent'), false).errors.length);
    assert.deepEqual(validate(issue(type, 'Agent') + '\n\n### 截图 / 录屏\n纯 API 问题，无界面可截图；附有请求日志。', false).errors, []);
  }
});
test('fenced examples and comments cannot forge headings or identity', () => {
  const body = `\`\`\`markdown\n${validPR()}\n\`\`\``;
  assert.ok(validate(body, true).errors.length);
  assert.ok(validate(`<!-- ${validPR()} -->`, true).errors.length);
  assert.ok(validate(issue('help').replace('\nHuman\n', '\n```\nHuman\n```\n'), false).errors.length);
  assert.ok(validate(validPR().replace('- [x] Agent', '~~~\n- [x] Agent\n~~~'), true).errors.length);
});
test('fenced reproduction text is allowed and duplicate headings are rejected', () => {
  assert.deepEqual(validate(issue('bug').replace('可复现的具体说明', '```sh\nmemoh start\n```'), false).errors, []);
  assert.ok(validate(validPR() + '\n## 变更类型\n- [x] test', true).errors.some(error => error.includes('重复')));
});
test('human QA requires disclosure or explicit confirmation record', () => {
  assert.ok(validate(validPR().replace(noHumanQA, ''), true).errors.length);
  let human = validPR().replace('- [x] 尚未人工验证', '- [ ] 尚未人工验证').replace('- [ ] 已获人工确认', '- [x] 已获人工确认').replace(noHumanQA, '');
  assert.ok(validate(human, true).errors.length);
  human += '\n@maintainer 已在 PR review 确认 happy path。';
  assert.deepEqual(validate(human, true).errors, []);
});
test('all size boundaries use the larger total, never the sum', () => {
  for (const [n, label] of [[0,'XS'],[49,'XS'],[50,'S'],[499,'S'],[500,'M'],[999,'M'],[1000,'L'],[3000,'L'],[3001,'XL']]) {
    assert.equal(sizeLabel(n, 0), `size:${label}`);
    assert.equal(sizeLabel(0, n), `size:${label}`);
  }
  assert.equal(sizeLabel(400, 400), 'size:S');
  assert.equal(sizeLabel(80, 1200), 'size:L');
});
test('generated outputs are excluded but hand-authored icons and migrations count', () => {
  const files = [
    { filename:'packages/sdk/src/sdk.gen.ts', additions:10000, deletions:4000 },
    { filename:'internal/db/postgres/sqlc/apps.sql.go', additions:4000, deletions:1000 },
    { filename:'internal/rpc/runtimepb/runtime_grpc.pb.go', additions:2000, deletions:3000 },
    { filename:'pnpm-lock.yaml', additions:12000, deletions:20000 },
    { filename:'packages/icons/src/icons/Codex.vue', additions:40, deletions:10 },
    { filename:'db/postgres/migrations/0153_example.up.sql', additions:15, deletions:0 },
  ];
  const result = classify(files);
  assert.equal(result.additions, 55);
  assert.equal(result.deletions, 10);
  assert.equal(result.size, 'size:S');
  assert.equal(result.ignored, 4);
  assert.deepEqual(result.changes, ['change:desktop','change:migrations','change:server','change:web']);
  assert.equal(excluded('packages/icons/src/icons/CodexColor.vue'), false);
  assert.equal(excluded('packages/icons/src/icons/Misskey.vue'), false);
  assert.equal(excluded('packages/icons/src/icons/Generated.vue'), true);
});
test('renames, deletions and submodule gitlinks classify both affected areas', () => {
  assert.deepEqual(classify([{ filename:'apps/desktop/src/view.ts', previous_filename:'apps/web/src/view.ts', additions:0, deletions:0 }]).changes, ['change:desktop','change:web']);
  assert.deepEqual(classify([{ filename:'packages/ui', additions:1, deletions:1 }]).changes, ['change:web']);
  assert.deepEqual(classify([{ filename:'db/postgres/migrations/old.sql', additions:0, deletions:5 }]).changes, ['change:migrations','change:server']);
  assert.equal(classify([{ filename:'packages/sdk/src/new.ts', previous_filename:'apps/web/manual.ts', additions:70, deletions:0 }]).size, 'size:S');
  assert.deepEqual(classify([{ filename:'docs/help.md', additions:30, deletions:0 }]).changes, []);
});
test('body fingerprint changes with the head, body and target branch', () => {
  const pr = { head:{sha:'a'}, base:{ref:'main'}, body:validPR() };
  for (const changed of [{...pr,body:'changed'},{...pr,head:{sha:'b'}},{...pr,base:{ref:'v1.0'}}]) assert.notEqual(bodyFingerprint(pr), bodyFingerprint(changed));
});
test('issue forms produce valid GitHub-rendered markdown after required fields are completed', () => {
  for (const file of ['bug_report','feature_request','help']) {
    const form = JSON.parse(execFileSync('ruby', ['-ryaml','-rjson','-e','puts YAML.load_file(ARGV[0]).to_json', new URL(`../ISSUE_TEMPLATE/${file}.yml`, import.meta.url).pathname], { encoding:'utf8' }));
    const body = form.body.map(field => `### ${field.attributes.label}\n\n${field.id === 'author' ? 'Human' : field.id === 'type' ? form.labels[0] : field.validations.required ? '具体描述与真实验证信息' : '_No response_'}`).join('\n\n');
    assert.deepEqual(validate(body, false).errors, []);
  }
});
test('automatic PR producers supply valid bodies', () => {
  for (const [file,job,key] of [['sync-model-capabilities.yml','sync','body'],['agents-md-updater.yml','update','pr_body']]) {
    const workflow = JSON.parse(execFileSync('ruby', ['-ryaml','-rjson','-e','puts YAML.load_file(ARGV[0]).to_json', new URL(`../workflows/${file}`, import.meta.url).pathname], { encoding:'utf8' }));
    const body = key === 'pr_body' ? workflow.jobs[job].with[key] : workflow.jobs[job].steps.find(step => step.with?.body)?.with.body;
    assert.deepEqual(validate(body, true).errors, []);
  }
});
test('label sync is idempotent and does not remove unrelated labels', async () => {
  const desired = await readLabels();
  const calls = [];
  const github = { paginate:async()=>[...desired,{name:'legacy',color:'ffffff',description:''}], rest:{issues:{listLabelsForRepo:'list',createLabel:async x=>calls.push(x),updateLabel:async x=>calls.push(x)}} };
  await sync(github, {owner:'o',repo:'r'});
  assert.deepEqual(calls, []);
});

test('every ordinary PR CI has a format dependency before executable jobs', () => {
  const dir=new URL('../workflows/',import.meta.url);
  for(const file of readdirSync(dir).filter(name=>name.endsWith('.yml'))) {
    const workflow=JSON.parse(execFileSync('ruby',['-ryaml','-rjson','-e','puts YAML.load_file(ARGV[0]).to_json',new URL(file,dir).pathname],{encoding:'utf8'}));
    const events=workflow.on??workflow.true;
    if(!events || !Object.hasOwn(events,'pull_request')) continue;
    assert.ok(workflow.jobs.format?.uses?.endsWith('/contribution-format.yml'),file);
    for(const [name,job] of Object.entries(workflow.jobs)) {
      if(name==='format') continue;
      const needs=Array.isArray(job.needs)?job.needs:[job.needs];
      assert.ok(needs.includes('format'),`${file}: ${name} lacks format dependency`);
    }
  }
});
