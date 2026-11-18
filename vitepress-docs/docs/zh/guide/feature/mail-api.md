# 查看邮件 API

## 邮箱密码登录 JWT 的鉴权与续期

邮箱 API 支持两种 JWT：原有邮箱凭据，以及带 `type: "address_password_login"`、`address`、`address_id`、`iat` 和 `exp` 的密码登录会话。后端继续校验签名和邮箱身份，并要求密码登录会话未过期、签发时间不晚于当前时间、有效期不超过 30 天。

- 邮箱 API 继续使用 `Authorization: Bearer <jwt>`，无需数据库迁移。
- `GET /api/settings` 返回 `address`、`send_balance`、`send_unlimited` 和 `new_address_token`。当 `send_unlimited` 为 `true` 时，不扣减单邮箱发信额度。有效密码登录 JWT 剩余不足 7 天时返回新的 30 天 token，否则为 `null`；原有凭据不会续期，已过期 JWT 必须重新登录。
- 仅当 `new_address_token` 非 `null` 时，客户端才应保存它并替换当前 token；为 `null` 时继续使用当前 token。

网页通过一次成功的 settings 请求仅更新当前使用的 JWT。本地缓存继续保存 token 字符串，沿用原来的追加和绑定逻辑，不替换或去重历史 token；切换到已过期的缓存会话后，需要重新登录。JWT 解码仅用于显示邮箱、登录方式和 Token 到期时间，权限由后端校验。

同时启用 `ENABLE_ADDRESS_PASSWORD=true` 和 `ADDRESS_PASSWORD_LOGIN_ONLY=true` 后，密码登录、创建邮箱以及用户、管理员和 Telegram 授权入口签发 30 天密码登录 JWT，可直接用于邮箱 API，并通过 settings 在剩余不足 7 天时续期。关闭 `ENABLE_ADDRESS_PASSWORD` 后，密码登录接口返回 403。邮箱密码功能开启且 `ADDRESS_PASSWORD_LOGIN_ONLY` 关闭时，密码登录继续签发原有凭据。两项配置未同时启用时，创建及其他授权入口继续签发原有凭据。已签发的有效密码会话仍可使用和续期。旧凭据、凭据登录链接与直接 API 访问继续兼容。API 客户端仅在 `new_address_token` 非 `null` 时替换当前 token。修改邮箱密码不会撤销已签发的 JWT，持续在到期前续期的会话没有固定的结束时间。

网页保留会话 Token 查看入口，显示 Token 的实际到期时间。该 Token 生成的自动登录链接和二维码也在同一时间失效。密码模式隐藏旧凭据内容、连接信息和本地旧凭据切换选项。管理列表保留旧缓存条目供手动删除，并隐藏其切换操作。当前已知邮箱仍显示在选择器中。关闭开关后可恢复旧缓存切换。

Telegram 继续使用独立的永久内部绑定 token。仅对验证 Telegram 身份后读取的历史绑定忽略过期时间，并继续验证签名及邮箱身份。新绑定仍须通过正常邮箱鉴权。

## 通过 邮件 API 查看邮件

这是一个 `python` 的例子，使用 `requests` 库查看邮件。

```python
limit = 10
offset = 0
res = requests.get(
    f"https://<你的worker地址>/api/mails?limit={limit}&offset={offset}",
    headers={
        "Authorization": f"Bearer {你的JWT密码}",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
        "Content-Type": "application/json"
    }
)
```

**注意**：`/api/mails` 按设计返回的是原始 RFC822 数据（如 `source`/`raw`），不保证直接包含 `subject`、`text`、`html` 等已解析字段。若要直接读取正文，请在客户端侧解析 `raw`（例如 `mail-parser-wasm`、`postal-mime`）。

## admin 邮件 API

支持 `address` 过滤

```python
import requests

url = "https://<你的worker地址>/admin/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # address 为可选参数
    "address":"xxxx@awsl.uk"
}

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
```

