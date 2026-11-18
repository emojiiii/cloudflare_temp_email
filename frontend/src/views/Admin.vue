<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { AdminPanelSettingsOutlined, ChevronLeftRound } from '@vicons/material'
import { RouterLink, useRouter } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../store'
import { getRouterPathWithLang } from '../utils'
import { getAIReplySource } from '../utils/mail-actions'
import { useAdminNavigation } from './workspace/admin-navigation'

import SenderAccess from './admin/SenderAccess.vue'
import Statistics from './admin/Statistics.vue'
import SendBox from './admin/SendBox.vue'
import Account from './admin/Account.vue'
import CreateAccount from './admin/CreateAccount.vue'
import AccountSettings from './admin/AccountSettings.vue'
import UserManagement from './admin/UserManagement.vue'
import UserSettings from './admin/UserSettings.vue'
import UserOauth2Settings from './admin/UserOauth2Settings.vue'
import RoleAddressConfig from './admin/RoleAddressConfig.vue'
import Mails from './admin/Mails.vue'
import MailsUnknow from './admin/MailsUnknow.vue'
import About from './common/About.vue'
import Maintenance from './admin/Maintenance.vue'
import DatabaseManager from './admin/DatabaseManager.vue'
import Appearance from './common/Appearance.vue'
import Telegram from './admin/Telegram.vue'
import Webhook from './admin/Webhook.vue'
import MailWebhook from './admin/MailWebhook.vue'
import WorkerConfig from './admin/WorkerConfig.vue'
import IpBlacklistSettings from './admin/IpBlacklistSettings.vue'
import AiExtractSettings from './admin/AiExtractSettings.vue'
import RedeemCodes from './admin/RedeemCodes.vue'
import Settings from './admin/Settings.vue'

const SendMail = defineAsyncComponent(() => import('./admin/SendMail.vue'))
const ProviderSettings = defineAsyncComponent(() => import('./admin/ProviderSettings.vue'))
const props = defineProps({ workspace: String })

const {
  adminAuth, showAdminAuth, loading, showAdminPage,
  userSettings, openSettings,
} = useGlobalState()
const message = useMessage()
const router = useRouter()
const { t, locale } = useScopedI18n('views.Admin')
const { t: headerText } = useScopedI18n('views.Header')
const { t: mailText } = useScopedI18n('components.MailContentRenderer')
const { t: composeText } = useScopedI18n('views.admin.SendMail')
const { sections, activeSection, activeView, adminLocation, isSettingsView } = useAdminNavigation()

const viewComponents = {
  mails: Mails,
  unknow: MailsUnknow,
  sendBox: SendBox,
  sendMail: SendMail,
  mailWebhook: MailWebhook,
  account: Account,
  account_create: CreateAccount,
  account_settings: AccountSettings,
  senderAccess: SenderAccess,
  ipBlacklistSettings: IpBlacklistSettings,
  aiExtractSettings: AiExtractSettings,
  webhook: Webhook,
  user_management: UserManagement,
  user_settings: UserSettings,
  userOauth2Settings: UserOauth2Settings,
  roleAddressConfig: RoleAddressConfig,
  settings: Settings,
  providers: ProviderSettings,
  statistics: Statistics,
  database: DatabaseManager,
  workerconfig: WorkerConfig,
  telegram: Telegram,
  redeemCodes: RedeemCodes,
  maintenance: Maintenance,
  appearance: Appearance,
  about: About,
}

const selectedSection = computed(() => {
  if (!props.workspace) return activeSection.value
  const key = props.workspace === 'inbox' ? 'mails' : 'account'
  return sections.value.find(section => section.key === key)
})
const selectedView = computed(() => props.workspace ? selectedSection.value.views[0] : activeView.value)
const isCompose = computed(() => selectedView.value.key === 'sendMail')
const viewName = computed(() => {
  if (props.workspace === 'account') return headerText('userCenter')
  if (isCompose.value) return composeText('composeMail')
  return selectedView.value.label
})
const settingsPage = computed(() => !props.workspace && isSettingsView.value)
const inboxPage = computed(() => selectedView.value.key === 'mails')
const viewTabs = computed(() => props.workspace || settingsPage.value || selectedSection.value.key === 'mails'
  ? [] : selectedSection.value.views)
const viewProps = computed(() => {
  if (['mails', 'unknow'].includes(selectedView.value.key)) return { onCompose: openCompose }
  if (props.workspace === 'account') return { accountWorkspace: true }
  return {}
})
const selectView = (key) => router.push(adminLocation(selectedSection.value.key, key))

const showLogoutModal = ref(false)
const currentLoginMethod = computed(() => {
  if (adminAuth.value) return t('loginViaPassword')
  if (userSettings.value.is_admin) return t('loginViaUserAdmin')
  if (openSettings.value.disableAdminPasswordCheck) return t('loginViaDisabledCheck')
  return ''
})

const handleLogout = async () => {
  adminAuth.value = ''
  showAdminAuth.value = false
  message.success(t('logoutSuccess'))
  await router.replace({
    path: getRouterPathWithLang('/login', locale.value),
    query: { role: 'admin' },
  })
}

const composeDraft = ref(null)

const openCompose = (draft, mail, mode, refreshInbox) => {
  composeDraft.value = {
    draft: { ...draft, fromMail: mail.address },
    mode,
    replySource: mode === 'reply' ? getAIReplySource(mail) : null,
    refreshInbox: mode === 'reply' ? refreshInbox : null,
  }
}

