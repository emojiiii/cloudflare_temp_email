# Send Email API

## Send Email via HTTP API

There are three HTTP API endpoints for sending emails:

| Endpoint | Authentication | Use Case |
|----------|---------------|----------|
| `/api/send_mail` | `Authorization: Bearer <address_JWT>` header | Internal calls, requires cookie / header auth |
| `/external/api/send_mail` | `token` field in request body | External system integration, no header auth needed |
| `/user_api/address/:address_id/send_mail` | `x-user-token: <user_JWT>` header | Signed-in users sending from one of their bound addresses |

::: tip What is "Address JWT"?
The Address JWT is the `jwt` field returned when creating an email address via `/api/new_address` or `/admin/new_address`.
You can view it in the "Password" menu in the frontend UI. It is **NOT** the `JWT_SECRET` environment variable, nor the admin password.
:::

### Method 1: Header Authentication (`/api/send_mail`)

```python
send_body = {
    "from_name": "Sender Name",
    "to_name": "Recipient Name",
    "to_mail": "Recipient Address",
    "subject": "Email Subject",
    "is_html": False,  # Set whether it's HTML based on content
    "content": "<Email content: html or text>",
}

res = requests.post(
    "https://your_worker_domain/api/send_mail",
    json=send_body, headers={
        "Authorization": f"Bearer {address_JWT}",
        # "x-custom-auth": "<your_website_password>", # If private site password is enabled
        "Content-Type": "application/json"
    }
)
```

### Method 2: Body Token Authentication (`/external/api/send_mail`)

Suitable for external system calls, place the Address JWT in the `token` field of the request body:

```python
send_body = {
    "token": "<address_JWT>",
    "from_name": "Sender Name",
    "to_name": "Recipient Name",
    "to_mail": "Recipient Address",
    "subject": "Email Subject",
    "is_html": False,  # Set whether it's HTML based on content
    "content": "<Email content: html or text>",
}
res = requests.post(
    "https://your_worker_domain/external/api/send_mail",
    json=send_body, headers={
        # "x-custom-auth": "<your_website_password>", # If private site password is enabled
        "Content-Type": "application/json"
    }
)
```

### Method 3: User JWT (`/user_api/address/:address_id/send_mail`)

Obtain `address_id` from the paginated `GET /user_api/bind_address` response. The backend verifies that the address belongs to the current user; clients cannot choose an arbitrary sender address.

If the site grants unlimited sending to the current user's role through `NO_LIMIT_SEND_ROLE`, also send the `access_token` returned by `GET /user_api/settings`. The frontend handles this token automatically.

```python
send_body = {
    "from_name": "Sender Name",
    "to_name": "Recipient Name",
    "to_mail": "Recipient Address",
    "subject": "Email Subject",
    "is_html": False,
    "content": "Email content",
}

res = requests.post(
    "https://your_worker_domain/user_api/address/123/send_mail",
    json=send_body,
    headers={
        "x-user-token": "<user_JWT>",
        # "x-user-access-token": "<user_access_token>",  # Required for role permissions
        "Content-Type": "application/json",
    },
)
```