**注意**：`/admin/mails` 与 `/api/mails` 一致，返回的是邮件数据库中的 raw MIME 内容；如需正文/主题等可读字段，请在客户端自行解析 `raw`。

## 按发件人、主题和未读状态筛选

`GET /api/mails`、`GET /admin/mails` 和 `GET /user_api/mails` 支持以下可选参数，筛选在分页前执行，`count` 返回筛选后的总数。

- `q` 匹配发件人名称、发件邮箱或主题的一部分，忽略大小写。
- 启用邮件已读状态后，`unread=1` 只返回未读邮件，可与 `q` 一起使用。
- 管理后台和用户中心可通过 `address` 限制到一个邮箱。省略时，搜索当前账号有权访问的所有邮箱。

升级已有 D1 数据库时，先执行 `db/2026-11-18-mail-search.sql`，再用 `worker/scripts/backfill-mail-search.mjs` 将历史邮件加入搜索索引。

## 邮件已读状态 API

启用 `ENABLE_MAIL_READ_STATUS` 并升级数据库后可使用。历史邮件的 `is_unread` 为 `NULL`，视为已读；新邮件为 `1`。用户在网页邮件列表中点击未读邮件后会将其设为已读，也可以在邮件详情中手动切换状态；刷新页面不会自动标记：

- `PATCH /api/mails/:id/read` 设置当前邮箱中邮件的状态。`PATCH /user_api/mails/:id/read` 用于账号绑定的邮箱，`PATCH /admin/mails/:id/read` 用于管理员管理的邮箱。
- 三个接口均接受 `{ "isUnread": true }`（未读）或 `{ "isUnread": false }`（已读）。

## 邮件翻译 API

`GET /open_api/settings` 的 `translation` 字段为 `null` 时，站点未启用翻译。启用时，该字段包括 `provider`、`maxLength`、目标语言代码 `languages` 和缓存读取能力 `cacheOnly`。

邮箱、绑定邮箱的用户中心和管理后台分别使用 `POST /api/translate`、`POST /user_api/translate` 和 `POST /admin/translate`，并沿用对应页面的鉴权。

翻译已保存的来信时，可传入 `mailId`（D1 中的邮件 ID）来复用译文。富文本分批时，为同一目标语言下的每批传入从 0 开始的 `part`（默认 0，最大 29）。邮件访问权限、目标语言和输入都匹配时，Worker 从 D1 返回已有译文。响应头 `X-Mail-Translation-Cache` 表示命中或新生成。删除邮件时，D1 同步删除所有对应译文。草稿翻译省略 `mailId`。现有数据库需先升级到 v0.0.16。

仅查询缓存时，同时传入 `mailId` 和 `cacheOnly: true`。命中时响应还包含实际的 `targetLanguage`，未命中时返回 HTTP 204，查询不会调用 DeepSeek。第 0 段可传入 `fallbackToCachedLanguage: true`，优先读取指定语言的译文，也可读取其他已缓存的语言。后续分段沿用响应中的语言。

仅收信模式下，普通用户通过 `POST /user_api/translate` 翻译已绑定邮箱的来信。使用用户会话调用 `GET /user_api/provider_credentials` 可查看 `deepseekConfigured`，使用 `PUT /user_api/provider_credentials/deepseek` 及 JSON 请求体 `{"apiKey":"..."}` 保存个人密钥，使用 `DELETE` 删除。响应只包含配置状态。

```json
{
  "text": "Could we move the meeting to Friday?",
  "targetLanguage": "zh",
  "provider": "deepseek"
}
```

成功时返回 `{ "text": "我们可以把会议改到星期五吗？" }`。

富文本翻译使用 `segments` 字符串数组取代 `text`。每次可提交 1 至 200 段纯文本，合计最多 `maxLength` 字符。响应中的 `segments` 按请求顺序返回，便于调用方还原格式。

