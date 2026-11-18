<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { ChevronLeftRound, ChecklistRound, CodeRound, DeleteOutlineRound, RefreshRound, SendRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { useMediaQuery } from '@vueuse/core'
import { utcToLocalDate } from '../utils'
import { blockRemoteContent } from '../utils/remote-content-policy'
import ShadowHtmlComponent from './ShadowHtmlComponent.vue'

const props = defineProps({
  enableUserDeleteEmail: Boolean,
  showEMailFrom: Boolean,
  fetchMailData: { type: Function, required: true },
  deleteMail: Function,
})

const { isDark, mailboxSplitSize, useUTCDate, autoLoadRemoteImages } = useGlobalState()
const message = useMessage()
const isMobile = useMediaQuery('(max-width: 820px)')
const emit = defineEmits(['reading'])
const { t } = useScopedI18n('components.SendBox')
const { t: tInbox } = useScopedI18n('components.MailBox')
const { t: tReader } = useScopedI18n('components.MailContentRenderer')

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const ready = ref(false)
const refreshing = ref(false)
const deleting = ref(false)
const busy = computed(() => refreshing.value || deleting.value)
const current = ref(null)
watch(() => isMobile.value && Boolean(current.value), value => emit('reading', value), { immediate: true })
const heading = ref(null)
const showCode = ref(false)
const selecting = ref(false)
const splitSize = computed(() => isMobile.value ? current.value ? 0 : 1 : mailboxSplitSize.value)
const safeHtml = computed(() => current.value?.is_html
  ? blockRemoteContent(current.value.content || '', { allowRemoteImages: autoLoadRemoteImages.value }).html
  : '')

const sendStatuses = {
  accepted: { type: 'success', label: 'statusAccepted', detail: 'statusAcceptedDetail' },
  failed: { type: 'error', label: 'statusFailed', detail: 'statusFailedDetail' },
  unknown: { type: 'warning', label: 'statusUnknown', detail: 'statusUnknownDetail' },
}

const deliveryStatuses = {
  delivered: { type: 'success', label: 'delivered', detail: 'deliveredDetail' },
  bounced: { type: 'error', label: 'bounced', detail: 'bouncedDetail' },
  failed: { type: 'error', label: 'deliveryFailed', detail: 'deliveryFailedDetail' },
  delayed: { type: 'warning', label: 'delayed', detail: 'delayedDetail' },
  suppressed: { type: 'error', label: 'suppressed', detail: 'suppressedDetail' },
  complained: { type: 'warning', label: 'complained', detail: 'complainedDetail' },
}

function parseSentRow(item) {
  const row = {
    ...item,
    status: deliveryStatuses[item.delivery_status] ?? sendStatuses[item.send_status ?? 'accepted'] ?? sendStatuses.unknown,
  };
  let raw;
  try {
    raw = JSON.parse(item.raw);
  } catch {
    return { ...row, content: item.raw };
  }
  if (raw?.version === 'v2') {
    return {
      ...row,
      to_mail: raw.to_name ? `${raw.to_name} <${raw.to_mail}>` : raw.to_mail,
      toLabel: raw.to_name || raw.to_mail,
      subject: raw.subject,
      is_html: raw.is_html,
      content: raw.content,
      raw: JSON.stringify(raw, null, 2),
    };
  }
  return {
    ...row,
    to_mail: raw?.personalizations?.map(p => p.to?.map(target => target.email).join(',')).join(';'),
    subject: raw?.subject,
    is_html: raw?.content?.[0]?.type === 'text/html',
    content: raw?.content?.[0]?.value,
    raw: JSON.stringify(raw, null, 2),
  };
}

let requestId = 0
const refresh = async () => {
  const request = ++requestId;
  try {
    refreshing.value = true;
    const result = await props.fetchMailData(pageSize.value, (page.value - 1) * pageSize.value);
    if (request !== requestId) return;
    const id = current.value?.id;
    data.value = result.results.map(parseSentRow);
    count.value = result.count;
    current.value = data.value.find(mail => mail.id === id) ?? (!isMobile.value ? data.value[0] : null) ?? null;
  } catch (error) {
    message.error(error.message || 'error');
  } finally {
    if (request === requestId) {
      ready.value = true;
      refreshing.value = false;
    }
  }
};

const openMail = async (row) => {
  if (selecting.value) {
    row.checked = !row.checked;
    return;
  }
  current.value = row;
  if (isMobile.value) {
    await nextTick();
    heading.value?.focus();
  }
};

const selectAll = (checked) => data.value.forEach((item) => { item.checked = checked });

const toggleSelection = () => {
  selecting.value = !selecting.value;
  selectAll(false);
};

const remove = async (items) => {
  if (!items.length) {
    message.error(tInbox('pleaseSelectMail'));
    return;
  }
  const deletedIds = new Set();
  try {
    deleting.value = true;
    for (const item of items) {
      await props.deleteMail(item.id);
      deletedIds.add(item.id);
    }
    message.success(t('success'));
    selecting.value = false;
  } catch (error) {
    message.error(error.message || 'error');
  } finally {
    if (deletedIds.has(current.value?.id)) current.value = null;
    if (deletedIds.size) {
      await refresh();
    }
    deleting.value = false;
  }
};

watch([page, pageSize], refresh)
watch(() => current.value?.id, () => { showCode.value = false })
onMounted(refresh);
</script>

<template>
  <section class="mailbox-workspace">
    <n-split class="mailbox-split" direction="horizontal" :size="splitSize" :min="'244px'" :max="0.63"
      :disabled="isMobile" :resize-trigger-size="isMobile ? 0 : 6" @update:size="mailboxSplitSize = $event"
      :pane1-style="{ minWidth: isMobile ? '0' : '244px' }" :pane2-style="{ minWidth: '0' }">
      <template #resize-trigger>
        <div class="split-handle"><div class="split-handle__grip" /></div>
      </template>
      <template #1>
        <div v-if="!isMobile || !current" class="mailbox-list-pane">
          <div v-if="$slots.filters && !selecting" class="mailbox-filters"><slot name="filters" /></div>
          <div class="mailbox-toolbar" :class="{ 'mailbox-toolbar-selecting': selecting }">
            <template v-if="selecting">
              <n-button size="small" tertiary @click="toggleSelection">{{ t('cancelMultiAction') }}</n-button>
              <n-button size="small" quaternary @click="selectAll(true)">{{ t('selectAll') }}</n-button>
              <n-button size="small" quaternary @click="selectAll(false)">{{ t('unselectAll') }}</n-button>
              <n-popconfirm @positive-click="remove(data.filter(mail => mail.checked))">
                <template #trigger><n-button size="small" tertiary type="error" :disabled="busy">{{ t('delete') }}</n-button></template>
                {{ t('deleteMailTip') }}
              </n-popconfirm>
            </template>
            <div v-else class="mailbox-tools">
              <n-button class="mailbox-icon-button mailbox-refresh-button" size="small" quaternary
                :title="t('refresh')" :aria-label="t('refresh')" :aria-busy="refreshing"
                :disabled="busy" @click="!busy && refresh()">
                <template #icon><n-icon class="mailbox-refresh-icon" :component="RefreshRound" /></template>
              </n-button>
              <n-button v-if="enableUserDeleteEmail" class="mailbox-icon-button" size="small" quaternary
                :title="t('multiAction')" :aria-label="t('multiAction')" @click="toggleSelection">
                <template #icon><n-icon :component="ChecklistRound" /></template>
              </n-button>
            </div>
          </div>
          <div class="mail-list-scroll mail-list-compact">
            <n-list v-if="data.length" :show-divider="false">
              <n-list-item v-for="row in data" :key="row.id" :class="{ overlay: current?.id === row.id }">
                <template v-if="selecting" #prefix>
                  <n-checkbox v-model:checked="row.checked" :aria-label="row.subject || String(row.id)" />
                </template>
                <button class="mailbox-row sent-row" type="button"
                  :aria-current="current?.id === row.id ? 'true' : undefined" @click="openMail(row)">
                  <div class="sent-row-meta">
                    <n-ellipsis :tooltip="false" :title="row.to_mail">{{ row.toLabel || row.to_mail || '—' }}</n-ellipsis>
                    <n-time class="sent-row-time" :time="new Date(`${row.created_at} UTC`)"
                      :time-zone="useUTCDate ? 'UTC' : undefined" format="MM/dd" />
                  </div>
                  <n-ellipsis class="sent-row-subject">{{ row.subject || '—' }}</n-ellipsis>
                  <div class="sent-row-bottom">
                    <n-tag class="sent-status" size="small" round :type="row.status.type" :bordered="false">
                      {{ t(row.status.label) }}
                    </n-tag>
                    <n-ellipsis v-if="showEMailFrom || (!row.is_html && row.content)" class="sent-row-preview" :tooltip="false">
                      {{ showEMailFrom ? row.address : row.content }}
                    </n-ellipsis>
                  </div>
                </button>
              </n-list-item>
            </n-list>
            <div v-else-if="ready" class="mailbox-empty">
              <n-icon :component="SendRound" :size="38" />
              <span>{{ t('emptySent') }}</span>
            </div>
            <div v-else class="mailbox-list-loading" aria-busy="true">
              <n-skeleton v-for="n in 4" :key="n" height="48px" :sharp="false" />
            </div>
          </div>
          <div v-if="count > 0" class="mailbox-pagination">
            <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" size="small"
              :page-sizes="[20, 50, 100]" :page-slot="3" :simple="isMobile" :show-size-picker="!isMobile" />
          </div>
        </div>
      </template>
      <template #2>
        <div v-if="!isMobile || current" class="mailbox-reader-pane">
          <template v-if="current">
            <div class="mailbox-reader-nav">
              <n-button v-if="isMobile" size="small" quaternary @click="current = null">
                <template #icon><n-icon :component="ChevronLeftRound" /></template>
                {{ tInbox('backToList') }}
              </n-button>
              <div class="reader-navigation">
                <n-button class="mailbox-icon-button" size="small" quaternary :aria-pressed="showCode"
                  :title="t('showCode')" :aria-label="t('showCode')" @click="showCode = !showCode">
                  <template #icon><n-icon :component="CodeRound" /></template>
                </n-button>
                <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="remove([current])">
                  <template #trigger>
                    <n-button class="mailbox-icon-button" size="small" quaternary type="error" :disabled="busy"
                      :title="t('delete')" :aria-label="t('delete')">
                      <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                    </n-button>
                  </template>
                  {{ t('deleteMailTip') }}
                </n-popconfirm>
              </div>
            </div>
            <article class="mail-item">
              <div class="mail-reader-content">
                <h2 ref="heading" class="mail-reader-subject" tabindex="-1">{{ current.subject || '—' }}</h2>
                <dl class="sent-mail-details">
                  <dt>{{ tReader('from') }}</dt><dd>{{ current.address }}</dd>
                  <dt>{{ tReader('to') }}</dt><dd>{{ current.to_mail }}</dd>
                  <dt>{{ t('status') }}</dt>
                  <dd class="sent-status-detail">
                    <n-tag size="small" round :type="current.status.type" :bordered="false">
                      {{ t(current.status.label) }}
                    </n-tag>
                    <span>{{ t(current.status.detail) }}</span>
                  </dd>
                  <template v-if="current.delivery_reason">
                    <dt>{{ t('deliveryReason') }}</dt>
                    <dd class="sent-delivery-reason">{{ current.delivery_reason }}</dd>
                  </template>
                  <template v-if="current.delivery_updated_at">
                    <dt>{{ t('deliveryUpdated') }}</dt>
                    <dd>
                      <n-time :time="new Date(current.delivery_updated_at)" :time-zone="useUTCDate ? 'UTC' : undefined" />
                    </dd>
                  </template>
                </dl>
                <p class="sent-mail-date">{{ utcToLocalDate(current.created_at, useUTCDate) }}</p>
                <pre v-if="showCode" class="sent-source">{{ current.raw }}</pre>
                <ShadowHtmlComponent v-else-if="current.is_html" :htmlContent="safeHtml" :isDark="isDark" />
                <pre v-else class="sent-body">{{ current.content }}</pre>
              </div>
            </article>
          </template>
          <div v-else-if="ready && count > 0" class="mailbox-empty mailbox-empty-reader">
            <n-icon :component="SendRound" :size="42" />
            <span>{{ t('pleaseSelectMail') }}</span>
          </div>
        </div>
      </template>
    </n-split>
  </section>
</template>

<style scoped src="./mailbox-workspace.css"></style>
<style scoped>
.sent-row-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 650;
}

