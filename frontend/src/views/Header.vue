<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, useMessage, useNotification } from 'naive-ui'
import {
    AccountCircleOutlined, InboxOutlined,
    InfoOutlined, MailOutlineRound, MenuFilled, SendOutlined, SettingsOutlined,
} from '@vicons/material'
import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import { useScopedI18n } from '../i18n/app'
import { DEFAULT_LOCALE, isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { mailboxLocation, userLocation } from '../router/workspace-paths'
import Turnstile from '../components/Turnstile.vue'
import WorkspaceNavigation from './workspace/WorkspaceNavigation.vue'
import WorkspaceUtilities from './workspace/WorkspaceUtilities.vue'
import { useAdminNavigation } from './workspace/admin-navigation'

const message = useMessage()
const notification = useNotification()
const props = defineProps({ standalone: Boolean, adminInbox: Boolean })
const route = useRoute()
const router = useRouter()
const { t, locale } = useScopedI18n('views.Header')
const { t: mailT } = useScopedI18n('views.Index')
const {
    railSections, isSettingsView, activeSection: activeAdminSection, activeView: activeAdminView, adminLocation,
} = useAdminNavigation()
const {
    isTelegram, showAdminPage, showUserSystem,
    showAuth, auth, loading, openSettings, preferredLocale, userSettings, jwt, settings,
    adminAuth, showAdminAuth, useSimpleIndex, isReceiveOnlyAccount,
} = useGlobalState()

const isMobile = useMediaQuery('(max-width: 820px)')
const showMobileMenu = ref(false)
const brand = computed(() => openSettings.value.title || t('title'))
const isMailbox = computed(() => route.meta.workspace === 'mailbox')
const isAdmin = computed(() => route.meta.workspace === 'admin')
const isUser = computed(() => route.meta.workspace === 'user')
const section = computed(() => route.meta.section)
const mailboxRoute = (section = 'mailbox') => mailboxLocation(section, locale.value)
const pageRoute = (path) => getRouterPathWithLang(path, locale.value)
const isPasswordAdmin = computed(() => !!adminAuth.value && !showAdminAuth.value)
const canNavigateAdmin = computed(() => openSettings.value.fetched && showAdminPage.value
    && !showAdminAuth.value && !showAuth.value)
const useAdminMail = computed(() => canNavigateAdmin.value && (isAdmin.value || props.adminInbox || !jwt.value))
const composeTo = computed(() => {
    if (!openSettings.value.enableSendMail) return null
    if (useAdminMail.value) return adminLocation('mails', 'sendMail')
    return jwt.value && !openSettings.value.receiveOnlyUsers ? mailboxRoute('sendmail') : null
})
const composeActive = computed(() => useAdminMail.value
    ? isAdmin.value && activeAdminView.value.key === 'sendMail'
    : isMailbox.value && section.value === 'sendmail')
const sentTo = computed(() => {
    if (useAdminMail.value) return adminLocation('mails', 'sendBox')
    if (jwt.value && openSettings.value.enableSendMail && !useSimpleIndex.value && !openSettings.value.receiveOnlyUsers) {
        return mailboxRoute('sendbox')
    }
    return null
})
const sentActive = computed(() => useAdminMail.value
    ? isAdmin.value && activeAdminView.value.key === 'sendBox'
    : isMailbox.value && section.value === 'sendbox')
const adminLinks = computed(() => canNavigateAdmin.value
    ? railSections.value.map(({ key, label, icon }) => ({
        key, label, icon,
        to: adminLocation(key),
        active: isAdmin.value && (key === 'settings' ? isSettingsView.value : activeAdminSection.value.key === key),
    }))
    : [])
const navProps = computed(() => ({
    title: brand.value,
    composeTo: composeTo.value,
    composeActive: composeActive.value,
    composeLabel: t('compose'),
    identity: settings.value.address || userSettings.value.user_email || (isPasswordAdmin.value ? 'admin' : ''),
    navigationLabel: t('menu'),
    adminLabel: t('admin'),
    adminLinks: adminLinks.value,
    primaryLinks: [
        { key: 'mailbox', label: mailT('inbox'), icon: InboxOutlined,
            to: isReceiveOnlyAccount.value ? userLocation('user_mail_box_tab', locale.value) : mailboxRoute(),
            active: isReceiveOnlyAccount.value ? isUser.value && section.value === 'user_mail_box_tab'
                : (isMailbox.value && section.value === 'mailbox') || (isAdmin.value && activeAdminView.value.key === 'mails') },
        ...(sentTo.value ? [
            { key: 'sendbox', label: mailT('sendbox'), icon: SendOutlined, to: sentTo.value, active: sentActive.value },
        ] : []),
        ...(jwt.value && !useSimpleIndex.value && !openSettings.value.receiveOnlyUsers ? [
            { key: 'settings', label: mailT('mailboxSettings'), icon: SettingsOutlined, to: mailboxRoute('accountSettings'),
                active: isMailbox.value
                    && ['accountSettings', 'appearance', 'auto_reply', 'webhook', 's3_attachment'].includes(section.value) },
        ] : []),
    ],
    accountLinks: [
        ...(showUserSystem.value || isPasswordAdmin.value ? [
            { key: 'user', label: t('userCenter'), icon: AccountCircleOutlined,
                to: pageRoute(userSettings.value.user_email || isPasswordAdmin.value ? '/user' : '/login'),
                active: isUser.value && !(isReceiveOnlyAccount.value && section.value === 'user_mail_box_tab') },
        ] : []),
        ...(openSettings.value.enableIndexAbout && !useSimpleIndex.value ? [
            { key: 'about', label: mailT('about'), icon: InfoOutlined, to: mailboxRoute('about'),
                active: isMailbox.value && section.value === 'about' },
        ] : []),
    ],
}))

const cfToken = ref('')
const turnstileRef = ref(null)
const logoClickCount = ref(0)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({ password: await hashPassword(auth.value), cf_token: cfToken.value }),
        })
        location.reload()
    } catch (error) {
        message.error(error.message)
        turnstileRef.value?.refresh?.()
    }
}