The same user-address API group also provides:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/user_api/address/:address_id/settings` | Get the address, remaining send balance, and `send_unlimited` |
| `POST` | `/user_api/address/:address_id/request_send_mail_access` | Request send access for the address |
| `GET` | `/user_api/sendbox?limit=20&offset=0&address=optional-address` | List the current user's sent items, optionally filtered by a bound address |
| `DELETE` | `/user_api/sendbox/:mail_id` | Delete one sent item owned by the current user |

All endpoints require a User JWT. Address-scoped endpoints verify that `address_id` is bound to the current user, while user-level sent-item endpoints only return or delete records for the user's bound addresses. The user access token is only used to apply optional role permissions.

### Administrator sender selection

`GET /admin/send_mail/options` uses the same administrator authentication as `POST /admin/send_mail`. It returns `domains`, the configured domains with an available sending provider, and `addresses`, up to 20 existing addresses on those domains. The optional `query` parameter searches addresses by case-insensitive substring.

In the administrator composer, choose an existing address or enter an address prefix and select a sending domain. Favorites and the default sender follow the administrator account across browsers. New drafts start with the default, and replies start with the original receiving address.

`GET /admin/send_mail/preferences` returns the current account's `addresses` and `defaultAddress`. When no default is set, `defaultAddress` is `null`.

`PATCH /admin/send_mail/preferences` accepts a full sender `address` and one of the following values for `action`. It returns the updated preferences.

- `add` adds a favorite sender address.
- `remove` removes a favorite and clears the default if that address was selected as default.
- `set-default` adds the address to favorites and makes it the default.

Both endpoints require an administrator password or a valid administrator role token. Each role account has its own preferences. To upgrade an existing D1 database, run the migration in the admin console or apply `db/2026-11-18-admin-sender-preferences.sql`.

## Reply to a message

Open a message in the mailbox, user center, or admin console and select **Reply**. The composer uses the original `Reply-To` address when available and falls back to `From`. It prefixes the subject with `Re:` and starts with a blank body. The reply includes conversation headers when the original has a valid Message-ID.

The HTTP endpoints above and `POST /admin/send_mail` accept these optional fields.

| Field | Format |
| --- | --- |
| `reply_mail_id` | The numeric ID of the original message in the sending mailbox, used to mark it as replied |
| `in_reply_to` | Message-ID of the original mail, for example `"<original@example.com>"` |
| `references` | Array of Message-IDs from the original `References` header, oldest first |

The server appends `in_reply_to` to `References`. Omit these fields when composing a new email. A successfully submitted reply is marked `is_replied: 1` on the original message in the list.

Sent records include `send_status`. `accepted` means the provider accepted the submission, `failed` means the submission failed, and `unknown` means the result could not be confirmed. Apply `db/2026-11-18-mail-send-status.sql` when upgrading an existing database.

## Resend provider keys

Sign in with the administrator password and use **Settings → Provider keys** to update the Resend key for each domain. Updates take effect immediately. Alternatively, call `GET /admin/provider_credentials` for configuration status, `PUT /admin/provider_credentials/resend/:domain` with `{"apiKey":"..."}` to save a key, or `DELETE` to remove it. Use the same methods on `/admin/provider_credentials/deepseek` to manage the administrator DeepSeek key. Call `POST /admin/provider_credentials/migrate` to migrate legacy secrets. Complete [provider key storage setup](/en/guide/worker-vars#provider-keys-and-receive-only-mode) first.

## Resend delivery status

Apply `db/2026-11-18-resend-delivery.sql`. In [Resend Webhooks](https://resend.com/webhooks), add `https://<mail-site>/open_api/resend_webhook` and subscribe to `email.delivered`, `email.bounced`, `email.failed`, `email.delivery_delayed`, `email.suppressed`, and `email.complained`. Store the signing secret as the Worker Secret `RESEND_WEBHOOK_SECRET`. Sending domains within the same Resend account share the endpoint.

Sent mail matches delivery events by Resend email ID. `delivery_status` shows the delivery outcome, `delivery_updated_at` contains the event time, and `delivery_reason` contains the provider's reason when available. Delivered means the recipient's mail server accepted the message. Historical messages without a saved Resend email ID continue to show their submission status. [Resend delivery event](https://resend.com/docs/webhooks/emails/delivered)

## Send Email via SMTP

Please first refer to [Configure SMTP Proxy](/en/guide/feature/config-smtp-proxy.html).

This is a `python` example using the `smtplib` library to send emails.

`JWT Token Password`: This is the email login password, which can be viewed in the password menu in the UI interface.

```python
import smtplib

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


with smtplib.SMTP('localhost', 8025) as smtp:
    smtp.login("jwt", "Enter your JWT token password here")
    message = MIMEMultipart()
    message['From'] = "Me <me@awsl.uk>"
    message['To'] = "Admin <admin@awsl.uk>"
    message['Subject'] = "Test Subject"
    message.attach(MIMEText("Test Content", 'html'))
    smtp.sendmail("me@awsl.uk", "admin@awsl.uk", message.as_string())
```
