<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { useThemeVars } from 'naive-ui';
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound, ImageRound, AttachFileRound,
  MarkEmailReadRound, MarkEmailUnreadRound, MoreHorizRound, DeleteOutlineRound, TextSnippetRound, InfoOutlined,
  TranslateRound } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { blockRemoteContent } from '../utils/remote-content-policy';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';
import { getMailboxIdentity } from '../utils/mail-actions';
import { useIncomingMailTranslation } from '../utils/incoming-mail-translation';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark, autoLoadRemoteImages } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')
const { t: translationLabel } = useScopedI18n('components.MailTranslation')
const themeVars = useThemeVars();
const neutralActionColor = computed(() =>
  `color-mix(in srgb, ${themeVars.value.textColor2} 50%, ${themeVars.value.textColor3})`);
const deleteColor = computed(() => isDark.value
  ? `color-mix(in srgb, ${themeVars.value.errorColor} 65%, ${themeVars.value.textColor1})`
  : themeVars.value.errorColorPressed);

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  translationScope: {
    type: String,
    default: 'mailbox'
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  // 回调函数 props
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  },
  onUpdateMailReadStatus: {
    type: Function,
    default: () => { }
  }
});

const {
  capability: translationCapability, providerName: translationProvider,
  languageOptions: translationLanguages, language: translationLanguage,
  canTranslate, exceedsLimit, translating, translation, showingTranslation,
  failed: translationFailed, translateMail
} = useIncomingMailTranslation(computed(() => props.mail), props.translationScope);
const showTranslationSettings = ref(false);
const translationButton = ref(null);
const languageSelect = ref(null);

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const readStatusUpdating = ref(false);
const showFullscreen = ref(false);
const showMoreActions = ref(false);
const showMailDetails = ref(false);
const moreActionsButton = ref(null);
const downloadMailButton = ref(null);
const sender = computed(() => getMailboxIdentity(props.mail.source));
const senderInitials = computed(() => {
  const parts = (sender.value.name || sender.value.address.split('@')[0]).split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : parts[0]?.slice(0, 2) || '—').toUpperCase();
});

watch(showMoreActions, async (show) => {
  if (!show) return;
  await nextTick();
  if (showMoreActions.value) downloadMailButton.value?.$el.focus();
});

watch(showTranslationSettings, (show) => {
  if (show) languageSelect.value?.focus();
}, { flush: 'post' });

// Per-mail consent, deliberately independent of the global setting: it only
// ever turns true when the user clicks "load images" for this specific mail,
// and resets when a different mail is shown.
const showRemoteImages = ref(false);
watch(() => props.mail.id, () => {
  showRemoteImages.value = false;
  showMoreActions.value = false;
  showMailDetails.value = false;
  showTranslationSettings.value = false;
});

const allowRemoteImages = computed(() => autoLoadRemoteImages.value || showRemoteImages.value);

const displayedHtml = computed(() => showingTranslation.value ? translation.value.html : props.mail.message);
const displayTextMail = computed(() => showTextMail.value || (showingTranslation.value && !displayedHtml.value));
const displayedText = computed(() => showingTranslation.value ? translation.value.text : props.mail.text);

const processedMail = computed(() => {
  if (allowRemoteImages.value) {
    return { message: displayedHtml.value, blocked: 0 };
  }
  const { html, blocked } = blockRemoteContent(displayedHtml.value);
  return { message: html, blocked };
});

const shadowMailHtml = computed(() => allowRemoteImages.value
  ? blockRemoteContent(processedMail.value.message, { allowRemoteImages: true }).html
  : processedMail.value.message);

const handleLoadRemoteImages = () => {
  showRemoteImages.value = true;
};

const handleDelete = () => {
  props.onDelete();
};

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const closeMoreActions = () => {
  showMoreActions.value = false;
  moreActionsButton.value?.$el.focus();
};

const closeTranslationSettings = () => {
  showTranslationSettings.value = false;
  translationButton.value?.$el.focus();
};

const handleTranslate = () => {
  closeTranslationSettings();
  translateMail();
};

const toggleTextMail = () => {
  showTextMail.value = !showTextMail.value;
  closeMoreActions();
};

const openFullscreen = () => {
  showFullscreen.value = true;
  closeMoreActions();
};

const openMailDetails = () => {
  showMailDetails.value = true;
  closeMoreActions();
};

const handleUpdateMailReadStatus = async () => {
  readStatusUpdating.value = true;
  closeMoreActions();
  try {
    await props.onUpdateMailReadStatus();
  } finally {
    readStatusUpdating.value = false;
  }
};


