# Issue, PR, and Label Governance

Contributors can submit an issue or PR before format checks run. GitHub Actions validates the description, synchronizes labels, and requests corrections. Eligible PR lint, test, and build jobs run only after the format check passes. A separate controller approves pending first-time contributor workflow runs automatically. Workflow approval does not approve a code review, merge, or release.

## Label Configuration

`.github/labels.json` is the source of truth for label names, colors, and English descriptions. GitHub does not read this file natively. The `Sync labels` workflow applies changes from main through the GitHub API. Routine synchronization creates or updates labels; it never deletes them.

```sh
# Preview the configuration without changing GitHub
node .github/scripts/sync-labels.mjs felinics/Memoh
# Apply the configuration
node .github/scripts/sync-labels.mjs felinics/Memoh --apply
```

The repository maintains these 14 labels:

| Group | Labels | Color |
| --- | --- | --- |
| Type | `bug` | `D73A4A` |
| Type | `feat` | `2DA44E` |
| Type | `test` | `8250DF` |
| Type | `help` | `0E8A8A` |
| Size | `size:XS`, `size:S`, `size:M`, `size:L`, `size:XL` | `0969DA` for all sizes |
| Scope | `change:web`, `change:desktop`, `change:migrations`, `change:server` | `D4C5F9` for all scopes |
| Correction | `needs:format` | `D97706` |

Issues use `bug`, `feat`, or `help`. PRs select exactly one primary type from `bug`, `feat`, or `test`. Classify documentation, configuration, and dependency changes as bug or feat according to their purpose; use test for changes dedicated to tests. Author identity belongs in the description, not in a label.

### Size Calculation

Use the complete PR diff against its target branch. After excluding generated files, total additions as A and deletions as D. Classify by `max(A, D)`, never A+D. Each PR has exactly one size label.

| Label | `max(A, D)` |
| --- | --- |
| `size:XS` | 0–49 |
| `size:S` | 50–499 |
| `size:M` | 500–999 |
| `size:L` | 1000–3000 |
| `size:XL` | 3001 or more |

For example, 400 additions and 400 deletions is S; 80 additions and 1200 deletions is L. A change containing only excluded files or no text lines is XS. Binary files use the line counts returned by GitHub; the classifier does not invent line counts.

The shared policy excludes:

