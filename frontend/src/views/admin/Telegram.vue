<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { api } from '../../api'

const { t } = useScopedI18n('views.admin.Telegram')
const { openSettings } = useGlobalState()
const message = useMessage()
const busy = ref('')
const status = ref<{ info: { url: string; pending_update_count: number; last_error_message?: string }; commands: object[] } | null>(null)
const settings = ref({
    enableAllowList: false,
    allowList: [] as string[],
    miniAppUrl: '',
    enableGlobalMailPush: false,
    globalMailPushList: [] as string[]
})

async function run(action: string, work: () => Promise<void>) {
    if (busy.value) return
    busy.value = action
    try {
        await work()
    } catch (error) {
        message.error((error as Error).message)
    } finally {
        busy.value = ''
    }
}

const load = () => run('load', async () => {
    Object.assign(settings.value, await api.fetch('/admin/telegram/settings', { showLoading: false }))
})

const fetchStatus = () => run('status', async () => {
    status.value = await api.fetch('/admin/telegram/status', { showLoading: false })
})

const init = () => run('init', async () => {
    await api.fetch('/admin/telegram/init', { method: 'POST', showLoading: false })
    message.success(t('successTip'))
})

const save = () => run('save', async () => {
    await api.fetch('/admin/telegram/settings', { method: 'POST', body: settings.value, showLoading: false })
    message.success(t('successTip'))
})

watch(() => openSettings.value.telegramConfigured, configured => {
    if (configured) void load()
}, { immediate: true })
</script>

<template>
    <n-alert v-if="!openSettings.telegramConfigured" type="info" :title="t('notConfigured')">
        {{ t('configurationRequired') }}
    </n-alert>
    <div v-else class="telegram-settings">
        <section class="workspace-panel telegram-section">
            <div class="telegram-section-header">
                <h2>{{ t('connection') }}</h2>
                <div class="workspace-toolbar">
                    <n-button secondary :loading="busy === 'status'" :disabled="!!busy" @click="fetchStatus">{{ t('status') }}</n-button>
                    <n-button secondary type="primary" :loading="busy === 'init'" :disabled="!!busy" @click="init">{{ t('init') }}</n-button>
                </div>
            </div>
            <template v-if="status">
                <div class="telegram-status">
                    <n-tag :type="status.info.url ? 'success' : 'default'" :bordered="false">
                        {{ t(status.info.url ? 'connected' : 'notConfigured') }}
                    </n-tag>
                    <span>{{ t('pendingUpdates', { count: status.info.pending_update_count }) }}</span>
                </div>
                <n-alert v-if="status.info.last_error_message" type="warning">{{ status.info.last_error_message }}</n-alert>
                <details class="telegram-details">
                    <summary>{{ t('details') }}</summary>
                    <pre>{{ JSON.stringify(status, null, 2) }}</pre>
                </details>
            </template>
        </section>

        <form class="workspace-panel telegram-section" @submit.prevent="save">
            <div class="telegram-section-header">
                <h2>{{ t('notifications') }}</h2>
                <n-button type="primary" attr-type="submit" :loading="busy === 'save'" :disabled="!!busy">{{ t('save') }}</n-button>
            </div>
            <div class="telegram-setting">
                <div class="telegram-setting-label">
                    <span>{{ t('enableTelegramAllowList') }}</span>
                    <n-switch v-model:value="settings.enableAllowList" :aria-label="t('enableTelegramAllowList')" :disabled="!!busy" />
                </div>
                <n-select v-if="settings.enableAllowList" v-model:value="settings.allowList" filterable multiple tag
                    :placeholder="t('telegramAllowList')" :aria-label="t('telegramAllowList')" :disabled="!!busy">
                    <template #empty>{{ t('manualInputPrompt') }}</template>
                </n-select>
            </div>
            <div class="telegram-setting">
                <div class="telegram-setting-label">
                    <span>{{ t('enableGlobalMailPush') }}</span>
                    <n-switch v-model:value="settings.enableGlobalMailPush" :aria-label="t('enableGlobalMailPush')" :disabled="!!busy" />
                </div>
                <template v-if="settings.enableGlobalMailPush">
                    <n-select v-model:value="settings.globalMailPushList" filterable multiple tag
                        :placeholder="t('globalMailPushList')" :aria-label="t('globalMailPushList')" :disabled="!!busy">
                        <template #empty>{{ t('manualInputPrompt') }}</template>
                    </n-select>
                    <small>{{ t('globalMailPushListTip') }}</small>
                </template>
            </div>
            <n-form-item-row :label="t('miniAppUrl')" :show-feedback="false">
                <n-input v-model:value="settings.miniAppUrl" placeholder="https://" :disabled="!!busy" />
            </n-form-item-row>
        </form>
    </div>
</template>

<style scoped>
.telegram-settings {
    display: grid;
    gap: 16px;
    max-width: 800px;
}

.telegram-section {
    display: grid;
    gap: 12px;
    padding: clamp(14px, 2vw, 22px);
}

.telegram-section-header,
.telegram-setting-label,
.telegram-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.telegram-section-header h2 {
    margin: 0;
    font-size: 17px;
}

.telegram-setting {
    display: grid;
    gap: 8px;
    padding-block: 10px;
    border-top: 1px solid var(--mail-border);
}

.telegram-setting small,
.telegram-details,
.telegram-status {
    color: var(--mail-muted);
    font-size: 13px;
}

.telegram-details summary {
    cursor: pointer;
}

.telegram-details pre {
    max-width: 100%;
    overflow: auto;
}
</style>
