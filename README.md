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

# 3. 一键续签
cross-bj run

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
  [--plate <plate>]                 #   指定车牌（默认首选车辆）
  [--entry-type <六环内|六环外>]      #   指定进京证类型（默认使用配置值）
  [--no-notify]                     #   不发送通知
```

无参数执行 `cross-bj` 等同于 `cross-bj run`。

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

## 智能续签逻辑

`cross-bj run` 自动判断是否需要续签：

| 当前状态 | 行为 |
|----------|------|
| 无记录（新车） | 申请今天的进京证 |
| 审核通过（生效中），剩余 ≤ 1 天 | 提前申请明天的进京证 |
| 审核通过（生效中），剩余 > 1 天 | 无需续签 |
| 审核中 / 待生效 | 无需续签 |
| 已失效 / 审核失败 | 申请今天的进京证 |
| 剩余次数和天数均为 0 | 无法续签（配额用完） |

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

配置存储在 `~/.cross-bj/config.json`，由 `cross-bj init` 自动创建，无需手动编辑。

## Agent Skills

| Skill | 说明 |
|-------|------|
| `cross-bj` | 进京证办理、状态查询、车辆管理、通知配置 |

## License

MIT
