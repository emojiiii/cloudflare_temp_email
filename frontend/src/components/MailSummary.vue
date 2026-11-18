<script setup>
import { computed } from 'vue';
import { useGlobalState } from '../store';
import { utcToLocalDate } from '../utils';
import { getMailboxIdentity } from '../utils/mail-actions';
import AiExtractInfo from './AiExtractInfo.vue';
import { AttachFileRound, ReplyRound } from '@vicons/material';
import { useScopedI18n } from '@/i18n/app';

const { useUTCDate } = useGlobalState();
const { locale, t } = useScopedI18n('components.MailContentRenderer');

const props = defineProps({
  mail: { type: Object, required: true },
  showEMailTo: { type: Boolean, default: true },
  enableMailReadStatus: { type: Boolean, default: false },
  previewLineClamp: { type: Number, default: 0 },
});

const sender = computed(() => getMailboxIdentity(props.mail.source));
const unread = computed(() => props.enableMailReadStatus && props.mail.is_unread === 1);
const receivedAt = computed(() => new Date(`${props.mail.created_at} UTC`));
const shortDate = computed(() => {
  if (Number.isNaN(receivedAt.value.getTime())) return utcToLocalDate(props.mail.created_at, useUTCDate.value);
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    timeZone: useUTCDate.value ? 'UTC' : undefined,
  }).format(receivedAt.value);
});
</script>

<template>
  <div class="mail-summary" :class="{ 'mail-summary-unread': unread }">
    <div class="mail-summary-row">
      <div class="mail-summary-sender" :title="mail.source">
        <span v-if="unread" class="mail-summary-unread-dot" />
        <n-ellipsis :tooltip="false">{{ sender.name || sender.address || '—' }}</n-ellipsis>
      </div>
      <div class="mail-summary-meta">
        <span v-if="mail.is_replied === 1" class="mail-summary-replied">
          <n-icon :component="ReplyRound" aria-hidden="true" />
          {{ t('replied') }}
        </span>
        <n-icon v-if="mail.attachments?.length" :component="AttachFileRound" :title="t('attachments')" />
        <time class="mail-summary-date" :title="utcToLocalDate(mail.created_at, useUTCDate)">{{ shortDate }}</time>
      </div>
    </div>
    <div class="mail-summary-subject" :title="mail.subject || ''">
      <n-ellipsis :tooltip="false">{{ mail.subject || '—' }}</n-ellipsis>
    </div>
    <div v-if="showEMailTo && mail.address" class="mail-summary-recipient"
      :title="`${t('to')} ${mail.address}`">
      <span class="mail-summary-recipient-label">{{ t('to') }}</span>
      <n-ellipsis :tooltip="false">{{ mail.address }}</n-ellipsis>
    </div>
    <div v-if="mail.text && previewLineClamp > 0" class="mail-summary-preview">
      <n-ellipsis :line-clamp="previewLineClamp" :tooltip="false">{{ mail.text }}</n-ellipsis>
    </div>
    <AiExtractInfo :metadata="mail.metadata" compact />
  </div>
</template>

<style scoped>
.mail-summary {
  min-width: 0;
  width: 100%;
  line-height: 1.35;
}

.mail-summary-row,
.mail-summary-sender,
.mail-summary-meta {
  display: flex;
  align-items: center;
}

.mail-summary-replied {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--mail-accent);
  font-size: 11px;
  white-space: nowrap;
}

.mail-summary-row {
  gap: 8px;
}

.mail-summary-sender {
  gap: 6px;
  min-width: 0;
  flex: 1;
  color: var(--mail-muted, #626b7c);
  font-size: 12px;
  font-weight: 600;
}

.mail-summary-unread .mail-summary-sender {
  color: var(--mail-ink, #131827);
}

.mail-summary-meta {
  flex: 0 0 auto;
  gap: 4px;
  color: var(--mail-muted, #626b7c);
}

.mail-summary :deep(.n-ellipsis) {
  min-width: 0;
  max-width: 100%;
}

.mail-summary-sender :deep(.n-ellipsis) {
  flex: 1;
}

.mail-summary-subject {
  margin-top: 3px;
  color: var(--mail-ink, #131827);
  font-size: 14px;
  font-weight: 620;
}

.mail-summary-unread .mail-summary-subject {
  font-weight: 690;
}

.mail-summary-subject :deep(.n-ellipsis),
.mail-summary-recipient :deep(.n-ellipsis) {
  display: block;
}

.mail-summary-recipient,
.mail-summary-date,
.mail-summary-preview {
  color: var(--mail-muted, #626b7c);
  font-size: 11.5px;
}

.mail-summary-recipient {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  margin-top: 4px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--mail-hover);
  font-variant-numeric: tabular-nums;
}

.mail-summary-recipient-label {
  flex: none;
  font-size: 10px;
  font-weight: 600;
}

.mail-summary-preview {
  line-height: 16px;
  margin-top: 3px;
}

.mail-summary-preview :deep(.n-ellipsis) {
  display: -webkit-box;
  overflow-wrap: anywhere;
}

.mail-summary-unread-dot {
  flex: 0 0 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mail-accent, #304bc7);
}

.mail-summary :deep(.ai-extract-info) {
  margin: 4px 0 0;
}

.mail-summary :deep(.n-tag) {
  max-width: 100%;
}

.mail-summary :deep(.n-tag__content) {
  min-width: 0;
}
</style>
