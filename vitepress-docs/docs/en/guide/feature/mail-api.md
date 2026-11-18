# Mail API

## Mailbox Password JWT Validation and Renewal

Mailbox APIs accept legacy mailbox credentials and password sessions containing `type: "address_password_login"`, `address`, `address_id`, `iat`, and `exp`. The backend verifies signatures and mailbox identity, and requires password sessions to be unexpired, issued no later than the current time, and valid for no more than 30 days.

- Mailbox APIs retain `Authorization: Bearer <jwt>` without a database migration.
- `GET /api/settings` returns `address`, `send_balance`, `send_unlimited`, and `new_address_token`. When `send_unlimited` is `true`, sending does not consume a per-mailbox balance. A valid password-session JWT with less than seven days remaining receives a new 30-day token; otherwise the field is `null`. Legacy credentials do not renew, and expired sessions must log in again.
- Clients must replace their current token only when `new_address_token` is non-null; when it is `null`, keep using the current token.

The web client updates only the active JWT from one successful settings response. The local cache retains token strings and its existing append and bind behavior, without replacing or deduplicating historical tokens. Switching to an expired cached session requires logging in again. JWT decoding is only for mailbox, login-method, and token-expiry display; authorization remains on the backend.

With both `ENABLE_ADDRESS_PASSWORD=true` and `ADDRESS_PASSWORD_LOGIN_ONLY=true`, password login, mailbox creation, and authorized user, admin, and Telegram access issue 30-day password-session JWTs for mailbox API access and renewal through settings below seven days. With `ENABLE_ADDRESS_PASSWORD=false`, password login returns 403. With mailbox passwords enabled and `ADDRESS_PASSWORD_LOGIN_ONLY=false`, password login issues legacy credentials. Creation and other authorized entry points issue legacy credentials whenever password-only mode is ineffective. Previously issued valid sessions remain usable and renewable. Legacy credentials, credential-login links, and direct API access remain compatible. API clients must replace their current token only when `new_address_token` is non-null. Changing the mailbox password does not revoke issued JWTs. A session renewed before every expiry has no fixed end date.

The UI keeps session-token access and shows the token expiry time. Auto-login links and QR codes using that token expire at the same time. Password-only mode hides legacy credential contents, connection details, and legacy mailbox-switching options. The management table retains legacy cache entries for manual removal and hides their switch action. The selector still shows the known current mailbox. Disabling the switch restores legacy cache switching.

Telegram retains its separate permanent internal binding tokens. Expiry is ignored only for stored historical bindings read after Telegram authentication, with signature and mailbox identity still checked. New bindings require normal mailbox authentication.

## Viewing Emails via Mail API

This is a `python` example using the `requests` library to view emails.

```python
limit = 10
offset = 0
res = requests.get(
    f"https://<your-worker-address>/api/mails?limit={limit}&offset={offset}",
    headers={
        "Authorization": f"Bearer {your-JWT-password}",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
        "Content-Type": "application/json"
    }
)
```

**Note**: `/api/mails` returns raw RFC822 data by design (for example `source`/`raw`), and it does not guarantee parsed fields such as `subject`, `text`, or `html`. Parse the raw source on the client side (for example with `mail-parser-wasm` or `postal-mime`) if you need readable message content.

## Admin Mail API

Supports `address` filter

```python
import requests

url = "https://<your-worker-address>/admin/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # address is optional parameter
    "address":"xxxx@awsl.uk"
}

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
```

**Note**: `/admin/mails` follows the same design as `/api/mails`: it returns stored raw MIME data. If you need readable subject/body, parse the raw content on the client side.

## Filter by sender, subject, and unread status

`GET /api/mails`, `GET /admin/mails`, and `GET /user_api/mails` accept these optional parameters. Filters apply before pagination, and `count` is the total number of matches.

- `q` matches part of the sender name, sender address, or subject, ignoring case.
- When mail read status is enabled, `unread=1` limits results to unread mail and can be combined with `q`.
- Use `address` to select a mailbox in the admin or user API. Omit it to search all mailboxes accessible to the account.

To upgrade an existing D1 database, apply `db/2026-11-18-mail-search.sql` and run `worker/scripts/backfill-mail-search.mjs` to index existing mail.

## Mail Read Status API

Enable `ENABLE_MAIL_READ_STATUS` and upgrade the database first. Historical mail has `is_unread = NULL` and is treated as read; new mail has `is_unread = 1`. Opening unread mail from the web mail list marks it as read, and its detail view can switch the state manually. Refreshing the page does not mark it as read:

- `PATCH /api/mails/:id/read` sets the status in the current mailbox. Use `PATCH /user_api/mails/:id/read` for linked mailboxes or `PATCH /admin/mails/:id/read` as an administrator.
- All three endpoints accept `{ "isUnread": true }` for unread or `{ "isUnread": false }` for read.

