# Rin 博客 Webhook 通知配置指南:对接钉钉机器人

> 本文介绍如何在 Rin 博客中配置 Webhook,实现评论和友链申请的实时通知,并以钉钉群机器人为例给出完整配置和多种消息模板示例。

## 效果预览

配置完成后,每当有新评论或友链申请,你的钉钉群会立即收到这样的卡片消息:

> ### comment.created
> **张三**: 这篇文章写得真好,收藏了!
>
> > [EasyTier 组网配置教程](https://your-blog.com/feed/31)

## 一、创建钉钉群机器人

1. 打开钉钉群 → **群设置** → **机器人** → **添加机器人** → 选择**自定义**(Custom Robot)
2. 安全设置**务必选择「自定义关键词」**,例如填 `Rin`(这是三种安全策略中唯一适合服务端 Webhook 的,原因见后文)
3. 创建后会得到一个 Webhook 地址,形如:

```
https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxx
```

> ⚠️ **安全提醒**:access_token 等同于这个机器人的"密码",任何拿到它的人都可以往你的群里发消息。不要把完整地址提交到公开仓库或贴到公开场合;如果泄露了,删掉机器人重建一个即可。

## 二、在 Rin 后台填写 Webhook 配置

进入 Rin 管理后台的设置页面,找到 Webhook 相关配置项:

| 配置项 | 填写值 |
|---|---|
| Webhook 地址 | `https://oapi.dingtalk.com/robot/send?access_token=你的token` |
| Webhook Method | `POST` |
| Content-Type | `application/json` |
| 请求头 | `{}` |
| 请求体模板 | 见下方模板,任选其一 |

填好后点击**「发送测试 Webhook」**,群里收到消息即配置成功。

## 三、请求体模板示例

### 示例 1:纯文本(最简单)

```json
{"msgtype":"text","text":{"content":"【Rin】{{message}}"}}
```

`{{message}}` 是服务端拼好的完整通知文本,包含文章链接、评论者和评论内容,一行看全所有信息。

### 示例 2:Markdown 卡片(推荐)

```json
{"msgtype":"markdown","markdown":{"title":"【Rin】{{event}}","text":"### {{event}}\n\n**{{username}}**: {{content}}\n\n> [{{title}}]({{url}})"}}
```

消息以卡片形式呈现:标题是事件类型,正文突出评论者名字和内容,底部附文章链接。

### 示例 3:极简风格

```json
{"msgtype":"markdown","markdown":{"title":"【Rin】新通知","text":"**{{username}}**: {{content}}\n\n> [{{title}}]({{url}})"}}
```

不显示事件类型,适合只想快速看到"谁说了什么"的场景。

### 示例 4:带描述的友链申请通知

```json
{"msgtype":"markdown","markdown":{"title":"【Rin】{{event}}","text":"### {{event}}\n\n**申请人**: {{username}}\n\n**站点**: [{{title}}]({{url}})\n\n**简介**: {{description}}"}}
```

友链申请事件会用 `{{description}}` 传递站点简介,评论事件中该字段为空。

### 示例 5:接入企业微信机器人

如果用的是企业微信而不是钉钉,格式不同,Webhook 地址填 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key`,请求体模板:

```json
{"msgtype":"markdown","markdown":{"content":"**{{username}}**: {{content}}\n> [{{title}}]({{url}})"}}
```

### 示例 6:GET 拼接(轻量场景)

某些接口只接受 GET 请求,可以直接在 Webhook 地址里拼模板变量:

```
https://example.com/notify?event={{event}}&title={{title}}&user={{username}}
```

Method 填 `GET`,请求体模板留空即可。

## 四、可用模板变量一览

Rin 在发送 Webhook 时会填充以下变量,任何配置项(地址、请求头、请求体)中都可用:

| 变量 | 说明 | 评论事件的值 | 友链事件的值 |
|---|---|---|---|
| `{{event}}` | 事件类型 | `comment.created` | `friend.created` / `friend.updated` |
| `{{message}}` | 服务端拼好的完整消息 | 文章链接+评论者+内容 | 友链页链接+站点信息 |
| `{{username}}` | 操作者 | 评论者昵称(注册用户或游客) | 友链申请人 |
| `{{title}}` | 关联标题 | 文章标题 | 友链站点名 |
| `{{url}}` | 关联链接 | 文章地址 | 友链页地址 |
| `{{content}}` | 核心内容 | 评论正文 | 友链站点 URL |
| `{{description}}` | 补充描述 | 空 | 站点简介 |

## 五、常见问题排查

**钉钉返回 310000(sign 不匹配 / 关键词不匹配)**
自定义关键词安全设置要求消息里必须包含关键词。确认请求体模板中出现了你在钉钉后台设置的关键词(如模板里的 `【Rin】`),且关键词与钉钉后台填写的完全一致。

**为什么不能用「加签」安全方式?**
加签要求每次请求动态计算 `timestamp + HMAC-SHA256` 签名。Rin 的模板变量只做文本替换,无法计算签名,所以请使用自定义关键词方式。

**为什么不能用「IP 白名单」?**
Rin 部署在 Cloudflare Workers 上,出口 IP 不固定,白名单无法覆盖。

**测试发送成功但群里收不到**
检查 Content-Type 是否为 `application/json`;用浏览器直接访问 Webhook 地址会报错是正常的,钉钉只接受 POST。

**消息里 JSON 被截断或报错**
不用担心引号和换行问题——Rin 渲染模板时会自动对变量值做 JSON 字符串转义,评论内容里包含特殊字符也不会破坏请求体。

## 六、注意事项

- 验证配置时,用另一个账号(或游客身份)发一条真实评论,确认两种来源的通知都正常
- 评论和友链通知共用同一套 Webhook 配置,模板中未使用的变量会被替换为空字符串
- Webhook 请求失败不会影响评论提交,失败信息只记录在 Worker 日志中