- `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `go.sum`, and `skills-lock.json` in any directory.
- `spec/docs.go`, `spec/swagger.json`, and `spec/swagger.yaml`.
- `packages/sdk/src/**`, `internal/db/postgres/sqlc/**`, and `**/*.pb.go`.
- `packages/icons/src/**`, except the handwritten `icons/Codex.vue`, `icons/CodexColor.vue`, and `icons/Misskey.vue` files.
- `apps/web/src/components/file-manager/seti/vs-seti-icon-theme.json`.

Migration SQL, tests, documentation, configuration, and icon source files count normally. A renamed file is excluded only when both its old and new paths are excluded, so moving handwritten code into a generated directory does not hide its size. The run summary reports original and filtered additions/deletions, the number of excluded files, and the resulting labels.

### Scope Classification

Scope labels reflect changed paths and can coexist. Added, modified, and deleted files participate; renames check both paths. Generated files still participate in scope classification.

| Label | Paths |
| --- | --- |
| `change:web` | `apps/web/**`, the `packages/ui` gitlink or its contents, `packages/icons/**`, `packages/config/**`, `packages/sdk/**`, `patches/**` |
| `change:desktop` | `apps/desktop/**`, `packages/config/**` |
| `change:migrations` | `db/**/migrations/**` |
| `change:server` | `cmd/**`, `internal/**`, `conf/**`, `db/**`, `spec/**`, and root `go.mod`, `go.sum`, `sqlc.yaml`, `openapi-ts.config.ts` |

Root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `eslint.config.mjs`, `tsconfig.json`, and `vitest.config.ts` trigger both Web and Desktop. Migrations trigger both migrations and server. Unmatched documentation or governance files may have no scope label. The classifier does not infer indirect dependencies, and labels are not CI authorization credentials.

## Templates and Evidence

Issue forms include Bug Report, Feature Request, and Help. The blank issue entry remains available. Each form starts with required Human/Agent identity and its corresponding type. The former Area and Channel fields are removed. CLI, API, and blank submissions must preserve the corresponding sections.

- Bug requires Bug Description, Steps to Reproduce, Expected and Actual Behavior, and Version.
- Feature requires Feature Description and Use Case and Motivation.
- Help requires Problem, Desired Outcome, What You Have Tried, and Version and Environment.
- All forms offer Screenshots / Recordings and Additional Context. Bug and Help also offer Logs.

The PR template requires exactly one Author and Type choice, Summary, Validation, Screenshots / Recordings, and Human QA. Related Issues is optional. PR title enforcement is outside this workflow. Templates, documentation, and automated messages are written in English. Free-form contributor responses may use other languages, but section names and choices must match the English template.

Empty sections, placeholders, missing selections, and multiple selections fail validation. Fenced examples cannot supply outer section headings or choices. Content quality is not judged by a minimum word count.

Upload screenshots as GitHub-accessible attachments. For visible behavior, agents should use browser tools or Computer Use to exercise the change and capture evidence. If capture or upload is unavailable or not applicable, explain why and describe alternative verification. Local file paths are not uploaded evidence.

Until a human confirms QA, select `Not yet verified by a human` and keep the existing No human QA disclosure at the end of the PR description. After confirmation, select `Confirmed by a human`, identify the reviewer and confirmation record, and remove the disclosure. Agent tests and screenshots do not count as human QA. Automation validates the declaration's structure, not whether human verification actually occurred.

## Workflow Behavior

`Contribution governance` uses trusted default-branch scripts. PR events use `pull_request_target`; issues use `issues`. The controller does not check out or execute PR code. It reads the current API description, validates it, synchronizes the type label, and calculates PR size/scope labels.

An invalid description receives `needs:format` and one identifiable bot comment mentioning the author and listing corrections. Editing the description triggers another check. Once corrected, the label is removed and the existing comment is updated instead of posting another one. An initially valid submission does not receive an extra success comment.

### CI Gate and Automatic Approval

The controller records `PR Format` on the current PR head SHA, including a fingerprint of the head, target branch, and description. Separately, ordinary read-only PR CI validates the latest description using the rules in the PR merge commit and checks that the head is current. Code jobs depend on this lightweight gate. It does not require a controller status, so the PR introducing governance can itself run CI before merging. The privileged controller independently uses default-branch rules for labels and approval.

Invalid format prevents dependency installation, lint, tests, and builds. GitHub may still create a workflow run or execute the lightweight gate. Existing CI path filters remain in effect. Push, release, and maintenance workflow_dispatch behavior does not use the PR gate. Docker shares build logic between read-only PR and publishing entry points; the PR caller passes no publishing secrets and fixes publishing to false.

The controller retains the repository's `first_time_contributors` approval setting and approves eligible pending fork PR runs. It checks the repository, PR, current head, and workflow allowlist: ESLint, Go, Rust, Runtime, Migrations, Installer, Electron, Docker PR, and contribution policy tests. Publishing, deployment, and documentation maintenance workflows are not automatically approved.

- `workflow_run` requested/completed events reconcile timing differences, with a five-minute scheduled reconciliation as a fallback.
- After a description is corrected, only runs blocked by format with no executed code jobs are retried. Actual test failures are not retried automatically.
- New commits require a new check; an old head's result is not reused.
- If the description becomes invalid, the controller cancels active CI and records the run and attempt. It can recover that attempt after correction; manually cancelled runs are not automatically resumed.
- Scheduled scans include PRs created after governance was introduced and older PRs whose current head already has a governance status. Untouched older PRs are not flooded with comments.
- PRs created with GITHUB_TOKEN may not trigger other workflows. Reconciliation can still validate and label them, but cannot create a missing ordinary pull_request CI run. To start all CI automatically, those PRs need an authoring GitHub App that produces normal PR events, or a subsequent maintainer push. Model-sync and documentation-update PR bodies follow the template without exemptions.

Control jobs may write comments, labels, statuses, and workflow approvals, but never execute contributor code. Code CI uses GitHub-hosted runners and read-only tokens. PR callers receive no secrets, and checkout does not persist credentials. Format compliance does not establish that external code is trustworthy; automatic workflow approval authorizes CI resource use only.

API operations have bounded retries. An incomplete file list preserves existing size/scope labels and reports a classification error instead of claiming the description is invalid. Exceeding GitHub's file-list limit has the same behavior. Approval permission failures fail the controller visibly rather than claiming CI was released.

### Maintenance

Maintainers can supply a PR number to `Contribution governance` through workflow_dispatch to reconcile it. An empty input scans eligible open PRs. `Sync labels` also supports manual dispatch and writes only from main in the primary repository.

The read-only format gate works inside this PR. The privileged label/approval controller becomes active only after merging into main. A passing read-only gate does not establish that automatic fork approval works. Changes to workflow YAML still require normal code review; format validation is not an isolation mechanism for malicious workflow changes.

## Migration and Verification

The initial migration script is read-only by default; `--apply` explicitly enables writes:

```sh
node .github/scripts/migrate-labels.mjs felinics/Memoh /absolute/backup/directory
node .github/scripts/migrate-labels.mjs felinics/Memoh /absolute/backup/directory --apply
```

Before writing, the script saves label definitions, historical associations, and open-PR labels/classifications. It renames old size labels, applies the configuration, adds base bug/feat labels to historical regional classifications, and removes explicitly listed obsolete labels. It does not guess historical types from question/documentation labels or post comments. Finally, it recalculates size/scope labels for open PRs, skipping any PR whose head changed. Closed PR sizes are not recalculated.

The backup supports manual inspection and restoration of associations. Recreating a deleted label does not preserve its original GitHub label ID. Routine configuration synchronization does not invoke deletion logic.

Local verification:

```sh
node --test .github/scripts/*.test.mjs
# Use actionlint to validate workflow configuration.
```

Tests cover rendered forms, identity/type choices, screenshot explanations, QA declarations, fenced examples, duplicate sections, size boundaries/exclusions, renames, submodules, idempotent labels, comment reuse, current-head checks, automatic approval, format failure recovery, and the initial rollout without a main-branch controller.

Live rollout verification must also use a real first-time contributor's fork PR. Invalid format should produce only format feedback; correcting the description should release eligible CI without a maintainer clicking Approve. Verify new commits, description edits, controller cancellation/recovery, and actual test failures separately. Mocked API tests and static validation do not replace this acceptance check.
