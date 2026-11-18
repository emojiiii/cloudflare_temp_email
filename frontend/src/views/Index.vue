<script setup>
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { mailboxLocation } from '@/router/workspace-paths'
import { getAIReplySource } from '@/utils/mail-actions'

import { useGlobalState } from '../store'
import { api } from '../api'
import { EditOutlined } from '@vicons/material'

import AddressBar from './index/AddressBar.vue';
import MailBox from '../components/MailBox.vue';
import SendBox from '../components/SendBox.vue';
import AutoReply from './index/AutoReply.vue';
import AccountSettings from './index/AccountSettings.vue';
import Appearance from './common/Appearance.vue';
import Webhook from './index/Webhook.vue';
import Attachment from './index/Attachment.vue';
import About from './common/About.vue';
import SimpleIndex from './index/SimpleIndex.vue';

const { loading, settings, openSettings, useSimpleIndex, sendMailModel } = useGlobalState()
const message = useMessage()
const route = useRoute()
const router = useRouter()
const isMobile = useMediaQuery('(max-width: 820px)')

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t, locale } = useScopedI18n('views.Index')
const { t: tCompose } = useScopedI18n('views.index.SendMail')
const { t: tHeader } = useScopedI18n('views.Header')

const mailboxCanSend = computed(() => openSettings.value.enableSendMail && !openSettings.value.receiveOnlyUsers)
const mailboxSettings = computed(() => openSettings.value.receiveOnlyUsers ? [] : [
  { name: 'accountSettings', label: t('mailboxSettings') },
  { name: 'appearance', label: t('appearance') },
  ...(openSettings.value.enableAutoReply ? [{ name: 'auto_reply', label: t('auto_reply') }] : []),
  ...(openSettings.value.enableWebhook ? [{ name: 'webhook', label: t('webhookSettings') }] : []),
  ...(openSettings.value.isS3Enabled ? [{ name: 's3_attachment', label: t('s3Attachment') }] : []),
  ...(openSettings.value.enableIndexAbout ? [{ name: 'about', label: t('about') }] : []),
]);
const sections = computed(() => [
  { name: 'mailbox', label: t('inbox') },
  ...(mailboxCanSend.value ? [
    { name: 'sendbox', label: t('sendbox') },
    { name: 'sendmail', label: tCompose('composeMail') },
  ] : []),
  ...mailboxSettings.value,
]);
const currentSection = computed(() => sections.value.find(section => section.name === route.meta.section) ?? sections.value[0]);
const inSettings = computed(() => mailboxSettings.value.some(section => section.name === currentSection.value.name));
const readingMail = ref(false)
const showHeader = computed(() => !isMobile.value || !readingMail.value || !['mailbox', 'sendbox'].includes(currentSection.value.name))

const sectionLocation = (section) => mailboxLocation(section, locale.value);
watch(() => [openSettings.value.fetched, openSettings.value.receiveOnlyUsers, route.meta.workspace, route.meta.section],
  ([ready, receiveOnly, workspace, section]) => {
    if (ready && receiveOnly && workspace === 'mailbox' && section !== 'mailbox') {
      void router.replace(sectionLocation('mailbox'));
    }
  }, { immediate: true });

const replyMessage = shallowRef(null)
const replySource = computed(() => replyMessage.value?.address === settings.value.address
  ? replyMessage.value?.source : null)
const openCompose = (draft, mail, mode) => {
  replyMessage.value = mode === 'reply' ? { address: settings.value.address, source: getAIReplySource(mail) } : null
  Object.assign(sendMailModel.value, draft, { composeMode: mode })
  void router.push(sectionLocation('sendmail'))
}

const fetchMailData = async (params, options) => {
  if (mailIdQuery.value > 0) {
    const singleMail = await api.fetch(`/api/mail/${mailIdQuery.value}`, options);
    if (singleMail) return { results: [singleMail], count: 1 };
    return { results: [], count: 0 };
  }
  return api.fetch(`/api/mails?${params}`, options);
};

const deleteMail = async (curMailId) => {
  await api.fetch(`/api/mails/${curMailId}`, { method: 'DELETE' });
};

