<script setup>
import { computed, shallowRef, watchEffect } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AccountCircleOutlined } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { userLocation } from '@/router/workspace-paths'
import { useGlobalState } from '../store'
import AddressManagement from './user/AddressManagement.vue'
import UserSettingsPage from './user/UserSettings.vue'
import BindAddress from './user/BindAddress.vue'
import UserMailBox from './user/UserMailBox.vue'
import UserSendBox from './user/UserSendBox.vue'

const { userSettings, openSettings, showUserSystem, isReceiveOnlyAccount } = useGlobalState()
const { t, locale } = useScopedI18n('views.User')
const { t: navigationT } = useScopedI18n('views.Header')
const { t: userMailT } = useScopedI18n('views.user.UserSendBox')
const route = useRoute()
const router = useRouter()
const replyDraft = shallowRef(null)
const replySource = shallowRef(null)
const sections = computed(() => [
    { key: 'address_management', label: t('address_management') },
    { key: 'user_mail_box_tab', label: t('user_mail_box_tab') },
    ...(openSettings.value.enableSendMail && !isReceiveOnlyAccount.value ? [
        { key: 'user_sendbox', label: userMailT('sendbox') },
        { key: 'user_send_mail', label: t('send_mail') },
    ] : []),
    { key: 'user_settings', label: t('user_settings') },
    { key: 'bind_address', label: t('bind_address') },
])
const isBlockedSendRoute = computed(() => isReceiveOnlyAccount.value
    && ['user_sendbox', 'user_send_mail'].includes(route.meta.section))
const active = computed(() => isBlockedSendRoute.value ? 'user_mail_box_tab'
    : sections.value.find(({ key }) => key === route.meta.section)?.key || 'address_management')
const isCompose = computed(() => active.value === 'user_send_mail')
const isInbox = computed(() => isReceiveOnlyAccount.value && active.value === 'user_mail_box_tab')
const accountSections = computed(() => isReceiveOnlyAccount.value
    ? sections.value.filter(({ key }) => !['user_mail_box_tab', 'bind_address'].includes(key)) : sections.value)

const userRoute = (section) => userLocation(section, locale.value)
watchEffect(() => {
    if (route.meta.workspace === 'user' && isBlockedSendRoute.value) {
        void router.replace(userRoute('user_mail_box_tab'))
    }
})
const reply = (draft, source) => {
    replyDraft.value = draft
    replySource.value = source
    router.push(userRoute('user_send_mail'))
}
const sent = () => {
    replyDraft.value = null
    replySource.value = null
    router.push(userRoute('user_sendbox'))
}
</script>

<template>
    <section v-if="showUserSystem" class="user-workspace">
        <header v-if="userSettings.user_email && !isInbox" class="user-workspace-heading">
            <h1 class="workspace-heading">{{ navigationT(isCompose ? 'compose' : 'userCenter') }}</h1>
            <span class="user-workspace-identity"><n-icon :component="AccountCircleOutlined" />
                {{ userSettings.user_email }}</span>
        </header>

        <template v-if="userSettings.user_email">
            <nav v-if="!isCompose && !isInbox" class="user-workspace-nav" :aria-label="navigationT('userCenter')">
                <RouterLink v-for="item in accountSections" :key="item.key" :to="userRoute(item.key)"
                    custom v-slot="{ href, navigate }">
                    <a :href="href" :aria-current="active === item.key ? 'page' : undefined" @click="navigate">
                        {{ item.label }}
                    </a>
                </RouterLink>
            </nav>

            <section class="user-workspace-panel" :key="active">
                <AddressManagement v-if="active === 'address_management'" />
                <UserMailBox v-else-if="active === 'user_mail_box_tab'" @reply="reply" />
                <UserSendBox v-else-if="active === 'user_sendbox'" mode="sendbox" />
                <UserSendBox v-else-if="active === 'user_send_mail'" mode="send_mail" :reply-draft="replyDraft"
                    :reply-source="replySource" @sent="sent" />
                <UserSettingsPage v-else-if="active === 'user_settings'" />
                <BindAddress v-else-if="active === 'bind_address'" />
            </section>
        </template>
    </section>
</template>

<style scoped>
.user-workspace-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 10px;
}

.user-workspace-identity {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--mail-muted);
    font-size: 13px;
}

.user-workspace-identity .n-icon {
    color: var(--mail-accent);
    font-size: 18px;
}

.user-workspace-nav {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px;
    overflow-x: auto;
    border: 1px solid var(--mail-border);
    border-radius: 11px;
    background: var(--mail-surface);
    margin-bottom: 14px;
    scrollbar-width: thin;
}

.user-workspace-nav a {
    flex: 0 0 auto;
    padding: 7px 11px;
    border-radius: 7px;
    color: var(--mail-muted);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
}

.user-workspace-nav a:hover {
    color: var(--mail-ink);
    background: var(--mail-hover);
}

.user-workspace-nav a[aria-current="page"] {
    color: var(--mail-accent);
    background: var(--mail-active);
    font-weight: 650;
}

.user-workspace-panel {
    min-width: 0;
}
</style>
