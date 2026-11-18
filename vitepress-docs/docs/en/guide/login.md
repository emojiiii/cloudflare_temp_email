# Login Entry Points and Credentials

Use the standalone `/login` page to sign in to a user account or the admin console.

| Entry point | Purpose | Credentials |
|-------------|---------|-------------|
| `/login` (or `/:lang/login`) | Sign in or register | Account email and password, or username `admin` and the administrator password |
| `/` (or `/:lang/`) | Open one mailbox and access its inbox, sent mail, and mailbox settings | Mailbox session token (Address JWT). Enabling `ENABLE_ADDRESS_PASSWORD` also allows mailbox-password login; enabling `ADDRESS_PASSWORD_LOGIN_ONLY` at the same time makes the login page password-only. |
| `/user` (or `/:lang/user`) | Sign in to the User Center and manage multiple mailboxes linked to one user account | Available when `DISABLE_USER_SYSTEM` is not enabled; uses account email and password, passkey, or a configured OAuth2 provider |
| `/admin` (or `/:lang/admin`) | Open the Admin Console | Username `admin` and an administrator password from `ADMIN_PASSWORDS`. When the user system is enabled, a user with the `ADMIN_USER_ROLE` role can also sign in. |

The User Center and the Admin Console open `/login` for signed-out visitors. The admin entry prefills the username `admin`.

After signing in with the administrator password, the same session opens the Inbox and User Center. Filter mail by address in the Inbox or choose an address in the User Center to open its inbox.

`PASSWORDS` controls the separate site access prompt. To make the sign-in and registration pages public, remove `PASSWORDS` and keep the administrator password. Enable registration under **Admin → User → User Settings → Allow User Registration**. Set `DISABLE_ANONYMOUS_USER_CREATE_EMAIL=true` to require a user account before someone can create a mailbox.

The account email used to sign in to the User Center is not automatically a sending or receiving address. After signing in, you can view mail from the **Inbox** tab; to open one mailbox directly, select **Open Mailbox** from the mailbox list. Signing in to one mailbox does not sign in to the User Center either.
