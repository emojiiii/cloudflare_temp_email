# 发送邮件 API

## 通过 HTTP API 发送邮件

有三种 HTTP API 端点可以发送邮件，区别如下：

| 端点 | 认证方式 | 适用场景 |
|------|---------|---------|
| `/api/send_mail` | `Authorization: Bearer <地址JWT>` header | 内部调用，需要先通过 cookie / header 鉴权 |
| `/external/api/send_mail` | 请求体中的 `token` 字段 | 外部系统集成，无需 header 鉴权 |
| `/user_api/address/:address_id/send_mail` | `x-user-token: <用户JWT>` header | 已登录用户使用自己的绑定邮箱发信 |

::: tip 什么是"地址 JWT"？
地址 JWT 是通过 `/api/new_address` 或 `/admin/new_address` 创建邮箱地址时返回的 `jwt` 字段。
你可以在前端 UI 的「密码」菜单中查看它。它**不是** `JWT_SECRET` 环境变量，也**不是** admin 密码。
:::

### 方式一：通过 Header 认证（`/api/send_mail`）

```python
send_body = {
    "from_name": "发件人名字",
    "to_name": "收件人名字",
    "to_mail": "收件人地址",
    "subject": "邮件主题",
    "is_html": False,  # 根据内容设置是否为 HTML
    "content": "<邮件内容：html 或者 文本>",
}

res = requests.post(
    "https://你的worker域名/api/send_mail",
    json=send_body, headers={
        "Authorization": f"Bearer {地址JWT}",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
        "Content-Type": "application/json"
    }
)
```

### 方式二：通过 Body Token 认证（`/external/api/send_mail`）

适合外部系统调用，将地址 JWT 放在请求体的 `token` 字段中：

```python
send_body = {
    "token": "<地址JWT>",
    "from_name": "发件人名字",
    "to_name": "收件人名字",
    "to_mail": "收件人地址",
    "subject": "邮件主题",
    "is_html": False,  # 根据内容设置是否为 HTML
    "content": "<邮件内容：html 或者 文本>",
}
res = requests.post(
    "https://你的worker域名/external/api/send_mail",
    json=send_body, headers={
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
        "Content-Type": "application/json"
    }
)
```

### 方式三：使用用户 JWT（`/user_api/address/:address_id/send_mail`）

`address_id` 可从分页接口 `GET /user_api/bind_address` 的结果中获取。后端会验证该地址属于当前用户，客户端不能自行指定发件邮箱。

如果站点通过 `NO_LIMIT_SEND_ROLE` 为当前用户角色配置了无限发信额度，还需要传入 `GET /user_api/settings` 返回的 `access_token`。前端会自动处理该令牌。

```python
send_body = {
    "from_name": "发件人名字",
    "to_name": "收件人名字",
    "to_mail": "收件人地址",
    "subject": "邮件主题",
    "is_html": False,
    "content": "邮件内容",
}

res = requests.post(
    "https://你的worker域名/user_api/address/123/send_mail",
    json=send_body,
    headers={
        "x-user-token": "<用户JWT>",
        # "x-user-access-token": "<用户访问令牌>",  # 使用角色权限时需要
        "Content-Type": "application/json",
    },
)
```

同一组用户地址接口还包括：

| 方法 | 端点 | 说明 |
| --- | --- | --- |
| `GET` | `/user_api/address/:address_id/settings` | 获取地址、剩余发信额度和 `send_unlimited` |
| `POST` | `/user_api/address/:address_id/request_send_mail_access` | 为该地址申请发信权限 |
| `GET` | `/user_api/sendbox?limit=20&offset=0&address=可选地址` | 分页获取当前用户的发件箱，可按绑定地址过滤 |
| `DELETE` | `/user_api/sendbox/:mail_id` | 删除当前用户的一条发件记录 |

以上接口都需要用户 JWT。地址级接口验证 `address_id` 是否绑定到当前用户，用户级发件箱接口只返回或删除当前用户绑定地址的记录；用户访问令牌仅用于应用可选的角色权限。

### 管理员选择发件地址

`GET /admin/send_mail/options` 和 `POST /admin/send_mail` 使用相同的管理员认证。返回的 `domains` 是已配置发信服务的域名，`addresses` 最多包含这些域名下的 20 个已有邮箱。可选参数 `query` 支持按地址片段搜索，忽略大小写。

管理员写信时，可以选择已有邮箱，也可以填写前缀并选择发件域名。常用地址和默认发件地址保存在当前管理员账号中，换浏览器登录后也可以使用。默认值用于新写的邮件，回复会预选原来的收件地址。

