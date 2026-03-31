---
name: cross-bj
version: 1.0.0
description: "进京证 CLI 工具：办理/续签进京证、查看状态、管理车辆、配置通知。当用户提到进京证、北京通行证、车辆进京、六环、进京许可等关键词时触发。"
---

# cross-bj 进京证 CLI

帮助用户通过命令行办理和管理北京车辆进京证（进京通行证）。

## 安装检测

使用前先检查是否已安装：

```bash
which cross-bj
```

如果未安装：

```bash
npm install -g cross-bj
```

## 初始化检测

```bash
cross-bj status
```

如果返回"未初始化"错误，询问用户的北京通手机号和密码，然后执行：

```bash
cross-bj init --phone <phone> --password <password>
```

可选参数：`--entry-type <六环内|六环外>`、`--notify <url>`（可多次指定）、`-f`（强制覆盖已有配置）

注意：已初始化时非交互式 init 会被拦截，需加 `-f` 强制覆盖。

## 命令参考

### 续签进京证

```bash
cross-bj run                                # 智能续签 + 通知
cross-bj run --no-notify                    # 只续签不通知
cross-bj run --plate <plate>                # 指定车牌
cross-bj run --entry-type 六环外             # 指定类型
```

自动判断是否需要续签：生效中且剩余≤1天→申请明天的，无记录→申请今天的，审核中/待生效→不申请。

### 查看状态

```bash
cross-bj status                             # 进京证状态
cross-bj status -v                          # 含配置信息
cross-bj status -n                          # 状态通过通知渠道发送
cross-bj status --plate <plate>             # 指定车牌
```

### 车辆管理

```bash
cross-bj vehicle list                       # 查看绑定车辆
cross-bj vehicle add --plate <plate> --engine <engine> --brand <brand> --reg-date <YYYY-MM-DD>
cross-bj vehicle remove <plate>             # 删除车辆
cross-bj vehicle set <plate>                # 设置首选车辆
cross-bj vehicle swap <newPlate>            # 换牌（保留其他信息）
cross-bj vehicle swap <newPlate> --from <oldPlate>  # 指定替换哪辆
```

`vehicle add` 可选参数：`--plate-type`（号牌种类，8位车牌默认新能源）、`--vehicle-type`（车辆类型，默认客车）

### 通知管理

```bash
cross-bj notify add <url>                   # 添加通知渠道
cross-bj notify remove <url>                # 删除通知渠道
cross-bj notify test                        # 测试通知
```

通知 URL 格式兼容 [Apprise](https://github.com/caronc/apprise/wiki)：`bark://`、`tgram://`、`dingtalk://`、`wecom://`、`feishu://`、`slack://`、`json://`

### 配置

```bash
cross-bj set entry-type <六环内|六环外>
```

### 定时任务

```bash
cross-bj cron setup                         # 每天 9:00 自动续签
cross-bj cron setup --schedule '0 8 * * *'  # 自定义时间
cross-bj cron status
cross-bj cron remove
```

## 安全规则

- 不要在终端明文输出用户密码
- 执行 `run` 前确认用户意图
- 不要修改用户已有的通知配置，除非用户明确要求
