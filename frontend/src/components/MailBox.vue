<script setup>
import { watch, onMounted, ref, shallowRef, onBeforeUnmount, computed, nextTick, h } from "vue";
import { NIcon, useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { ChevronLeftRound, ChevronRightRound, CloseRound, DeleteOutlineRound, FileDownloadOutlined,
  InboxRound, MarkEmailUnreadRound, MoreHorizRound, RefreshRound, SearchRound, ToggleOffRound, ToggleOnRound } from '@vicons/material'
import { useMediaQuery } from '@vueuse/core'
import { processItem } from '../utils/email-parser'
import { buildReplyModel, buildForwardModel } from '../utils/mail-actions'
import MailContentRenderer from "./MailContentRenderer.vue";
import MailSummary from "./MailSummary.vue";

const message = useMessage()
const isMobile = useMediaQuery('(max-width: 820px)')
const emit = defineEmits(['reading'])

const props = defineProps({
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
    required: false
  },
  showEMailTo: {
    type: Boolean,
    default: true,
    required: false
  },
  fetchMailData: {
    type: Function,
    default: () => { },
    required: true
  },
  deleteMail: {
    type: Function,
    default: () => { },
    required: false
  },
  showReply: {
    type: Boolean,
    default: false,
    required: false
  },
  translationScope: {
    type: String,
    default: 'mailbox'
  },
  onCompose: { type: Function, required: true },
  showSaveS3: {
    type: Boolean,
    default: false,
    required: false
  },
  saveToS3: {
    type: Function,
    default: (mail_id, filename, blob) => { },
    required: false
  },
  showFilterInput: {
    type: Boolean,
    default: false,
    required: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  updateMailReadStatus: {
    type: Function,
    default: () => { }
  },
})

const searchText = ref('')
const searchQuery = ref('')
const onlyUnread = ref(false)
let searchTimer

const applySearch = () => {
  clearTimeout(searchTimer)
  searchQuery.value = searchText.value.trim()
}

watch(searchText, value => {
  clearTimeout(searchTimer)
  if (!value.trim()) searchQuery.value = ''
  else searchTimer = setTimeout(applySearch, 250)
})

const toggleUnreadFilter = () => {
  applySearch()
  onlyUnread.value = !onlyUnread.value
}

const hasFilter = computed(() => !!searchQuery.value || onlyUnread.value)

const {
  mailboxSplitSize, mailListView, mailListPreviewLineClamp, loading,
  autoRefresh, configAutoRefreshInterval
} = useGlobalState()
const autoRefreshInterval = ref(configAutoRefreshInterval.value)
const data = ref([])
const timer = ref(null)

const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const ready = ref(false)
const loadFailed = ref(false)
const requestedPage = shallowRef(null)
const listScroll = ref(null)
const readerHeading = ref(null)
const curMail = ref(null)
watch(() => isMobile.value && Boolean(curMail.value), value => emit('reading', value), { immediate: true })
const singlePane = computed(() => isMobile.value || (mailListView.value && !curMail.value));
const splitSize = computed(() => isMobile.value && curMail.value ? 0 : singlePane.value ? 1 : mailboxSplitSize.value);

const mailListPreviewLineClampValue = computed(() => {
  const value = Number(mailListPreviewLineClamp.value)
  if (!Number.isFinite(value)) return 0
  return Math.min(5, Math.max(0, Math.round(value)))
})

const openMail = (mail) => {
  curMail.value = mail
  if (mail?.is_unread !== 1 || !props.enableMailReadStatus) return
  mail.is_unread = 0
  void props.updateMailReadStatus(mail.id, false).then(refreshUnreadList, () => { mail.is_unread = 1 })
}

const toggleCurrentMailUnread = async () => {
  if (!curMail.value || !props.enableMailReadStatus) return
  const mail = curMail.value
  const previousValue = mail.is_unread
  const isUnread = previousValue !== 1
  mail.is_unread = isUnread ? 1 : 0
  try {
    await props.updateMailReadStatus(mail.id, isUnread)
    message.success(t("success"))
    await refreshUnreadList()
  } catch {
    mail.is_unread = previousValue
  }
}

const newerMail = computed(() => data.value.findLast(mail => mail.id > curMail.value?.id))
const olderMail = computed(() => data.value.find(mail => mail.id < curMail.value?.id))
const canGoPrevMail = computed(() => !!curMail.value && (!!newerMail.value || page.value > 1))
const canGoNextMail = computed(() => !!curMail.value && (!!olderMail.value || count.value > page.value * pageSize.value))

const prevMail = async () => {
  if (!canGoPrevMail.value) return
  if (newerMail.value) {
    openMail(newerMail.value)
  } else if (page.value > 1) {
    page.value--
    const refreshed = await refresh()
    if (refreshed && data.value.length > 0) {
      openMail(data.value[data.value.length - 1])
    }
  }
}

const nextMail = async () => {
  if (!canGoNextMail.value) return
  if (olderMail.value) {
    openMail(olderMail.value)
  } else if (count.value > page.value * pageSize.value) {
    page.value++
    const refreshed = await refresh()
    if (refreshed && data.value.length > 0) {
      openMail(data.value[0])
    }
  }
}

const masterCheckbox = ref(null)
const batchAction = ref(null)
const selectedMails = computed(() => data.value.filter(mail => mail.checked))
const selectedCount = computed(() => selectedMails.value.length)
const allVisibleSelected = computed(() => selectedCount.value > 0 && selectedCount.value === data.value.length)
const partiallySelected = computed(() => selectedCount.value > 0 && !allVisibleSelected.value)

const { t } = useScopedI18n('components.MailBox')
const emptyLabel = computed(() => loadFailed.value ? t('loadFailed') : hasFilter.value ? t('noMatches') : t('emptyInbox'))
const listOptions = computed(() => [{
  key: 'auto-refresh',
  label: autoRefresh.value ? t('refreshAfter', { msg: autoRefreshInterval.value }) : t('autoRefresh'),
  icon: () => h(NIcon, { component: autoRefresh.value ? ToggleOnRound : ToggleOffRound }),
}])

const selectListOption = (key) => {
  if (key === 'auto-refresh') autoRefresh.value = !autoRefresh.value;
}

const setupAutoRefresh = async (autoRefresh) => {
  // auto refresh every configAutoRefreshInterval seconds
  autoRefreshInterval.value = configAutoRefreshInterval.value;
  if (autoRefresh) {
    clearInterval(timer.value);
    timer.value = setInterval(async () => {
      if (loading.value || requestedPage.value || selectedCount.value || batchAction.value) return;
      autoRefreshInterval.value--;
      if (autoRefreshInterval.value <= 0) {
        autoRefreshInterval.value = configAutoRefreshInterval.value;
        await backFirstPageAndRefresh();
      }
    }, 1000)
  } else {
    clearInterval(timer.value)
    timer.value = null
  }
}

watch(autoRefresh, async (autoRefresh, old) => {
  setupAutoRefresh(autoRefresh)
}, { immediate: true })

let loadedPage = { page: page.value, pageSize: pageSize.value }
let unmounted = false
watch([page, pageSize], async ([page, pageSize]) => {
  if (requestedPage.value?.page === page && requestedPage.value.pageSize === pageSize) return
  if (loadedPage.page !== page || loadedPage.pageSize !== pageSize) {
    await refresh();
  }
})

const refresh = async ({ keepReader = false } = {}) => {
  if (unmounted) return false
  requestedPage.value?.controller.abort()
  const controller = new AbortController()
  const pagination = { page: page.value, pageSize: pageSize.value, controller }
  requestedPage.value = pagination
  try {
    const params = new URLSearchParams({
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
    })
    if (searchQuery.value) params.set('q', searchQuery.value)
    if (onlyUnread.value) params.set('unread', '1')
    const { results, count: totalCount } = await props.fetchMailData(params, {
      signal: controller.signal,
      showLoading: false,
    })
    if (controller.signal.aborted) return false
    const lastPage = Math.max(1, Math.ceil(totalCount / pagination.pageSize))
    if (pagination.page > lastPage) {
      page.value = lastPage
      return refresh({ keepReader })
    }
    const selection = new Set(keepReader ? selectedMails.value.map(mail => mail.id) : [])
    const parsed = await Promise.all(results.map(async (item) => {
      item.checked = selection.has(item.id);
      return await processItem(item);
    }));
    if (controller.signal.aborted) return false;
    const previousId = curMail.value?.id;
    data.value = parsed;
    loadedPage = pagination
    count.value = totalCount;
    loadFailed.value = false;
    curMail.value = data.value.find(mail => mail.id === previousId)
      ?? (keepReader ? curMail.value : null)
      ?? (!isMobile.value && !mailListView.value ? data.value[0] : null)
      ?? null;
    if (!keepReader) listScroll.value?.scrollTo(0, 0)
    return true
  } catch (error) {
    if (controller.signal.aborted) return false;
    loadFailed.value = true;
    message.error(error.message || "error");
    console.error(error);
    if (requestedPage.value === pagination && page.value === pagination.page && pageSize.value === pagination.pageSize) {
      page.value = loadedPage.page
      pageSize.value = loadedPage.pageSize
    }
  } finally {
    if (requestedPage.value === pagination) {
      requestedPage.value = null;
      ready.value = true;
    }
  }
};

const backFirstPageAndRefresh = async () => {
  page.value = 1;
  await refresh();
}

const refreshUnreadList = async () => {
  if (onlyUnread.value) await refresh({ keepReader: true })
}

watch([searchQuery, onlyUnread], () => {
  data.value = []
  count.value = 0
  curMail.value = null
  ready.value = false
  void backFirstPageAndRefresh()
})

const clickRow = async (row) => {
  if (batchAction.value) return
  if (selectedCount.value) {
    row.checked = !row.checked;
    return;
  }
  if (mailListView.value && curMail.value?.id === row.id) {
    curMail.value = null;
    return;
  }
  openMail(row);
  if (isMobile.value) {
    await nextTick();
    readerHeading.value?.focus();
  }
};

const deleteMail = async () => {
  try {
    await props.deleteMail(curMail.value.id);
    message.success(t("success"));
    curMail.value = null;
    await refresh();
  } catch (error) {
    message.error(error.message || "error");
  }
};

const openComposer = (mode) => {
  const mail = curMail.value;
  const draft = mode === 'reply' ? buildReplyModel(mail) : buildForwardModel(mail, t('forwardMail'));
  props.onCompose(draft, mail, mode, () => refresh({ keepReader: true }));
};

const onSpiltSizeChange = (size) => {
  mailboxSplitSize.value = size;
}

const saveToS3Proxy = async (filename, blob) => {
  await props.saveToS3(curMail.value.id, filename, blob);
}

const selectVisible = (checked) => {
  data.value.forEach((item) => {
    item.checked = checked;
  });
}

const clearSelection = async (event) => {
  if (!selectedCount.value || batchAction.value || event?.defaultPrevented) return
  event?.preventDefault()
  selectVisible(false)
  await nextTick()
  masterCheckbox.value?.focus()
}

const multiActionDeleteMail = async () => {
  if (batchAction.value || !selectedCount.value) return
  const selection = selectedMails.value
  const deletedIds = new Set()
  batchAction.value = 'delete'
  try {
    loading.value = true;
    for (const mail of selection) {
      await props.deleteMail(mail.id);
      deletedIds.add(mail.id)
    }
    message.success(t("success"));
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    if (deletedIds.size) {
      data.value = data.value.filter(mail => !deletedIds.has(mail.id))
      count.value = Math.max(0, count.value - deletedIds.size)
      if (deletedIds.has(curMail.value?.id)) curMail.value = null
    }
    if (deletedIds.size === selection.length) await refresh()
    batchAction.value = null
    loading.value = false;
    if (!selectedCount.value) {
      await nextTick()
      masterCheckbox.value?.focus()
    }
  }
}

const multiActionDownload = async () => {
  if (batchAction.value || !selectedCount.value) return
  const selection = selectedMails.value
  batchAction.value = 'download'
  try {
    loading.value = true;
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip();
    for (const mail of selection) {
      zip.file(`${mail.id}.eml`, mail.raw);
    }
    const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }))
    const download = document.createElement('a')
    download.href = url
    download.download = `mails-${new Date().toISOString().replace(/:/g, '-')}.zip`
    document.body.append(download)
    download.click()
    download.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    batchAction.value = null
    loading.value = false;
  }
}

