import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
    AdminPanelSettingsOutlined, BarChartOutlined, CleaningServicesOutlined, CodeOutlined, ConfirmationNumberOutlined,
    DnsOutlined, GroupOutlined, InboxOutlined, InfoOutlined, KeyOutlined, LinkOutlined, MailOutlineRound,
    ReportProblemOutlined, SendOutlined, SettingsOutlined, StyleOutlined,
} from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '@/store'
import { adminWorkspaceLocation } from '@/router/workspace-paths'

export function useAdminNavigation() {
    const route = useRoute()
    const { openSettings, showUserSystem } = useGlobalState()
    const { t, locale } = useScopedI18n('views.Admin')
    const { t: inboxText } = useScopedI18n('views.Index')
    const view = (key, label = key) => ({ key, label: t(label) })

    const sections = computed(() => [
        {
            key: 'mails', label: t('mails'), icon: MailOutlineRound,
            views: [
                { key: 'mails', label: inboxText('inbox') },
                view('sendBox'),
                view('sendMail'),
            ],
        },
        {
            key: 'account', label: t('mailbox_management'), icon: InboxOutlined,
            views: [
                view('account', 'mailbox_list'), view('account_create', 'mailbox_create'),
                view('account_settings', 'mailbox_settings'), view('senderAccess'),
                view('ipBlacklistSettings'), view('aiExtractSettings'), view('webhook', 'webhookSettings'),
            ],
        },
        ...(showUserSystem.value ? [{
            key: 'user', label: t('user_management'), icon: GroupOutlined,
            views: [
                view('user_management'), view('user_settings'), view('userOauth2Settings'), view('roleAddressConfig'),
            ],
        }] : []),
        {
            key: 'settings', label: t('settings'), icon: SettingsOutlined,
            views: [
                view('settings'),
                view('unknow'),
                view('providers'),
                view('mailWebhook'),
                view('telegram'),
                view('statistics'),
                view('database'),
                view('workerconfig'),
                view('maintenance', 'cleanup'),
                view('appearance'),
                view('adminAccount'),
                ...(openSettings.value.enableRedeemCode ? [view('redeemCodes')] : []),
                view('about'),
            ],
        },
    ])

    const activeSection = computed(() => {
        return sections.value.find(section => section.key === route.meta.section) || sections.value[0]
    })
    const activeView = computed(() => {
        const section = activeSection.value
        return section.views?.find(item => item.key === route.meta.view) || section.views?.[0] || section
    })
    const adminLocation = (section, view) => adminWorkspaceLocation(section, view, locale.value)
    const railSections = computed(() => sections.value.filter(({ key }) => ['account', 'user', 'settings'].includes(key)))
    const isSettingsView = computed(() => activeSection.value.key === 'settings')
    const settingsGroups = computed(() => {
        const settingsViews = sections.value.find(section => section.key === 'settings').views
        const link = (key, icon, status) => {
            const { label } = settingsViews.find(view => view.key === key)
            return { key, label, icon, status, to: adminLocation('settings', key) }
        }
        const status = (enabled, enabledKey, disabledKey) => ({
            label: t(enabled ? enabledKey : disabledKey),
            enabled,
        })
        return [
            { key: 'site', label: t('settingsSite'), items: [
                link('appearance', StyleOutlined),
                link('adminAccount', AdminPanelSettingsOutlined),
                ...(openSettings.value.enableRedeemCode ? [link('redeemCodes', ConfirmationNumberOutlined)] : []),
                link('about', InfoOutlined),
            ] },
            { key: 'integrations', label: t('settingsIntegrations'), items: [
                link('mailWebhook', LinkOutlined, status(openSettings.value.enableWebhook, 'settingsEnabled', 'settingsDisabled')),
                link('providers', KeyOutlined),
                link('telegram', SendOutlined, status(openSettings.value.telegramConfigured, 'settingsConfigured', 'settingsNotConfigured')),
            ] },
            { key: 'operations', label: t('settingsOperations'), items: [
                link('unknow', ReportProblemOutlined),
                link('statistics', BarChartOutlined),
                link('database', DnsOutlined),
                link('workerconfig', CodeOutlined),
                link('maintenance', CleaningServicesOutlined),
            ] },
        ]
    })

    return { sections, activeSection, activeView, adminLocation, railSections, isSettingsView, settingsGroups }
}