const changeLocale = async (lang) => {
    if (!isSupportedLocale(lang)) return
    const target = replaceLocaleInFullPath(route.fullPath, lang)
    if (lang === DEFAULT_LOCALE) preferredLocale.value = DEFAULT_LOCALE
    if (target !== route.fullPath) {
        try {
            await router.push(target)
            if (router.currentRoute.value.fullPath === target) preferredLocale.value = lang
        } catch (error) {
            console.error('Failed to switch locale', error)
        }
    }
    showMobileMenu.value = false
}

const logoClick = async () => {
    if (isAdmin.value) return
    logoClickCount.value += 1
    if (logoClickCount.value >= 6) {
        logoClickCount.value = 0
        await router.push(adminLocation('account'))
    }
}

watch(() => route.fullPath, () => { showMobileMenu.value = false })
watch(isMobile, (mobile) => { if (!mobile) showMobileMenu.value = false })

useHead({
    title: () => brand.value,
    meta: [{ name: 'description', content: () => openSettings.value.description || brand.value }],
})

onMounted(async () => {
    await api.getOpenSettings(message, notification)
    if (showUserSystem.value && !userSettings.value.user_id) await api.getUserSettings(message)
})
</script>

<template>
    <slot v-if="standalone" />
    <div v-else class="workspace-shell" :class="{ 'workspace-shell--compact': isTelegram }">
        <a class="workspace-skip" href="#workspace-main">{{ t('skipToContent') }}</a>
        <aside v-if="!isMobile && !isTelegram" class="workspace-rail">
            <WorkspaceNavigation v-bind="navProps" @brand="logoClick">
                <template #footer>
                    <WorkspaceUtilities @locale="changeLocale" />
                    <slot name="rail-footer" />
                </template>
            </WorkspaceNavigation>
        </aside>
        <div class="workspace-frame">
            <header v-if="isMobile || isTelegram" class="workspace-bar">
                <div class="workspace-mobile">
                    <button v-if="!isTelegram || canNavigateAdmin" class="workspace-icon-button" :aria-label="t('menu')"
                        :aria-expanded="showMobileMenu" type="button" @click="showMobileMenu = true">
                        <n-icon :component="MenuFilled" />
                    </button>
                    <button class="workspace-mobile-brand" type="button" @click="logoClick">
                        <n-icon v-if="isTelegram" :component="MailOutlineRound" />
                        <span>{{ brand }}</span>
                    </button>
                </div>
                <WorkspaceUtilities v-if="isTelegram" @locale="changeLocale" />
            </header>
            <main id="workspace-main" class="workspace-main" tabindex="-1">
                <slot />
            </main>
        </div>

        <n-drawer v-model:show="showMobileMenu" placement="left" :width="248" class="workspace-navigation-drawer">
            <n-drawer-content closable :title="t('menu')" body-content-style="padding: 0;">
                <WorkspaceNavigation v-bind="navProps" @brand="logoClick" @navigate="showMobileMenu = false">
                    <template #footer>
                        <WorkspaceUtilities @locale="changeLocale" />
                        <slot name="rail-footer" />
                    </template>
                </WorkspaceNavigation>
            </n-drawer-content>
        </n-drawer>

    </div>
    <n-modal v-model:show="showAuth" :closable="false" :close-on-esc="false" :mask-closable="false"
        preset="dialog" :title="t('accessHeader')">
        <p class="workspace-access-tip">{{ t('accessTip') }}</p>
        <n-input v-model:value="auth" :input-props="{ autocomplete: 'current-password', 'aria-label': t('accessHeader') }"
            type="password" show-password-on="click" @keyup.enter="authFunc" />
        <Turnstile v-if="openSettings.enableGlobalTurnstileCheck" ref="turnstileRef" v-model:value="cfToken" />
        <template #action>
            <n-button :loading="loading" type="primary" @click="authFunc">{{ t('ok') }}</n-button>
        </template>
    </n-modal>