## Mail translation API

The `translation` field of `GET /open_api/settings` is `null` when translation is disabled. When enabled, it lists `provider`, `maxLength`, supported target language codes in `languages`, and the `cacheOnly` capability.

Use `POST /api/translate` for a mailbox, `POST /user_api/translate` for a linked mailbox in the user center, or `POST /admin/translate` in the admin console. Each route uses the corresponding existing authentication.

When translating a saved incoming message, pass its D1 ID as `mailId` to reuse translations. When batching rich text, provide a zero-based `part` number per target language (defaults to 0, maximum 29). The Worker checks access to the message and reuses the D1 translation when the target language and input match. The `X-Mail-Translation-Cache` response header indicates a hit or a newly generated translation. Deleting the message removes its translations. Omit `mailId` for draft translation. Upgrade existing databases to v0.0.16 first.

For a cache lookup, send `mailId` and `cacheOnly: true`. Hits include the actual `targetLanguage`, and misses return HTTP 204. Cache lookups do not call DeepSeek. On part 0, set `fallbackToCachedLanguage: true` to prefer the specified language and fall back to another cached language. Use the returned language for later parts.

In receive-only mode, ordinary users translate incoming messages in linked mailboxes with `POST /user_api/translate`. With a user session, call `GET /user_api/provider_credentials` to check `deepseekConfigured`, `PUT /user_api/provider_credentials/deepseek` with `{"apiKey":"..."}` to save a personal key, or `DELETE` to remove it. The responses expose only configuration status.

```json
{
  "text": "Could we move the meeting to Friday?",
  "targetLanguage": "zh",
  "provider": "deepseek"
}
```

On success the API returns `{ "text": "我们可以把会议改到星期五吗？" }`.

For rich-text translation, provide a `segments` array in place of `text`. Send 1 to 200 plain-text segments per request, with a combined length of at most `maxLength` characters. The response returns translated `segments` in request order so the client can restore the formatting.

Rich-text requests can include a `layout` array with one entry per segment, such as `{ "block": 0, "anchored": true }`. Segments in the same paragraph share a `block`, a zero-based integer smaller than the segment count. Use the boolean `anchored` to keep emphasized text or a link label in its original position. The Worker first translates anchored text in context and fixes that wording in place, then arranges plain text within each paragraph for natural word order. The response format stays the same.

Requests with both anchored and plain segments make two DeepSeek calls.

## AI reply drafting API

With the administrator's DeepSeek key configured, `GET /open_api/settings` exposes `aiReply` with `languages`, `maxSubjectLength`, `maxBodyLength`, and `maxIntentLength`. Otherwise `aiReply` is `null`.

Use `POST /api/ai_reply` for a mailbox, `POST /user_api/ai_reply` in the user center, or `POST /admin/ai_reply` in the admin console. Each endpoint uses its existing authentication.

```json
{
  "subject": "Meeting on Friday",
  "body": "Could we move our meeting to Friday afternoon?",
  "intent": "礼貌回复周五下午可以，请对方确认具体时间。",
  "targetLanguage": "auto"
}
```

Set `targetLanguage` to `auto` to reply in the incoming message's language, or choose a code from `languages`. Omit `intent` or leave it blank to draft from the incoming subject and body alone. The endpoint returns `{ "text": "…", "chineseText": "…" }` for the outgoing draft and its Simplified Chinese preview. The user can insert `text`, edit and confirm it, then send from the original receiving address within the same thread.

## Admin Get Mail API

Fetch a single mail by mail ID without a mailbox JWT. Authenticate with `x-admin-auth`.
The response matches one entry returned by `/admin/mails`: gzip-compressed raw content is decompressed into `raw`, and `raw_blob` is excluded.

```python
import requests

mail_id = 1
url = f"https://<your-worker-address>/admin/mails/{mail_id}"

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.get(url, headers=headers)

print(response.json())
```

## Admin Delete Mail API

Delete a single mail by mail ID.

```python
import requests

mail_id = 1
url = f"https://<your-worker-address>/admin/mails/{mail_id}"

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## Admin Delete Address API

Delete an email address by address ID (also deletes associated mails, sender permissions, and user bindings).

```python
import requests

address_id = 1
url = f"https://<your-worker-address>/admin/delete_address/{address_id}"

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## Admin Clear Inbox API

Clear all received mails for an address by address ID.

```python
import requests

address_id = 1
url = f"https://<your-worker-address>/admin/clear_inbox/{address_id}"

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## Admin Clear Sent Items API

Clear all sent mails for an address by address ID.

```python
import requests

address_id = 1
url = f"https://<your-worker-address>/admin/clear_sent_items/{address_id}"