.sent-row-time,
.sent-row-preview {
  color: var(--mail-muted, #626b7c);
  font-size: 11.5px;
  font-weight: 400;
}

.sent-row-time {
  flex: 0 0 auto;
}

.sent-row-subject {
  display: block;
  margin-top: 4px;
  font-weight: 520;
}

.sent-row-bottom,
.sent-status-detail {
  display: flex;
  align-items: center;
  gap: 6px 8px;
}

.sent-row-bottom {
  margin-top: 5px;
}

.sent-status {
  flex-shrink: 0;
}

.sent-row-preview {
  min-width: 0;
}

.sent-status-detail {
  flex-wrap: wrap;
  margin-block: 2px;
  color: var(--mail-muted, #626b7c);
}

.sent-mail-details {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  margin: 0;
  column-gap: 14px;
  font-size: 13px;
  line-height: 22px;
}

.sent-mail-details dt,
.sent-mail-date {
  color: var(--mail-muted, #626b7c);
}

.sent-mail-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.sent-delivery-reason {
  white-space: pre-wrap;
}

.sent-mail-date {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--mail-border, #e2e8e2);
}

.sent-body,
.sent-source {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.sent-body {
  font: inherit;
  line-height: 1.7;
}

.sent-source {
  border-radius: 10px;
  padding: 14px;
  background: var(--mail-bg, #f4f6f2);
}
</style>