`GET /admin/send_mail/preferences` 返回当前账号的 `addresses` 和 `defaultAddress`。没有默认值时，`defaultAddress` 为 `null`。

`PATCH /admin/send_mail/preferences` 接受完整的发件邮箱 `address` 和下列任一 `action`。请求成功后返回更新后的偏好。

- `add` 添加常用发件地址。
- `remove` 移除常用地址。如果移除了默认地址，也会清除默认值。
- `set-default` 将地址添加到常用地址并设为默认。

两个接口要求有效的管理员密码或管理员角色账号令牌。角色账号分别保存设置。升级已有 D1 数据库时，可在管理后台运行数据库迁移，或执行 `db/2026-11-18-admin-sender-preferences.sql`。

## 回信

在邮箱、用户中心或管理后台打开邮件，点击「回信」。写信界面会优先使用原邮件的 `Reply-To`，其次使用 `From`，并为主题补上 `Re:`。回复正文初始为空。原邮件带有有效 Message-ID 时，回信会带上会话关联邮件头。

上面的 HTTP 发信端点和管理后台的 `POST /admin/send_mail` 均接受可选字段。

| 字段 | 格式 |
| --- | --- |
| `reply_mail_id` | 原邮件在本站的数字 ID，用于标记该发件邮箱内的原邮件 |
| `in_reply_to` | 被回复邮件的 Message-ID，例如 `"<original@example.com>"` |
| `references` | 原邮件 `References` 头中的 Message-ID 数组，从旧到新排列 |

服务端会把 `in_reply_to` 加到 `References` 末尾。普通发信可以省略这些字段。回复提交成功后，列表中的原邮件会显示 `is_replied: 1`。

发件箱可以查看邮件的 `send_status`。`accepted` 表示服务商已接收提交，`failed` 表示提交失败，`unknown` 表示无法确认提交结果。升级现有数据库时应用 `db/2026-11-18-mail-send-status.sql`。

## Resend 服务密钥

使用管理员密码登录后，可在 **设置 → 服务密钥** 按域名配置 Resend Key，保存后立即生效。也可以调用 `GET /admin/provider_credentials` 查看配置状态，通过 `PUT /admin/provider_credentials/resend/:domain` 和 JSON 请求体 `{"apiKey":"..."}` 保存密钥，或使用 `DELETE` 删除。管理员的 DeepSeek Key 使用相同方法操作 `/admin/provider_credentials/deepseek`。迁移旧变量时，调用 `POST /admin/provider_credentials/migrate`。请先完成[密钥存储设置](/zh/guide/worker-vars#服务密钥和仅收信模式)。

## Resend 投递状态

应用 `db/2026-11-18-resend-delivery.sql` 后，在 [Resend Webhooks](https://resend.com/webhooks) 添加 `https://<邮箱站点>/open_api/resend_webhook`，订阅 `email.delivered`、`email.bounced`、`email.failed`、`email.delivery_delayed`、`email.suppressed` 和 `email.complained`。把签名密钥存为 Worker Secret `RESEND_WEBHOOK_SECRET`。同一个 Resend 账号内的多个发件域名共用这一端点。

发件箱按 Resend 邮件 ID 匹配投递事件。收到事件后，`delivery_status` 显示投递状态，`delivery_updated_at` 记录事件时间，`delivery_reason` 在服务商提供时显示原因。「已送达」表示对方的邮件服务器已接收邮件。未保存 Resend 邮件 ID 的旧记录继续显示提交状态。[Resend 送达事件](https://resend.com/docs/webhooks/emails/delivered)

## 通过 SMTP 发送邮件

请先参考 [配置 SMTP 代理](/zh/guide/feature/config-smtp-proxy.html)。

这是一个 `python` 的例子，使用 `smtplib` 库发送邮件。

`JWT令牌密码`: 即为邮箱登录密码，可以在 UI 界面中查看密码菜单中查看。

```python
import smtplib

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


with smtplib.SMTP('localhost', 8025) as smtp:
    smtp.login("jwt", "此处填写你的JWT令牌密码")
    message = MIMEMultipart()
    message['From'] = "Me <me@awsl.uk>"
    message['To'] = "Admin <admin@awsl.uk>"
    message['Subject'] = "测试主题"
    message.attach(MIMEText("测试内容", 'html'))
    smtp.sendmail("me@awsl.uk", "admin@awsl.uk", message.as_string())
```
