# Issue、PR 与标签自动化

本规范允许贡献者先提交，再由 Actions 检查正文、同步标签和提示修改。PR 格式通过后才运行适用的 lint、测试和构建；首次贡献者的待审批 CI 由机器人自动批准。工作流批准不等于代码 review、合并或发布授权。

## 标签配置

`.github/labels.json` 是名称、颜色、描述的唯一来源。GitHub 不会原生读取这个文件；`Sync labels` 工作流在 main 上配置变更时调用 GitHub API，只创建或更新，不自动删除。维护者也可以运行：

```sh
# 默认只展示配置
node .github/scripts/sync-labels.mjs felinics/Memoh
# 应用配置
node .github/scripts/sync-labels.mjs felinics/Memoh --apply
```

保留以下 14 个标签：

| 分组 | 标签 | 颜色 |
| --- | --- | --- |
| 类型 | `bug` | `D73A4A` |
| 类型 | `feat` | `2DA44E` |
| 类型 | `test` | `8250DF` |
| 类型 | `help` | `0E8A8A` |
| 规模 | `size:XS`、`size:S`、`size:M`、`size:L`、`size:XL` | 统一 `0969DA` |
| 范围 | `change:web`、`change:desktop`、`change:migrations`、`change:server` | 统一 `D4C5F9` |
| 修正 | `needs:format` | `D97706` |

Issue 使用 `bug`、`feat` 或 `help`；PR 在 `bug`、`feat`、`test` 中选择一个主要类型。文档、配置、依赖修改按目的选择 bug 或 feat，专门修改测试时使用 test。身份在正文声明，不增加身份标签。

### Size

使用 PR 相对目标分支的整体文件差异，排除生成文件后分别累计新增行数 A 和删除行数 D，依据 `max(A, D)` 分类，绝不使用 A+D。每个 PR 恰好保留一个 size 标签。

| 标签 | `max(A, D)` |
| --- | --- |
| `size:XS` | 0–49 |
| `size:S` | 50–499 |
| `size:M` | 500–999 |
| `size:L` | 1000–3000 |
| `size:XL` | 3001 及以上 |

例如新增 400、删除 400 是 S；新增 80、删除 1200 是 L。仅生成文件或没有文本行数的变更为 XS。二进制使用 GitHub 返回的行数，不虚构行数。

排除清单维护在共享 policy 中：

- 所有目录中的 `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock`、`Cargo.lock`、`go.sum`、`skills-lock.json`。
- `spec/docs.go`、`spec/swagger.json`、`spec/swagger.yaml`。
- `packages/sdk/src/**`、`internal/db/postgres/sqlc/**`、`**/*.pb.go`。
- `packages/icons/src/**`，但 `icons/Codex.vue`、`icons/CodexColor.vue`、`icons/Misskey.vue` 正常计数。
- `apps/web/src/components/file-manager/seti/vs-seti-icon-theme.json`。

迁移 SQL、测试、文档、配置和图标源文件正常计数。只有文件重命名前后都属于排除清单时才排除，防止将手写代码移入生成目录而隐藏修改规模。运行摘要展示原始与排除后的新增/删除行数、排除文件数及标签。

### Change

按实际路径匹配，支持多标签。新增、修改、删除参与判断；重命名检查旧路径和新路径。生成文件仍参与范围分类。

| 标签 | 路径 |
| --- | --- |
| `change:web` | `apps/web/**`、`packages/ui` gitlink 或子路径、`packages/icons/**`、`packages/config/**`、`packages/sdk/**`、`patches/**` |
| `change:desktop` | `apps/desktop/**`、`packages/config/**` |
| `change:migrations` | `db/**/migrations/**` |
| `change:server` | `cmd/**`、`internal/**`、`conf/**`、`db/**`、`spec/**`、根目录 `go.mod`、`go.sum`、`sqlc.yaml`、`openapi-ts.config.ts` |

根目录 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`eslint.config.mjs`、`tsconfig.json`、`vitest.config.ts` 同时触发 Web 与 Desktop。迁移同时触发 migrations 与 server。未匹配的文档或治理文件可以没有 change 标签，不推断间接依赖。修改范围标签不作为 CI 放行凭据。

## 模板和截图

Issue 提供 Bug Report、Feature Request、Help 三个表单，保留空白 Issue 入口。开头必选 Human/Agent 身份和模板对应的类型；删除旧 Area 和 Channel 字段。通过 CLI、API 或空白入口提交时，仍须保留对应章节。

- Bug：问题描述、复现步骤、预期与实际行为、版本必填。
- Feature：功能描述、使用场景与动机必填。
- Help：遇到的问题、希望达到的目标、已经尝试的方法、版本与运行环境必填。
- 三者均提供截图/录屏和补充说明；Bug、Help 还提供日志。

PR 默认模板要求身份、类型各勾选一项，填写变更说明、验证方式与结果、截图/录屏章节、人工 QA 状态；关联 Issue 可选。标题格式不在本轮自动校验范围内。自由正文允许中文或英文，章节和选项使用模板中的稳定名称。

空白、注释、占位内容、未勾选或多选均不通过；代码块内的示例不能冒充正文结构或选择项。不会用字数判断内容质量。

截图推荐通过 GitHub 附件上传。Agent 涉及可见行为时应尽量用浏览器或 Computer Use 实际操作和截图；无法截图、无法上传或不适用时说明具体原因与替代验证。本地文件路径不是已上传证据。