const closeCompose = () => {
  composeDraft.value = null
}

const closeSentCompose = () => {
  const refreshInbox = composeDraft.value?.refreshInbox
  closeCompose()
  void refreshInbox?.()
}

</script>

<template>
  <section v-if="openSettings.fetched && showAdminPage && !showAdminAuth" class="admin-workspace"
    :class="{ 'admin-workspace--settings': settingsPage }">
    <n-tabs v-if="viewTabs.length" :key="selectedSection.key" class="admin-view-tabs"
      :value="selectedView.key" type="line" size="small" show-scroll-button @update:value="selectView">
      <n-tab v-for="view in viewTabs" :key="view.key" :name="view.key">
        {{ view.label }}
      </n-tab>
    </n-tabs>

    <header v-if="workspace === 'account'" class="admin-workspace-heading">
      <h1 class="admin-page-title">{{ viewName }}</h1>
      <span class="admin-login-method">admin</span>
      <n-button size="small" quaternary @click="showLogoutModal = true">{{ t('logout') }}</n-button>
    </header>
    <header v-else class="admin-page-heading"
      :class="{ 'admin-page-title--sr-only': inboxPage || viewTabs.length }">
      <nav v-if="settingsPage && selectedView.key !== 'settings'" :aria-label="t('settingsNavigation')">
        <RouterLink class="admin-settings-back" :to="adminLocation('settings')">
          <n-icon :component="ChevronLeftRound" aria-hidden="true" />
          {{ t('settings') }}
        </RouterLink>
      </nav>
      <h1 class="admin-page-title">{{ viewName }}</h1>
    </header>

    <div class="admin-pane" :class="{ 'admin-pane--mail': selectedSection.key === 'mails' }">
      <component v-if="viewComponents[selectedView.key]" :is="viewComponents[selectedView.key]"
        :key="selectedSection.key + '/' + selectedView.key"
        v-bind="viewProps" />
      <section v-else class="workspace-panel admin-session-card">
        <div class="admin-session-details">
          <span class="admin-session-icon"><n-icon :component="AdminPanelSettingsOutlined" size="21" aria-hidden="true" /></span>
          <div>
            <h2>{{ t('loginMethod') }}</h2>
            <p class="admin-login-method">{{ currentLoginMethod }}</p>
          </div>
        </div>
        <n-button v-if="adminAuth" type="error" secondary @click="showLogoutModal = true">{{ t('logout') }}</n-button>
      </section>
    </div>
    <n-drawer :show="!!composeDraft" width="min(640px, 100vw)" :mask-closable="false"
      placement="right" @update:show="closeCompose">
      <n-drawer-content v-if="composeDraft" closable
        :title="mailText(composeDraft.mode === 'forward' ? 'forward' : 'reply')" body-content-style="padding: 0">
        <SendMail :initial-draft="composeDraft.draft" :reply="composeDraft.mode === 'reply'"
          :reply-source="composeDraft.replySource" @sent="closeSentCompose" />
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showLogoutModal" preset="dialog" :title="t('logoutConfirmTitle')">
      <p>{{ t('logoutConfirmContent') }}</p>
      <template #action>
        <n-button :loading="loading" @click="handleLogout" type="warning">
          {{ t('confirm') }}
        </n-button>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.admin-workspace {
  min-width: 0;
  color: var(--mail-ink);
  text-align: start;
}

.admin-view-tabs {
  min-width: 0;
  margin-bottom: 14px;
}

.admin-page-title {
  margin: 0 0 12px;
  font-size: clamp(21px, 2.4vw, 25px);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.25;
}

.admin-workspace--settings {
  width: min(100%, 72rem);
}

.admin-workspace--settings .admin-page-heading {
  margin-bottom: clamp(16px, 2.4vw, 25px);
}

.admin-workspace--settings .admin-page-title {
  margin: 0;
  font-size: clamp(23px, 2.4vw, 30px);
}

.admin-settings-back {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 32px;
  margin-block-end: 7px;
  margin-inline-start: -6px;
  padding: 4px 8px 4px 4px;
  border-radius: 7px;
  color: var(--mail-muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.admin-settings-back:hover {
  color: var(--mail-accent);
  background: var(--mail-hover);
}

.admin-settings-back .n-icon:dir(rtl) {
  transform: rotate(180deg);
}

.admin-workspace-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}

.admin-workspace-heading .admin-page-title {
  margin: 0;
}

.admin-page-title--sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.admin-pane {
  min-width: 0;
}

.admin-pane:not(.admin-pane--mail) :deep(.center > .n-card),
.admin-account-card {
  width: min(100%, 780px);
  max-width: none !important;
  background: var(--mail-surface);
}

.admin-pane:not(.admin-pane--mail) :deep(.center:has(> .n-card)) {
  justify-content: flex-start;
  margin: 0;
}

.admin-login-method {
  color: var(--mail-muted);
}

.admin-session-card,
.admin-session-details {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-session-card {
  flex-wrap: wrap;
  justify-content: space-between;
  width: min(100%, 650px);
  padding: clamp(14px, 2.5vw, 22px);
}

.admin-session-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 10px;
  background: var(--mail-active);
  color: var(--mail-accent);
}

.admin-session-details h2 {
  margin: 0 0 3px;
  font-size: 15px;
}

.admin-session-details p {
  margin: 0;
  font-size: 13px;
}
</style>