</template>

<style scoped>
.workspace-shell {
    display: grid;
    grid-template-columns: 208px minmax(0, 1fr);
    min-height: 100dvh;
}

.workspace-rail {
    position: sticky;
    top: 0;
    height: 100dvh;
    min-width: 0;
    background: var(--mail-rail);
    border-inline-end: 1px solid var(--mail-border);
    overflow-y: auto;
}

.workspace-frame,
.workspace-main,
.workspace-mobile {
    min-width: 0;
}

.workspace-frame {
    display: flex;
    flex-direction: column;
}

.workspace-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--workspace-header-height);
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 0 var(--workspace-gutter-inline);
    background: var(--mail-bg);
    border-bottom: 1px solid var(--mail-border);
}

.workspace-mobile {
    display: flex;
    align-items: center;
    gap: 5px;
}

.workspace-icon-button,
.workspace-mobile-brand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 37px;
    min-height: 36px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--mail-muted);
    text-decoration: none;
    cursor: pointer;
}

.workspace-icon-button:hover {
    background: var(--mail-hover);
    color: var(--mail-ink);
}

.workspace-icon-button .n-icon {
    font-size: 19px;
}

.workspace-mobile-brand {
    color: var(--mail-ink);
    font-weight: 750;
    letter-spacing: -.02em;
    padding-inline: 2px;
    min-width: 0;
}

.workspace-mobile-brand span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.workspace-main {
    flex: 1;
    padding: var(--workspace-gutter-block) var(--workspace-gutter-inline);
    outline: none;
}

.workspace-skip {
    position: fixed;
    z-index: 30;
    inset: 0 auto auto 0;
    transform: translateY(-110%);
    background: var(--mail-brand);
    color: #fff;
    padding: 8px 14px;
}

.workspace-skip:focus {
    transform: none;
}

.workspace-access-tip {
    margin: 0 0 14px;
    color: var(--mail-muted);
}

.workspace-shell--compact {
    --workspace-header-height: 54px;
    grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 820px) {
    .workspace-shell {
        --workspace-header-height: 54px;
        --workspace-gutter-block: 12px;
        --workspace-gutter-inline: 12px;
        grid-template-columns: minmax(0, 1fr);
    }

    .workspace-bar {
        padding-inline-start: 6px;
    }
}
</style>