尚未获得人工确认的 PR 必须勾选“尚未人工验证”，并在描述末尾保留原有 No human QA 声明。获得人工确认后勾选“已获人工确认”、注明确认人及记录、删除声明。Agent 自己测试或截图不算人工 QA，Action 只能检查声明结构，无法证明人工验证实际发生。

## 工作流行为

`Contribution governance` 使用默认分支的可信脚本。PR 通过 `pull_request_target`，Issue 通过 `issues` 触发；控制器不检出、不执行 PR 代码。它读取当前 API 正文，校验格式，同步类型标签，并为 PR 计算 size/change。

格式不通过时添加 `needs:format`，以一条固定标识的机器人评论 @ 作者并列出缺项。修改原描述后自动重新检查；修正后移除标签并更新原评论，不反复新建评论。合法的首次提交不额外发一条“已通过”评论。

### CI 门槛和自动审批

控制器将结果写为 PR 当前 head SHA 的 `PR Format` 状态，摘要包含 SHA、目标分支与正文的指纹。PR CI 的独立轻量 job 从默认分支加载检查逻辑，读取最新正文并等待匹配的可信状态；业务 jobs 依赖该 job。格式未通过时不会安装依赖、运行 lint、测试或构建。GitHub 可以先创建 workflow run 或执行轻量入口检查。

CI 仍使用现有文件路径筛选；push、release 和维护者直接 workflow_dispatch 的原有行为不经过 PR 格式门槛。Docker 共享构建工作流分别由只读 PR 入口和发布入口调用，PR 入口不传入发布 secrets，固定不发布。

控制器自动批准普通 fork PR 待审批运行，保留仓库 `first_time_contributors` 设置。只处理明确关联当前仓库、当前 PR 和当前 head 的白名单工作流：ESLint、Go、Rust、Runtime、Migrations、Installer、Electron、Docker PR 和贡献规则测试。不会放行发布、部署、文档更新等维护工作流。

- 使用 `workflow_run` 的 requested/completed 事件补偿时序，每五分钟还有一次补偿扫描。
- 正文修正后只重跑格式门槛失败且其他任务未执行的运行，不重跑实际测试失败。
- 新提交重新检查，旧 head 的通过状态不能复用。
- 正文再次不合规时取消当前活跃 CI，记录被控制器取消的运行及 attempt；修正后可恢复该 attempt，人工取消的运行不会被自动恢复。
- 调度扫描包括新规则上线后创建的 PR，以及当前提交已经有治理状态的旧 PR。未接入规则的旧 PR 不被批量评论。
- 使用 GITHUB_TOKEN 创建 PR 时，事件可能不触发其他工作流；定时扫描仍会校验和标注。它不能凭空创建不存在的普通 pull_request CI run；这种机器人 PR 如需自动启动全部 CI，须由能够产生正常 PR 事件的 GitHub App 创建，或维护者对其新增提交。当前模型同步和文档更新正文均遵守模板，无格式豁免。

控制任务拥有评论、标签、状态和 Actions 写权限，但不执行贡献者代码。代码 CI 使用 GitHub 托管 runner、只读 token；PR 入口不接收 secrets，检出不持久化 token。格式合规不意味着外部代码可信；运行批准仅表示同意消耗 CI 资源。

API 操作有有限重试；无法获得完整文件列表时保持旧 size/change 标签并明确报错，不把基础设施错误标为正文不合规。GitHub 文件列表超过上限时同样报告分类失败。审批权限失败会导致控制工作流失败，不静默宣称 CI 已放行。

### 维护与手动补偿

维护者可以在 `Contribution governance` 的 workflow_dispatch 输入 PR 编号，重新计算该 PR；输入为空扫描新开放 PR。`Sync labels` 支持手动触发，始终只在主仓库 main 上写入标签。

工作流依赖默认分支的脚本，因此必须先合入 main 才能启用新门槛；不能把尚未合并的工作区测试当成线上自动化验收。PR 修改 CI YAML 本身仍接受正常代码审查；格式检查不是恶意 workflow 修改的隔离机制。

## 迁移和验证

首次迁移脚本默认只读，显式 `--apply` 才写入：

```sh
node .github/scripts/migrate-labels.mjs felinics/Memoh /absolute/backup/directory
node .github/scripts/migrate-labels.mjs felinics/Memoh /absolute/backup/directory --apply
```

脚本先保存旧标签、历史关联和开放 PR 的标签/分类快照，然后将旧 size 标签重命名、统一配置、把历史 `bug/*` 和 `feat/*` 补到基础类型，再删除明确列出的废弃标签。它不猜测 question/documentation 等历史类型，不发评论。最后重新计算开放 PR 的 size/change；已关闭 PR 不重新计算规模。改动中的 PR 通过 SHA 检查跳过。

备份用于人工审查和恢复旧关联；删除后重新创建的标签不会保留原 GitHub label ID。日常配置同步不调用删除逻辑。

本地验证：

```sh
node --test .github/scripts/*.test.mjs
# 可使用 actionlint 检查全部 workflow
```

测试覆盖表单渲染、身份/类型、截图说明、QA 声明、代码块/重复章节、size 边界和排除、重命名与子模块、标签幂等、评论复用、旧提交保护、自动审批和格式失败恢复。

上线验收还必须使用真实首次贡献者的 fork PR：不合规时只有格式检查和提醒，修正正文后自动批准并执行适用 CI，全程无需维护者点击 Approve。修改正文、推送新提交、控制器取消恢复、真实测试失败均需分别验证。此项不能由模拟 API 测试或静态检查代替。
