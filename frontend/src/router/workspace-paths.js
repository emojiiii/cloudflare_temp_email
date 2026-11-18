import { getPathWithLocale } from '../i18n/utils'

export const mailboxPaths = {
    mailbox: '/',
    sendbox: '/sent',
    sendmail: '/compose',
    accountSettings: '/settings',
    appearance: '/settings/appearance',
    auto_reply: '/settings/auto-reply',
    webhook: '/settings/webhook',
    s3_attachment: '/settings/attachments',
    about: '/about',
}

export const userPaths = {
    address_management: '/user',
    user_mail_box_tab: '/user/inbox',
    user_sendbox: '/user/sent',
    user_send_mail: '/user/compose',
    user_settings: '/user/settings',
    bind_address: '/user/bind-address',
}

// /admin/* belongs to the API on Workers and Pages.
export const adminPaths = {
    mails: {
        mails: '/manage/mail',
        sendBox: '/manage/mail/sent',
        sendMail: '/manage/compose',
    },
    account: {
        account: '/manage/mailboxes',
        account_create: '/manage/mailboxes/create',
        account_settings: '/manage/mailboxes/settings',
        senderAccess: '/manage/mailboxes/sending',
        ipBlacklistSettings: '/manage/mailboxes/ip-blocklist',
        aiExtractSettings: '/manage/mailboxes/ai-extraction',
        webhook: '/manage/mailboxes/webhook',
    },
    user: {
        user_management: '/manage/users',
        user_settings: '/manage/users/settings',
        userOauth2Settings: '/manage/users/oauth',
        roleAddressConfig: '/manage/users/roles',
    },
    settings: {
        settings: '/manage/settings',
        unknow: '/manage/settings/unassigned',
        providers: '/manage/settings/providers',
        mailWebhook: '/manage/settings/webhook',
        telegram: '/manage/settings/telegram',
        statistics: '/manage/settings/statistics',
        database: '/manage/settings/database',
        workerconfig: '/manage/settings/worker',
        maintenance: '/manage/settings/maintenance',
        appearance: '/manage/settings/appearance',
        adminAccount: '/manage/settings/admin',
        redeemCodes: '/manage/settings/redemption-codes',
        about: '/manage/settings/about',
    },
}

export const adminPathAliases = {
    unknow: ['/manage/mail/unassigned'],
    mailWebhook: ['/manage/mail/webhook'],
    telegram: ['/manage/telegram'],
    statistics: ['/manage/statistics'],
    database: ['/manage/setup'],
    account_settings: ['/manage/setup/mailboxes'],
    user_settings: ['/manage/setup/users'],
    workerconfig: ['/manage/setup/worker', '/manage/maintenance/worker'],
    maintenance: ['/manage/maintenance', '/manage/maintenance/tasks'],
    appearance: ['/manage/appearance'],
    adminAccount: ['/manage/account'],
    redeemCodes: ['/manage/redeem-codes'],
    about: ['/manage/about'],
}

export const mailboxLocation = (section, locale) => ({ path: getPathWithLocale(mailboxPaths[section], locale) })
export const userLocation = (section, locale) => ({ path: getPathWithLocale(userPaths[section], locale) })
export const adminWorkspaceLocation = (section, view, locale) => ({
    path: getPathWithLocale(view ? adminPaths[section][view] : Object.values(adminPaths[section])[0], locale),
})