onMounted(async () => {
  await refresh();
});

onBeforeUnmount(() => {
  unmounted = true
  clearInterval(timer.value)
  clearTimeout(searchTimer)
  requestedPage.value?.controller.abort()
})
</script>

<template>
  <section class="mailbox-workspace" @keydown.esc="clearSelection">
    <n-split class="mailbox-split" direction="horizontal" :size="splitSize" :max="0.63" :min="'244px'"
      :disabled="singlePane" :resize-trigger-size="singlePane ? 0 : 6" :on-update:size="onSpiltSizeChange"
      :pane1-style="{ minWidth: singlePane ? '0' : '244px' }" :pane2-style="{ minWidth: '0' }">
      <template #resize-trigger>
        <div class="split-handle"><div class="split-handle__grip" /></div>
      </template>
      <template #1>
        <div v-if="!isMobile || !curMail" class="mailbox-list-pane" :class="{ 'mailbox-list-selecting': selectedCount }">
          <div v-if="$slots.filters" class="mailbox-filters">
            <slot name="filters" />
          </div>
          <div class="mailbox-toolbar" :class="{ 'mailbox-toolbar-selecting': selectedCount }">
            <div class="mailbox-selection-control">
              <n-checkbox ref="masterCheckbox" :checked="allVisibleSelected" :indeterminate="partiallySelected"
                :disabled="!data.length || !!batchAction" :aria-label="t('selectAll')" :title="t('selectAll')"
                @update:checked="selectVisible" />
            </div>
            <template v-if="selectedCount">
              <span class="mailbox-selection-count" role="status">{{ t('selectedCount', { count: selectedCount }) }}</span>
              <div class="mailbox-tools mailbox-selection-actions">
                <n-button class="mailbox-batch-action" size="small" quaternary :disabled="!!batchAction"
                  :loading="batchAction === 'download'" :aria-label="t('downloadMail')" :title="t('downloadMail')"
                  @click="multiActionDownload">
                  <template #icon><n-icon :component="FileDownloadOutlined" /></template>
                  <span class="mailbox-batch-label">{{ t('download') }}</span>
                </n-button>
                <n-popconfirm v-if="enableUserDeleteEmail" placement="bottom-end" @positive-click="multiActionDeleteMail">
                  <template #trigger>
                    <n-button class="mailbox-batch-action" size="small" quaternary type="error"
                      :disabled="!!batchAction" :loading="batchAction === 'delete'"
                      :aria-label="t('delete')" :title="t('delete')">
                      <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                      <span class="mailbox-batch-label">{{ t('delete') }}</span>
                    </n-button>
                  </template>
                  {{ t('deleteSelectedTip', { count: selectedCount }) }}
                </n-popconfirm>
                <n-button class="mailbox-icon-button mailbox-dismiss-selection" size="small" quaternary
                  :disabled="!!batchAction" :title="t('cancelMultiAction')" :aria-label="t('cancelMultiAction')"
                  @click="clearSelection">
                  <template #icon><n-icon :component="CloseRound" /></template>
                </n-button>
              </div>
            </template>
            <template v-else>
              <n-input v-if="showFilterInput" v-model:value="searchText" class="mailbox-search" size="small"
                :placeholder="t('searchInbox')" :input-props="{ 'aria-label': t('searchInbox') }" :maxlength="200" clearable
                @keydown.enter="!$event.isComposing && applySearch()">
                <template #prefix><n-icon :component="SearchRound" /></template>
              </n-input>
              <n-button v-if="showFilterInput && enableMailReadStatus" class="mailbox-unread-filter" size="small"
                :type="onlyUnread ? 'primary' : 'default'" :secondary="onlyUnread" :quaternary="!onlyUnread"
                :aria-pressed="onlyUnread" :aria-label="t('unreadOnly')" :title="t('unreadOnly')" @click="toggleUnreadFilter">
                <template #icon><n-icon :component="MarkEmailUnreadRound" /></template>
                <span>{{ t('unreadOnly') }}</span>
              </n-button>
              <div class="mailbox-tools">
                <n-button class="mailbox-icon-button mailbox-refresh-button" size="small" quaternary
                  :title="t('refresh')" :aria-label="t('refresh')" :aria-busy="!!requestedPage"
                  :disabled="!!requestedPage" @click="!requestedPage && backFirstPageAndRefresh()">
                  <template #icon><n-icon class="mailbox-refresh-icon" :component="RefreshRound" /></template>
                </n-button>
                <n-dropdown trigger="click" placement="bottom-end" :options="listOptions" @select="selectListOption">
                  <n-button class="mailbox-icon-button" :class="{ 'mailbox-icon-active': autoRefresh }"
                    size="small" quaternary :title="t('autoRefresh')" :aria-label="t('autoRefresh')">
                    <template #icon><n-icon :component="MoreHorizRound" /></template>
                  </n-button>
                </n-dropdown>
              </div>
            </template>
          </div>
          <div ref="listScroll" class="mail-list-scroll mail-list-compact">
            <n-list v-if="data.length" :show-divider="false">
              <n-list-item v-for="row in data" :key="row.id"
                :class="{ overlay: curMail?.id === row.id, 'mail-list-selected': row.checked,
                  'mail-list-unread': enableMailReadStatus && row.is_unread === 1 }">
                <template #prefix>
                  <n-checkbox v-model:checked="row.checked" class="mailbox-row-checkbox" :disabled="!!batchAction"
                    :aria-label="t('selectMail', { subject: row.subject || String(row.id) })" />
                </template>
                <button class="mailbox-row" type="button" :aria-current="curMail?.id === row.id ? 'true' : undefined"
                  @click="clickRow(row)">
                  <MailSummary :mail="row" :showEMailTo="showEMailTo" :enableMailReadStatus="enableMailReadStatus"
                    :previewLineClamp="mailListPreviewLineClampValue" />
                </button>
              </n-list-item>
            </n-list>
            <div v-else-if="ready" class="mailbox-empty">
              <n-icon :component="InboxRound" :size="38" />
              <span>{{ emptyLabel }}</span>
            </div>
            <div v-else class="mailbox-list-loading" aria-busy="true">
              <n-skeleton v-for="n in 4" :key="n" height="48px" :sharp="false" />
            </div>
          </div>
          <div v-if="count > 0" class="mailbox-pagination">
            <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" size="small"
              :page-sizes="[20, 50, 100]" :page-slot="3" :disabled="!!batchAction" :simple="isMobile"
              :show-size-picker="!isMobile" />
          </div>
        </div>
      </template>
      <template #2>
        <div v-if="!singlePane || (isMobile && curMail)" class="mailbox-reader-pane">
          <template v-if="curMail">
            <div class="mailbox-reader-nav">
              <n-button v-if="isMobile || mailListView" size="small" quaternary @click="curMail = null">
                <template #icon><n-icon :component="ChevronLeftRound" /></template>
                {{ t('backToList') }}
              </n-button>
              <div class="reader-navigation">
                <n-button class="mailbox-icon-button" size="small" quaternary :disabled="!canGoPrevMail || !!batchAction" :title="t('prevMail')"
                  :aria-label="t('prevMail')" @click="prevMail">
                  <template #icon><n-icon :component="ChevronLeftRound" /></template>
                </n-button>
                <n-button class="mailbox-icon-button" size="small" quaternary :disabled="!canGoNextMail || !!batchAction" :title="t('nextMail')"
                  :aria-label="t('nextMail')" @click="nextMail">
                  <template #icon><n-icon :component="ChevronRightRound" /></template>
                </n-button>
              </div>
            </div>
            <article class="mail-item">
              <div class="mail-reader-content">
                <h2 ref="readerHeading" class="mail-reader-subject" tabindex="-1">{{ curMail.subject || '—' }}</h2>
                <MailContentRenderer :mail="curMail" :showEMailTo="showEMailTo" :translation-scope="translationScope"
                  :enableUserDeleteEmail="enableUserDeleteEmail" :showReply="showReply" :showSaveS3="showSaveS3"
                  :enableMailReadStatus="enableMailReadStatus" :onUpdateMailReadStatus="toggleCurrentMailUnread"
                  :onDelete="deleteMail" :onReply="() => openComposer('reply')"
                  :onForward="() => openComposer('forward')" :onSaveToS3="saveToS3Proxy" />
              </div>
            </article>
          </template>
          <div v-else-if="ready" class="mailbox-empty mailbox-empty-reader">
            <n-icon :component="InboxRound" :size="42" />
            <span>{{ count === 0 ? emptyLabel : t('pleaseSelectMail') }}</span>
          </div>
        </div>
      </template>
    </n-split>

  </section>
</template>

<style scoped src="./mailbox-workspace.css"></style>
