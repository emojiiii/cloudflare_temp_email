<script setup>
import { darkTheme } from 'naive-ui'
import { computed, defineAsyncComponent, onMounted, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useI18n } from 'vue-i18n'
import { useGlobalState } from './store'
import { useIsMobile } from './utils/composables'
import Header from './views/Header.vue'
import Footer from './views/Footer.vue'
import { getNaiveLocaleConfig } from './i18n/naive-locale'
import { DEFAULT_LOCALE, getPathWithLocale, isSupportedLocale } from './i18n/utils'
import { APP_CONFIG } from './config'
import './workspace.css'

const {
    isDark, loading, useSideMargin, telegramApp, isTelegram,
    adminAuth, jwt, openSettings, settings, showAuth, showAdminAuth, showAdminPage, showUserSystem,
    userJwt, userSettings,
} = useGlobalState()
const route = useRoute()
const router = useRouter()
const { locale } = useI18n({ useScope: 'global' })
const AdminWorkspace = defineAsyncComponent(() => import('./views/Admin.vue'))
const isLoginPage = computed(() => route.name === 'login')
const adminWorkspace = computed(() => {
    if (!adminAuth.value || userSettings.value.user_email) return undefined
    if (showUserSystem.value && userJwt.value && !userSettings.value.fetched) return undefined
    if (route.meta.workspace === 'user') return 'account'
    if (route.meta.workspace === 'mailbox' && route.meta.section === 'mailbox' && (
        typeof route.query.address === 'string' || !jwt.value || (settings.value.fetched && !settings.value.address)
    )) {
        return 'inbox'
    }
})
const requiresLogin = computed(() => {
    if (adminWorkspace.value) return showAdminAuth.value
    if (route.meta.workspace === 'user') return !userSettings.value.user_email
    return route.meta.workspace === 'admin' && (!showAdminPage.value || showAdminAuth.value)
})
const theme = computed(() => isDark.value ? darkTheme : null)
const themeOverrides = computed(() => ({
    common: {
        fontFamily: 'var(--mail-font)',
        borderRadius: '7px',
        primaryColor: isDark.value ? '#a8b6ff' : '#304bc7',
        primaryColorHover: isDark.value ? '#bbc6ff' : '#3f5adb',
        primaryColorPressed: isDark.value ? '#91a3ff' : '#263eb0',
        primaryColorSuppl: isDark.value ? '#bbc6ff' : '#3f5adb',
        bodyColor: isDark.value ? '#10141e' : '#f5f7fb',
        cardColor: isDark.value ? '#181d29' : '#ffffff',
        modalColor: isDark.value ? '#181d29' : '#ffffff',
        borderColor: isDark.value ? '#2a3245' : '#e0e6ef',
    },
    Card: { borderRadius: '10px', paddingMedium: '18px 20px' },
    Button: { fontWeightStrong: '650', heightMedium: '34px' },
    Tabs: { fontWeightActive: '650' },
}))
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const adClient = APP_CONFIG.GOOGLE_AD_CLIENT
const adSlot = APP_CONFIG.GOOGLE_AD_SLOT
const isMobile = useIsMobile()
const showAd = computed(() => !isMobile.value && !!adClient && !!adSlot)

watchEffect(() => {
    document.documentElement.lang = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
})

watchEffect(() => {
    if (!requiresLogin.value || !openSettings.value.fetched || showAuth.value) return
    if (showUserSystem.value && userJwt.value && !userSettings.value.fetched) return
    const language = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
    void router.replace({
        path: getPathWithLocale('/login', language),
        query: route.meta.workspace === 'admin' || adminWorkspace.value ? { role: 'admin' } : {},
    })
})

if (adClient && adSlot) {
    useHead({
        script: [{
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`,
            async: true,
            crossorigin: 'anonymous',
        }],
    })
}

onMounted(async () => {
    const token = APP_CONFIG.CF_WEB_ANALY_TOKEN
    const hasBeacon = document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')
    if (token && !hasBeacon) {
        const script = document.createElement('script')
        script.defer = true
        script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
        script.dataset.cfBeacon = JSON.stringify({ token })
        document.body.appendChild(script)
    }

    if (showAd.value) (window.adsbygoogle = window.adsbygoogle || []).push({})

    if (APP_CONFIG.IS_TELEGRAM === true || APP_CONFIG.IS_TELEGRAM === 'true') {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://telegram.org/js/telegram-web-app.js'
            script.onload = resolve
            script.onerror = reject
            document.body.appendChild(script)
        })
        telegramApp.value = window.Telegram?.WebApp || {}
        isTelegram.value = !!window.Telegram?.WebApp?.initData
    }
})
</script>

<template>
    <n-config-provider :locale="localeConfig.locale" :date-locale="localeConfig.dateLocale"
        :theme="theme" :theme-overrides="themeOverrides">
        <n-global-style />
        <n-notification-provider>
            <n-message-provider>
                <Header :standalone="isLoginPage || requiresLogin" :admin-inbox="adminWorkspace === 'inbox'">
                    <template v-if="!isTelegram" #rail-footer>
                        <Footer />
                    </template>
                    <router-view v-if="isLoginPage" />
                    <template v-else-if="!requiresLogin">
                        <div v-if="loading" class="workspace-progress" role="progressbar" />
                        <div class="workspace-content" :class="{ 'workspace-content--wide': !useSideMargin }">
                            <AdminWorkspace v-if="adminWorkspace" :workspace="adminWorkspace" />
                            <router-view v-else />
                        </div>
                        <aside v-if="showAd" class="workspace-ad">
                            <ins class="adsbygoogle" style="display: block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                                data-ad-format="auto" data-full-width-responsive="true" />
                        </aside>
                    </template>
                </Header>
            </n-message-provider>
        </n-notification-provider>
    </n-config-provider>
</template>