const updateMailReadStatus = async (id, isUnread) => {
  await api.fetch(`/api/mails/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ isUnread }),
    showLoading: false
  })
}

const deleteSenboxMail = async (curMailId) => {
  await api.fetch(`/api/sendbox/${curMailId}`, { method: 'DELETE' });
};

const fetchSenboxData = async (limit, offset) => {
  return await api.fetch(`/api/sendbox?limit=${limit}&offset=${offset}`);
};

const saveToS3 = async (mail_id, filename, blob) => {
  try {
    const { url } = await api.fetch(`/api/attachment/put_url`, {
      method: 'POST',
      body: JSON.stringify({ key: `${mail_id}/${filename}` })
    });
    // upload to s3 by formdata
    const formData = new FormData();
    formData.append(filename, blob);
    await fetch(url, {
      method: 'PUT',
      body: formData
    });
    message.success(t('saveToS3Success'));
  } catch (error) {
    console.error(error);
    message.error(error.message || "save to s3 error");
  }
}

const mailBoxKey = ref("")
const mailIdQuery = ref("")
const showMailIdQuery = ref(false)

const queryMail = () => {
  mailBoxKey.value = Date.now();
}

watch(() => route.query.mail_id, mailId => {
  mailIdQuery.value = typeof mailId === 'string' ? mailId : '';
  showMailIdQuery.value = Boolean(mailIdQuery.value);
  queryMail();
}, { immediate: true });
</script>

<template>
  <SimpleIndex v-if="useSimpleIndex && currentSection.name === 'mailbox'" @compose="openCompose" />
  <section v-else class="inbox-workspace">
    <header v-show="showHeader" class="inbox-header"
      :class="{ 'inbox-header-active': settings.address, 'inbox-header-mailbox': settings.address && currentSection.name === 'mailbox' }">
      <div v-if="settings.address" class="inbox-heading">
        <h1 :class="{ 'inbox-heading-accessible': currentSection.name === 'mailbox' }">{{ currentSection.label }}</h1>
        <n-button v-if="isMobile && mailboxCanSend && currentSection.name !== 'sendmail'"
          size="small" type="primary" @click="router.push(sectionLocation('sendmail'))">
          <template #icon><n-icon :component="EditOutlined" /></template>
          {{ tHeader('compose') }}
        </n-button>
      </div>
      <AddressBar :show-simple-mode="currentSection.name === 'mailbox'" />
    </header>

    <template v-if="settings.address">
      <nav v-if="inSettings" class="inbox-settings-nav" :aria-label="t('mailboxSettings')">
        <RouterLink v-for="section in mailboxSettings" :key="section.name" :to="sectionLocation(section.name)"
          :class="{ 'inbox-section-current': currentSection.name === section.name }"
          :aria-current="currentSection.name === section.name ? 'page' : undefined">
          {{ section.label }}
        </RouterLink>
      </nav>

      <MailBox v-if="currentSection.name === 'mailbox'" :key="mailBoxKey" :showEMailTo="false"
        :showReply="mailboxCanSend" :showSaveS3="openSettings.isS3Enabled && !openSettings.receiveOnlyUsers" :saveToS3="saveToS3"
        :enableUserDeleteEmail="openSettings.enableUserDeleteEmail && !openSettings.receiveOnlyUsers" :fetchMailData="fetchMailData"
        :deleteMail="deleteMail" :showFilterInput="!(mailIdQuery > 0)" :enableMailReadStatus="openSettings.enableMailReadStatus"
        :updateMailReadStatus="updateMailReadStatus" :on-compose="openCompose" @reading="readingMail = $event">
        <template v-if="showMailIdQuery" #filters>
          <n-input-group class="mail-id-query">
            <n-input v-model:value="mailIdQuery" size="small" @keydown.enter="queryMail" />
            <n-button size="small" type="primary" secondary @click="queryMail">{{ t('query') }}</n-button>
          </n-input-group>
        </template>
      </MailBox>
      <SendBox v-else-if="currentSection.name === 'sendbox'" :fetchMailData="fetchSenboxData"
        :enableUserDeleteEmail="openSettings.enableUserDeleteEmail" :deleteMail="deleteSenboxMail"
        @reading="readingMail = $event" />
      <SendMail v-else-if="currentSection.name === 'sendmail'" :reply-source="replySource" @sent="replyMessage = null" />
      <div v-else class="inbox-settings-panel">
        <AccountSettings v-if="currentSection.name === 'accountSettings'" />
        <Appearance v-else-if="currentSection.name === 'appearance'" :showUseSimpleIndex="true" />
        <AutoReply v-else-if="currentSection.name === 'auto_reply'" />
        <Webhook v-else-if="currentSection.name === 'webhook'" />
        <Attachment v-else-if="currentSection.name === 's3_attachment'" />
        <About v-else-if="currentSection.name === 'about'" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.inbox-workspace {
  min-width: 0;
  text-align: start;
}

.inbox-header-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 24px;
  min-height: 48px;
  margin-bottom: 10px;
}

.inbox-header-active > .mailbox-address-bar {
  flex: 0 1 288px;
}

.inbox-header-mailbox {
  flex-wrap: nowrap;
  gap: 8px;
  min-height: 38px;
}

.inbox-header-mailbox > .mailbox-address-bar {
  order: -1;
  flex: 0 1 340px;
  min-width: 0;
}

.inbox-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.inbox-heading h1 {
  margin: 0;
  color: var(--mail-ink, #131827);
  font-size: 1.5rem;
  font-weight: 690;
  letter-spacing: -0.035em;
  line-height: 1.2;
}

.inbox-heading-accessible {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.mail-id-query {
  width: min(190px, 100%);
}

.inbox-settings-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 15px;
}

.inbox-settings-nav a {
  border-radius: 8px;
  color: var(--mail-muted, #5b6d63);
  padding: 7px 12px;
  line-height: 1.4;
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}

.inbox-settings-nav a:hover,
.inbox-settings-nav .inbox-section-current {
  color: var(--mail-accent, #18735a);
  background: color-mix(in srgb, var(--mail-accent, #18735a) 11%, transparent);
}

.inbox-settings-panel {
  padding: clamp(10px, 2.3vw, 26px);
  border: 1px solid var(--mail-border, #e7eaf0);
  border-radius: var(--mail-radius, 10px);
  background: var(--mail-surface, #fff);
}

@media (max-width: 820px) {
  .inbox-header-active {
    margin-bottom: 10px;
  }

  .inbox-header-active > .mailbox-address-bar {
    flex-basis: 100%;
  }

  .inbox-heading {
    flex: 1 1 100%;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