富文本请求可附带与 `segments` 等长的 `layout` 数组。每项为 `{ "block": 0, "anchored": true }`。同一段落内的片段使用相同的 `block`，其值为从 0 开始且小于片段总数的整数。使用布尔值 `anchored` 标记需要保留原位置的强调文字或链接文字。Worker 先结合上下文翻译标记片段并固定译文，再调整同段普通片段的语序。响应格式保持一致。

同时含标记片段和普通片段时，Worker 会调用 DeepSeek 两次。

## AI 起草回复 API

配置管理员 DeepSeek Key 后，`GET /open_api/settings` 的 `aiReply` 字段会提供 `languages`、`maxSubjectLength`、`maxBodyLength` 和 `maxIntentLength`。未配置时该字段为 `null`。

邮箱、用户中心与管理后台分别调用 `POST /api/ai_reply`、`POST /user_api/ai_reply` 与 `POST /admin/ai_reply`，沿用对应的鉴权方式。

```json
{
  "subject": "Meeting on Friday",
  "body": "Could we move our meeting to Friday afternoon?",
  "intent": "礼貌回复周五下午可以，请对方确认具体时间。",
  "targetLanguage": "auto"
}
```

`targetLanguage` 为 `auto` 时会按原邮件的语言起草，也可以使用 `languages` 中的代码。`intent` 可省略或留空，DeepSeek 会仅根据来信主题和正文起草。接口返回 `{ "text": "…", "chineseText": "…" }`，分别用于回信正文和简体中文预览。用户可将 `text` 插入编辑器，编辑确认后沿用原收件地址和会话发送。

## admin 获取单封邮件 API

无需邮箱 JWT，通过邮件 ID 获取单封邮件，并使用 `x-admin-auth` 认证。
返回结构与 `/admin/mails` 中的单条记录一致：gzip 压缩的原始邮件会解压到 `raw`，响应不包含 `raw_blob`。

```python
import requests

mail_id = 1
url = f"https://<你的worker地址>/admin/mails/{mail_id}"

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.get(url, headers=headers)

print(response.json())
```

## admin 删除邮件 API

通过邮件 ID 删除单封邮件。

```python
import requests

mail_id = 1
url = f"https://<你的worker地址>/admin/mails/{mail_id}"

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## admin 删除邮箱地址 API

通过邮箱地址 ID 删除邮箱地址（同时删除该地址关联的邮件、发件权限和用户绑定）。

```python
import requests

address_id = 1
url = f"https://<你的worker地址>/admin/delete_address/{address_id}"

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## admin 清空收件箱 API

通过邮箱地址 ID 清空该地址的所有收件。

```python
import requests

address_id = 1
url = f"https://<你的worker地址>/admin/clear_inbox/{address_id}"

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## admin 清空发件箱 API

通过邮箱地址 ID 清空该地址的所有发件。

```python
import requests

address_id = 1
url = f"https://<你的worker地址>/admin/clear_sent_items/{address_id}"