headers = {
        "x-admin-auth": "<your-Admin-password>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.delete(url, headers=headers)

print(response.json())
```

## User Mail API

::: warning Note: User JWT vs Address JWT
These endpoints use a **User JWT** (obtained via `/user_api/login` after registration), with the `x-user-token` header. Binding an address also requires an Address JWT in the same request.

**Do not confuse with Address JWT**:
- Address JWT uses `Authorization: Bearer <jwt>` to access `/api/*` endpoints
- User JWT uses `x-user-token: <jwt>` to access `/user_api/*` endpoints
:::

### Bind an Email Address to a User Account

Binding associates an existing mailbox with the currently logged-in user account so it can be managed in the user center. For Telegram bindings, see [Telegram Bot](./telegram.md#per-user-mail-push).

`POST /user_api/bind_address` requires both credentials:

| Header | Value |
| --- | --- |
| `x-user-token` | The current account's User JWT, from the `jwt` field returned by `POST /user_api/login` |
| `Authorization` | `Bearer <Address-JWT>`, using the `jwt` returned when [creating a mailbox](./new-address-api.md) or the Address JWT obtained after mailbox login |

No request body is required. User and mailbox identities come from these two JWTs; `user_id`, `address_id`, and email addresses cannot be supplied through the request body. Include `x-custom-auth` if the site requires an access password.

```python
import requests

response = requests.post(
    "https://<your-worker-address>/user_api/bind_address",
    headers={
        "x-user-token": "<your-user-JWT-token>",
        "Authorization": "Bearer <your-address-JWT>",
        # "x-custom-auth": "<your-site-password>",
    },
)
print(response.json())  # {"success": True}
```

Success returns `{"success": true}`; binding the same address to the same user again also succeeds. An address already bound to another user or a user who has reached their address limit results in 400.

### Bound Address List

`GET /user_api/bind_address` uses server-side pagination and accepts these query parameters:

Requests without pagination parameters return the default first page. Fetching all bound addresses in one request is not supported.

| Parameter | Default | Description |
| --- | --- | --- |
| `limit` | `20` | Page size, from 1 to 100 |
| `offset` | `0` | Pagination offset |
| `query` | Empty | Optional email address keyword filter for the current user's bound addresses; at most 100 characters, without `%` or `_` (invalid queries return 400) |

The `results` array contains only the current page. The filtered total is queried only when `offset=0`; later pages return `count: 0`, so clients should retain the total from the first page.

```python
import requests

url = "https://<your-worker-address>/user_api/bind_address"
headers = {
    "x-user-token": "<your-user-JWT-token>",
}
querystring = {
    "limit": "20",
    "offset": "0",
}
response = requests.get(url, headers=headers, params=querystring)
print(response.json())
```

### Get an Address JWT for a Bound Mailbox

`GET /user_api/bind_address_jwt/:address_id` uses the User JWT and only returns credentials for mailboxes bound to the current user. Obtain `address_id` from `results[].id` in the bound address list above. Use the returned `jwt` as `Authorization: Bearer <jwt>` for `/api/*` mailbox endpoints.

```python
import requests

address_id = 1
response = requests.get(
    f"https://<your-worker-address>/user_api/bind_address_jwt/{address_id}",
    headers={
        "x-user-token": "<your-user-JWT-token>",
        # "x-custom-auth": "<your-site-password>",
    },
)
print(response.json())  # {"jwt": "..."}
```

### Unbind an Email Address

`POST /user_api/unbind_address` uses the User JWT with a body of `{"address_id": 1}` and returns `{"success": true}` on success. It removes only the current user's association with the mailbox, without deleting the mailbox or its messages or revoking issued Address JWTs. Save the mailbox credential before unbinding to retain access or bind it again later.

```python
import requests

response = requests.post(
    "https://<your-worker-address>/user_api/unbind_address",
    headers={
        "x-user-token": "<your-user-JWT-token>",
        # "x-custom-auth": "<your-site-password>",
    },
    json={"address_id": 1},
)
print(response.json())  # {"success": True}
```

### User Mail List

Supports `address` filter

```python
import requests

url = "https://<your-worker-address>/user_api/mails"

querystring = {
    "limit":"20",
    "offset":"0",
    # address is optional parameter
    "address":"xxxx@awsl.uk"
}

headers = {
        "x-user-token": "<your-user-JWT-token>",
        # "x-custom-auth": "<your-website-password>", # If private site password is enabled
    }

response = requests.get(url, headers=headers, params=querystring)

print(response.json())
```

**Note**: `/user_api/mails` also returns raw RFC822 content from storage; parse it in your client to extract `subject`, `text`, and `html`.

**Note**: Keyword filtering has been removed from the backend API. If you need to filter emails by content, please use the frontend filter input in the UI, which filters the currently displayed page.