const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};

</script>

<template>
  <div class="mail-content-renderer">
    <div class="mail-sender-bar">
      <div class="mail-details">
        <div class="sender-monogram" aria-hidden="true">{{ senderInitials }}</div>
        <div class="mail-sender-details">
          <div class="mail-address mail-address-sender">
            <span class="mail-address-label sr-only">{{ t('from') }}</span>
            <strong>{{ sender.name || sender.address || '—' }}</strong>
            <span v-if="sender.name" class="mail-sender-email">{{ sender.address }}</span>
          </div>
          <div v-if="showEMailTo" class="mail-address">
            <span class="mail-address-label">{{ t('to') }}</span>
            <span>{{ mail.address }}</span>
          </div>
          <div class="mail-details-footer">
            <n-text depth="3">{{ utcToLocalDate(mail.created_at, useUTCDate) }}</n-text>
            <n-tag v-if="mail.is_replied === 1" size="small" type="info" :bordered="false">{{ t('replied') }}</n-tag>
          </div>
        </div>
      </div>
      <div class="mail-actions">
        <n-popover v-if="translationCapability" v-model:show="showTranslationSettings" trigger="click"
          placement="bottom-end" :show-arrow="false">
          <template #trigger>
            <n-button ref="translationButton" size="small" quaternary :aria-expanded="showTranslationSettings"
              @keydown.esc.stop.prevent="closeTranslationSettings">
              <template #icon><n-icon :component="TranslateRound" /></template>
              {{ translationLabel('translate') }}
            </n-button>
          </template>
          <div class="mail-translation-settings" @keydown.esc.stop="closeTranslationSettings">
            <label class="mail-translation-language">
              <span>{{ translationLabel('targetLanguage') }}</span>
              <select ref="languageSelect" v-model="translationLanguage">
                <option v-for="option in translationLanguages" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <p>{{ translationLabel('providerNotice', { provider: translationProvider }) }}</p>
            <p v-if="exceedsLimit">
              {{ translationLabel('tooLong', { limit: translationCapability.maxLength }) }}
            </p>
            <p v-else-if="!canTranslate">{{ translationLabel('empty') }}</p>
            <n-button type="primary" size="small" :disabled="!canTranslate" :loading="translating" @click="handleTranslate">
              {{ translationLabel('translate') }}
            </n-button>
          </div>
        </n-popover>
        <n-button v-if="showReply" class="mail-reply-action" type="primary" size="small" @click="handleReply">
          <template #icon><n-icon :component="ReplyFilled" /></template>
          {{ t('reply') }}
        </n-button>
          <n-popover v-model:show="showMoreActions" trigger="click" placement="bottom-end" :show-arrow="false">
            <template #trigger>
              <n-button ref="moreActionsButton" class="mail-icon-action" size="small" quaternary
                :color="neutralActionColor" :title="t('moreActions')" :aria-label="t('moreActions')"
                :aria-expanded="showMoreActions" @keydown.esc.stop.prevent="closeMoreActions">
                <template #icon><n-icon :component="MoreHorizRound" /></template>
              </n-button>
            </template>
            <div class="mail-more-actions" @keydown.esc.stop.prevent="closeMoreActions">
              <n-button ref="downloadMailButton" tag="a" target="_blank" block quaternary size="small" :download="mail.id + '.eml'"
                :href="getDownloadEmlUrl(mail.raw)" @click="closeMoreActions">
                <template #icon><n-icon :component="CloudDownloadRound" /></template>
                {{ t('downloadMail') }}
              </n-button>
              <n-button v-if="enableMailReadStatus" block quaternary size="small" :loading="readStatusUpdating"
                @click="handleUpdateMailReadStatus">
                <template #icon>
                  <n-icon :component="mail.is_unread === 1 ? MarkEmailReadRound : MarkEmailUnreadRound" />
                </template>
                {{ mail.is_unread === 1 ? t('markAsRead') : t('markAsUnread') }}
              </n-button>
              <n-button block quaternary size="small" @click="toggleTextMail">
                <template #icon><n-icon :component="TextSnippetRound" /></template>
                {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
              </n-button>
              <n-button block quaternary size="small" @click="openFullscreen">
                <template #icon><n-icon :component="FullscreenRound" /></template>
                {{ t('fullscreen') }}
              </n-button>
              <n-button block quaternary size="small" @click="openMailDetails">
                <template #icon><n-icon :component="InfoOutlined" /></template>
                {{ t('mailDetails') }}
              </n-button>
              <n-button v-if="showReply" block quaternary size="small" @click="closeMoreActions(); handleForward()">
                <template #icon><n-icon :component="ForwardFilled" /></template>
                {{ t('forward') }}
              </n-button>
            </div>
          </n-popover>
          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
            <template #trigger>
              <n-button class="mail-icon-action" size="small" quaternary type="error" :color="deleteColor"
                :title="t('delete')" :aria-label="t('delete')">
                <template #icon><n-icon :component="DeleteOutlineRound" /></template>
              </n-button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
      </div>
    </div>
    <div v-if="mail.attachments?.length" class="mail-attachment-actions">
      <n-button size="small" quaternary :color="neutralActionColor" :title="t('attachments')"
        :aria-label="t('attachments')" @click="handleViewAttachments">
        <template #icon><n-icon :component="AttachFileRound" /></template>
        <n-space align="center" :size="4">
          <span>{{ t('attachments') }}</span>
          <n-badge :value="mail.attachments.length" :color="themeVars.tagColor" />
        </n-space>
      </n-button>
    </div>

    <!-- 外部资源阻断提示 -->
    <n-alert v-if="(!showingTranslation || !displayTextMail) && processedMail.blocked" type="warning" :show-icon="false" :bordered="false"
      class="remote-images-banner">
      <n-space align="center" justify="space-between">
        <span>{{ t('remoteImagesBlocked', { count: processedMail.blocked }) }}</span>
        <n-button size="tiny" tertiary type="warning" @click="handleLoadRemoteImages">
          <template #icon>
            <n-icon :component="ImageRound" />
          </template>
          {{ t('loadRemoteImages') }}
        </n-button>
      </n-space>
    </n-alert>

    <!-- AI 提取信息 -->
    <AiExtractInfo :metadata="mail.metadata" />

    <div v-if="translationCapability" class="mail-translation-status"
      :class="{ 'sr-only': !translating && !translationFailed && !translation }">
      <span role="status">{{
        translating ? translationLabel('translating')
          : translationFailed ? translationLabel('failed')
            : translation ? translationLabel(showingTranslation ? 'translation' : 'original') : ''
      }}</span>
      <n-button v-if="translationFailed" size="tiny" text @click="translateMail()">
        {{ translationLabel('retry') }}
      </n-button>
      <n-button v-else-if="translation" size="tiny" text @click="showingTranslation = !showingTranslation">
        {{ translationLabel(showingTranslation ? 'showOriginal' : 'showTranslation') }}
      </n-button>
    </div>

    <!-- 邮件内容 -->
    <div class="mail-content" :class="{ 'dark-mode': isDark }"
      :lang="showingTranslation ? translation?.targetLanguage : undefined" :dir="showingTranslation ? 'auto' : undefined">
      <pre v-if="displayTextMail" class="mail-text">{{ displayedText }}</pre>
      <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe" sandbox="allow-same-origin allow-popups">
      </iframe>
      <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="shadowMailHtml" :isDark="isDark" class="mail-html" />
    </div>
  </div>

  <n-modal v-model:show="showMailDetails" preset="card" :title="t('mailDetails')" :bordered="false"
    class="mail-details-modal" style="width: min(480px, calc(100vw - 32px));">
    <n-descriptions :column="1" label-placement="left" :content-style="{ overflowWrap: 'anywhere' }">
      <n-descriptions-item v-if="mail.subject" label="Subject">{{ mail.subject }}</n-descriptions-item>
      <n-descriptions-item :label="t('from')">{{ mail.source }}</n-descriptions-item>
      <n-descriptions-item v-if="mail.originalSource && mail.originalSource !== mail.source"
        label="SMTP envelope sender">{{ mail.originalSource }}</n-descriptions-item>
      <n-descriptions-item v-if="showEMailTo" :label="t('to')">{{ mail.address }}</n-descriptions-item>
      <n-descriptions-item label="Received at">{{ utcToLocalDate(mail.created_at, useUTCDate) }}</n-descriptions-item>
      <n-descriptions-item v-if="enableMailReadStatus && (mail.is_unread === 0 || mail.is_unread === 1)"
        label="Status">{{ mail.is_unread === 1 ? 'Unread' : 'Read' }}</n-descriptions-item>
      <n-descriptions-item v-if="mail.attachments?.length" :label="`Attachments (${mail.attachments.length})`">
        <n-space vertical :size="4">
          <span v-for="attachment in mail.attachments" :key="attachment.id">
            {{ attachment.filename || '—' }} · {{ attachment.size }}
          </span>
        </n-space>
      </n-descriptions-item>
      <n-descriptions-item v-if="mail.message_id" label="Message-ID">{{ mail.message_id }}</n-descriptions-item>
      <n-descriptions-item label="ID">{{ mail.id }}</n-descriptions-item>
    </n-descriptions>
  </n-modal>

  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
    style="height: 100vh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }"
        :lang="showingTranslation ? translation?.targetLanguage : undefined" :dir="showingTranslation ? 'auto' : undefined">
        <pre v-if="displayTextMail" class="mail-text">{{ displayedText }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe" sandbox="allow-same-origin allow-popups">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="shadowMailHtml" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 附件模态框 -->
  <n-modal v-model:show="showAttachments" preset="dialog" title="Dialog">
    <template #header>
      <div>{{ t('attachments') }}</div>
    </template>
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing class="center" :title="row.filename">
            <template #description>
              <n-space>
                <n-tag type="info">
                  Size: {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" ghost type="info"
                  size="small">
                  {{ t('saveToS3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="row.filename"
              :href="row.url">
              <n-icon :component="CloudDownloadRound" />
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-translation-settings {
  display: grid;
  gap: 10px;
  width: min(260px, calc(100vw - 48px));
}

.mail-translation-language {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.mail-translation-language select {
  min-height: 32px;
  padding-inline: 8px;
  border: 1px solid var(--mail-border);
  border-radius: 5px;
  color: var(--mail-ink);
  background: var(--mail-surface);
  font: inherit;
}

.mail-translation-language select:focus-visible {
  outline: 2px solid var(--mail-accent);
  outline-offset: 1px;
}

.mail-translation-settings p {
  margin: 0;
  font-size: 12px;
  color: var(--mail-muted, #626b7c);
}

.mail-translation-status {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  color: var(--mail-muted, #626b7c);
  font-size: 12px;
}

.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.mail-sender-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 14px;
  padding: 12px 14px;
  border: 1px solid var(--mail-border);
  border-radius: 12px;
  background: var(--mail-bg);
}

.mail-details {
  display: flex;
  align-items: flex-start;
  flex: 1 1 190px;
  min-width: 0;
  gap: 11px;
  font-size: 13px;
  line-height: 1.48;
}

.mail-sender-details {
  min-width: 0;
}

.sender-monogram {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 12px;
  background: var(--mail-active, #eef1ff);
  color: var(--mail-accent, #304bc7);
  font-size: 12px;
  font-weight: 680;
}

.mail-address {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.mail-address-sender {
  gap: 3px 8px;
  color: var(--mail-ink, #131827);
}

.mail-address-sender strong {
  font-size: 14px;
  font-weight: 660;
}

.mail-address-label,
.mail-sender-email,
.mail-details-footer {
  font-size: 12px;
  color: var(--mail-muted, #626b7c);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.mail-details-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}

.mail-actions,
.mail-attachment-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}

.mail-actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  max-width: 100%;
}

.mail-actions .n-button {
  min-height: 32px;
}

.mail-icon-action.n-button {
  width: 32px;
  padding: 0;
}

.mail-attachment-actions {
  margin: 0;
}

.mail-attachment-actions :deep(.n-badge-sup) {
  color: v-bind('themeVars.textColor2');
}

.mail-more-actions {
  width: 200px;
  max-width: calc(100vw - 48px);
}

.mail-more-actions :deep(.n-button) {
  justify-content: flex-start;
  height: auto;
  min-height: 32px;
  padding: 6px 8px;
}

.mail-more-actions :deep(.n-button__content) {
  white-space: normal;
  text-align: left;
}

/* Let the banner's inner space fill the alert so the button sits on the right. */
.remote-images-banner :deep(.n-space) {
  width: 100%;
}

.mail-content {
  margin-top: 4px;
  padding-top: 8px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  line-height: 1.65;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.7;
}

@media (max-width: 570px) {
  .mail-sender-bar {
    padding: 10px;
  }

  .mail-actions .n-button {
    min-height: 36px;
  }

  .mail-details {
    flex-basis: 100%;
  }

  .mail-content {
    padding-top: 7px;
  }
}

.dark-mode .mail-text {
  color: #e0e0e0;
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.dark-mode .mail-iframe {
  background-color: #fff;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.center {
  text-align: center;
}

.fullscreen-mail-content {
  height: calc(100vh - 120px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100vh - 120px);
}
</style>