headers = {
        "x-admin-auth": "<你的Admin密码>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## user 邮件 API

::: warning 注意：用户 JWT vs 地址 JWT
这些接口使用**用户 JWT**（注册后通过 `/user_api/login` 获得），使用 `x-user-token` header。绑定邮箱时还需要同时提供地址 JWT。

**请勿与地址 JWT 混淆**：
- 地址 JWT 使用 `Authorization: Bearer <jwt>` 访问 `/api/*` 接口
- 用户 JWT 使用 `x-user-token: <jwt>` 访问 `/user_api/*` 接口
:::

### 绑定邮箱到用户账号

这里的“绑定”是把已有邮箱关联到当前登录的用户账号，之后可在用户中心管理；Telegram 绑定请参考 [Telegram Bot](./telegram.md#每用户邮件推送)。

`POST /user_api/bind_address` 必须同时携带两个凭据：

| 请求头 | 内容 |
| --- | --- |
| `x-user-token` | 当前用户账号的 JWT，通过 `POST /user_api/login` 的响应字段 `jwt` 获取 |
| `Authorization` | `Bearer <地址JWT>`，使用[创建邮箱](./new-address-api.md)返回的 `jwt` 或邮箱登录后的地址 JWT |

无需请求体；用户和邮箱身份分别从这两个 JWT 读取，不接受通过请求体指定 `user_id`、`address_id` 或邮箱地址。若站点设置了访问密码，还需携带 `x-custom-auth`。

```python
import requests

response = requests.post(
    "https://<你的worker地址>/user_api/bind_address",
    headers={
        "x-user-token": "<你的用户JWT Token>",
        "Authorization": "Bearer <你的地址JWT>",
        # "x-custom-auth": "<你的网站密码>",
    },
)
print(response.json())  # {"success": True}
```

成功返回 `{"success": true}`；重复绑定到同一用户也返回成功。邮箱已绑定其他用户或已达到该用户可绑定邮箱数量上限时返回 400。

### 用户绑定地址列表

`GET /user_api/bind_address` 使用服务端分页，支持以下查询参数：

未携带分页参数时返回默认第一页，不支持一次获取全部绑定地址。

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `limit` | `20` | 每页数量，范围为 1–100 |
| `offset` | `0` | 分页偏移量 |
| `query` | 空 | 可选，按邮箱地址关键字筛选当前用户已绑定的地址；最长 100 个字符，不可包含 `%` 或 `_`，非法查询返回 400 |

响应中的 `results` 仅包含当前页。仅 `offset=0` 时查询筛选后的总数，后续页面的 `count` 为 `0`，客户端应保留第一页返回的总数。

```python
import requests

url = "https://<你的worker地址>/user_api/bind_address"
headers = {
    "x-user-token": "<你的用户JWT Token>",
}
querystring = {
    "limit": "20",
    "offset": "0",
}
response = requests.get(url, headers=headers, params=querystring)
print(response.json())
```

### 获取已绑定邮箱的地址 JWT

`GET /user_api/bind_address_jwt/:address_id` 使用用户 JWT，只有当前用户绑定的邮箱才可获取。`address_id` 取自上方绑定地址列表的 `results[].id`。返回的 `jwt` 可用于 `Authorization: Bearer <jwt>` 调用 `/api/*` 邮箱接口。

```python
import requests

address_id = 1
response = requests.get(
    f"https://<你的worker地址>/user_api/bind_address_jwt/{address_id}",
    headers={
        "x-user-token": "<你的用户JWT Token>",
        # "x-custom-auth": "<你的网站密码>",
    },
)
print(response.json())  # {"jwt": "..."}
```

### 解绑邮箱

`POST /user_api/unbind_address` 使用用户 JWT，请求体为 `{"address_id": 1}`，成功返回 `{"success": true}`。此操作只移除当前用户与邮箱的关联，不删除邮箱或邮件，也不撤销已签发的地址 JWT。解绑前请保存邮箱凭据，以便之后继续访问或重新绑定。

```python
import requests

response = requests.post(
    "https://<你的worker地址>/user_api/unbind_address",
    headers={
        "x-user-token": "<你的用户JWT Token>",
        # "x-custom-auth": "<你的网站密码>",
    },
    json={"address_id": 1},
)
print(response.json())  # {"success": True}
```

### 用户邮件列表

支持 `address` 过滤

```python
import requests

url = "https://<你的worker地址>/user_api/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # address 为可选参数
    "address":"xxxx@awsl.uk"
}

headers = {
        "x-user-token": "<你的用户JWT Token>",
        # "x-custom-auth": "<你的网站密码>", # 如果启用了私有站点密码
    }

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
```

**注意**：`/user_api/mails` 同样返回原始 RFC822 内容；请在客户端解析后提取 `subject`、`text`、`html`。

**注意**：后端 API 已移除关键词过滤功能。如需按内容过滤邮件，请使用前端界面的过滤输入框，该功能可过滤当前显示的页面。
