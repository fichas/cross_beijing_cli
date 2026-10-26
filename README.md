# cross-bj

进京证 CLI 工具 — 让人类和 AI Agent 都能在终端中办理进京证。

[安装](#安装) · [AI Agent Skills](#快速开始ai-agent) · [命令参考](#命令参考) · [通知渠道](#通知渠道)

## 为什么选 cross-bj？

- **为 Agent 原生设计** — [Skills](./skills/) 开箱即用，Agent 无需额外适配
- **零 Python 依赖** — `npm install -g` 即装即用
- **智能续签** — 自动判断是否需要续签，剩余1天时提前申请
- **多渠道通知** — Bark、Telegram、钉钉、企业微信、飞书、Slack
- **一键定时** — `cross-bj cron setup` 写入 crontab

## 功能

| 类别 | 能力 |
|------|------|
| 进京证 | 智能续签、状态查询、到期提醒、多类型支持（六环内/六环外） |
| 车辆管理 | 添加/删除车辆、首选车辆设置、换牌（保留信息） |
| 通知 | Bark、Telegram、钉钉、企业微信、飞书、Slack、Webhook |
| 定时任务 | 一键写入 crontab，自定义执行时间 |

## 安装

```bash
npm install -g cross-bj
```

要求 Node.js >= 18。

## 快速开始（人类用户）

> **Note for AI assistants:** 如果你是 AI Agent，请跳转到[快速开始（AI Agent）](#快速开始ai-agent)。

```bash
# 1. 初始化（交互式引导完成登录、配置）
cross-bj init

# 2. 查看状态
cross-bj status

# 3. 配好行程默认值后，按本次实际在京状态续签
cross-bj run --location inside

# 4. 设置自动续签（每天 9:00）
cross-bj cron setup
```

## 快速开始（AI Agent）

> 以下步骤面向 AI Agent，部分步骤需要用户配合提供信息。

**第 1 步 — 安装**

```bash
npm install -g cross-bj
npx skills add fichas/cross_beijing_cli -y -g
```

**第 2 步 — 初始化（非交互式，需要用户提供手机号和密码）**

```bash
cross-bj init --phone <phone> --password <password>
```

**第 3 步 — 验证**

```bash
cross-bj status
```

## 命令参考


### 初始化

```bash
cross-bj init                                    # 交互式（已有配置会询问是否覆盖）
cross-bj init --phone <phone> --password <pwd>   # 非交互式（已有配置会拦截）
  [--entry-type <六环内|六环外>]
  [--notify <url>...]
  [-f, --force]                                  #   强制覆盖已有配置
```

### 续签

```bash
cross-bj run                        # 智能续签 + 状态查询 + 通知
  --location <inside|outside>       #   本次在京/不在京，选择对应行程默认值
  [--plate <plate>]                 #   指定车牌（默认首选车辆）
  [--entry-type <六环内|六环外>]      #   指定进京证类型（默认使用配置值）
  [--date <YYYY-MM-DD>]             #   指定申请日期，必须在服务端可办日期内
  [--purpose <code>]                #   本次进京目的代码，不修改保存的默认值
  [--dry-run]                       #   只校验并预览，不提交、不通知
  [--no-notify]                     #   不发送通知
```

无参数执行 `cross-bj` 等同于 `cross-bj run`，但需要提交时，缺少本次 `--location` 或行程配置会停止，不再填写固定地址。`inside/outside` 指是否在京，与六环内外证种无关。

### 状态

```bash
cross-bj status                     # 查看进京证状态
  [-v]                              #   含配置信息
  [-n]                              #   将状态通过通知渠道发送
  [--plate <plate>]                 #   指定车牌（默认首选车辆）
```

### 车辆管理

```bash
cross-bj vehicle list               # 查看绑定车辆（标注首选）
cross-bj vehicle add                # 添加车辆
  --plate <plate>                   #   号牌号码（必填）
  --engine <engine>                 #   发动机号后6位（必填）
  --brand <brand>                   #   品牌型号（必填）
  --reg-date <YYYY-MM-DD>           #   注册日期（必填）
  [--plate-type <type>]             #   号牌种类（默认按车牌长度推断）
  [--vehicle-type <type>]           #   车辆类型（默认01=客车）
cross-bj vehicle remove <plate>     # 删除车辆
cross-bj vehicle set <plate>        # 设置首选车辆
cross-bj vehicle swap <newPlate>    # 换牌（保留其他信息）
  [--from <oldPlate>]               #   指定替换哪辆（默认首选）
```

### 通知

```bash
cross-bj notify add <url>           # 添加通知渠道
cross-bj notify remove <url>        # 删除通知渠道
cross-bj notify test                # 发送测试通知
```

### 配置

```bash
cross-bj set entry-type <六环内|六环外>   # 修改进京证类型
```

### 定时任务

```bash
cross-bj cron setup                 # 写入 crontab（默认每天 9:00）
  [--schedule '<cron>']             #   自定义 cron 表达式
cross-bj cron remove                # 移除定时任务
cross-bj cron status                # 查看定时状态
```

旧定时命令未携带本次在京状态，不能直接用于提交；自动续签前须确认固定行程适用，并在实际调用的 `run` 命令中明确传入 `--location`。不要把一次行程状态自动当作长期默认。

## 智能续签逻辑

`cross-bj run` 自动判断是否需要续签：

| 当前状态 | 行为 |
|----------|------|
| 无记录（新车） | 申请今天的进京证 |
| 审核通过（生效中），剩余 ≤ 1 天 | 提前申请明天的进京证 |
| 审核通过（生效中），剩余 > 1 天 | 无需续签 |
| 审核中 / 待生效 | 无需续签 |
| 已失效 / 审核失败 | 申请今天的进京证 |
| 六环内剩余次数和天数均为 0 | 无法续签六环内（六环外以服务端检查为准） |

## 首选车辆逻辑

申请进京证时的车辆选择优先级：

1. `--plate` 参数指定 → 用它
2. 有正在申请/生效中的车辆 → 用它
3. 有手动设置的首选车辆（`cross-bj vehicle set`）→ 用它
4. 都没有 → 用第一辆

只有一辆车时自动视为首选。换牌（`vehicle swap`）后自动更新首选。

## 通知渠道

通过 `cross-bj notify add <url>` 添加。URL 格式兼容 [Apprise](https://github.com/caronc/apprise)，支持以下渠道：

| 渠道 | URL 格式 |
|------|----------|
| Bark | `bark://<server>/<key>` 或 `bark://<key>` |
| Telegram | `tgram://<bot_token>/<chat_id>` |
| 钉钉机器人 | `dingtalk://<access_token>[/<secret>]` |
| 企业微信机器人 | `wecom://<key>` |
| 飞书机器人 | `feishu://<hook_id>[/<secret>]` |
| Slack | `slack://<T>/<B>/<token>` |
| 通用 Webhook | `json://<host>/<path>` |

详细的 URL 格式说明参见 [Apprise Wiki](https://github.com/caronc/apprise/wiki)。

## 配置文件

配置存储在 `~/.cross-bj/config.json`，登录信息由 `cross-bj init` 创建。

行程默认值放在 `users[0].trip_defaults`，个人地址不要写入仓库源码：

- `outside`：`area`、道路 `code`/`name`、`longitude`/`latitude`。
- `inside`：在京 `address`、`longitude`/`latitude`。
- `destination`：目的地 `area`、`district_code`、`address`、`longitude`/`latitude`。
- `purpose`：用户确认的进京目的 `code`、`name`。

代码与名称须来自官方 `pro/ucDicController/queryDic` 字典（`jjlk`、`QJXZ`、`jjmd`），坐标从官方地图选点核实。用 `getUser()` 读取并合并行程字段后通过 `updateUser({ trip_defaults })` 保存，保留其余设置。缺少必填信息会拒绝提交；没有设备定位时留空，不使用地址坐标伪造当前位置。

## 登录接口与升级

登录流程参考 [Joey-PG/auto-beijing-pass](https://github.com/Joey-PG/auto-beijing-pass/blob/main/src/lib/bjt-login.js)：
北京通登录后通过 `ssp.jtgl.beijing.gov.cn/sso/callback/userauth` 获取 SSO 中间令牌，
再调用 `:1443/auth/userController/loginUserByUserCenter` 换取业务 `accessToken`。
业务请求直接使用该令牌，不再调用旧版 `loginUser` 激活会话。登录和业务请求均有 20 秒超时，保留 HTTPS 证书校验。

旧版保存的令牌不能直接沿用。更新源码后，在仓库目录执行以下命令，使用已保存的账号密码刷新令牌；只有登录成功才更新 `auth`，保留车辆、进京证类型和通知设置：

```bash
node --input-type=module -e "import { getUser, updateUser } from './src/lib/config-manager.js'; import { login } from './src/lib/bjt-login.js'; const user = getUser(); if (!user?.bjt_phone || !user?.bjt_pwd) throw new Error('Missing saved credentials'); const auth = await login(user.bjt_phone, user.bjt_pwd); updateUser({ auth }); console.log('Token refreshed');"
node bin/cross-bj.js status
```

令牌再次失效时也可执行上述刷新命令。`status` 本身不会自动重新登录，避免通过 `init --force` 重置已有配置。

开发验证：`npm test`。测试使用模拟响应，不连接真实账号，也不提交进京证申请。

## 自动发布 npm

`.github/workflows/npm-publish.yml` 会在 PR 和 `main` 更新时安装依赖、执行测试并检查打包。
合入 `main` 后，测试通过且 `package.json` 中的版本尚未发布时，会自动发布到 npm；
已存在的版本会跳过，查询 registry 失败则终止发布。直接推送到 `main` 也会触发。
也可以在 GitHub Actions 中选择 `main`，手动运行此 workflow 重试。

首次使用前，在 npm 的 `cross-bj` 包 **Settings → Trusted publishing** 中添加 GitHub Actions：

| 字段 | 值 |
|------|------|
| Organization or user | `fichas` |
| Repository | `cross_beijing_cli` |
| Workflow filename | `npm-publish.yml` |
| Environment name | 留空 |
| Allowed actions | 允许直接执行 `npm publish` |

workflow 使用 GitHub OIDC 认证，不需要设置 `NPM_TOKEN`。使用新建的绑定完成首次发布后，
才能确认 npm 认证配置有效；新绑定须在 npm 规定的 2 天内完成首次成功发布。
配置说明见 [npm Trusted publishing 文档](https://docs.npmjs.com/trusted-publishers)。

每次要发布新版本，在开发分支执行以下命令，并把两个版本文件一起提交到 PR：

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json
```

这会把当前版本例如 `1.0.2` 升为 `1.0.3`；需要更大版本变更时改用 `minor` 或 `major`。
不升级版本号的合入只执行检查，不会产生新版本。workflow 不会自动改版本号或推送 Git 提交。

## Agent Skills

| Skill | 说明 |
|-------|------|
| `cross-bj` | 进京证办理、状态查询、车辆管理、通知配置 |

## License

MIT
