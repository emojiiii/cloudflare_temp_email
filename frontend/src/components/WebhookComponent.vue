<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '@/store'
import type { DropdownOption } from 'naive-ui'
import FilterEditor from './FilterEditor.vue'
import type { FilterExpression, FilterOperator } from '@/utils/filter'

const props = defineProps({
    admin: Boolean,
    fetchData: {
        type: Function,
        default: () => { },
        required: true
    },
    saveSettings: {
        type: Function,
        default: (webhookSettings: WebhookSettings) => { },
        required: true
    },
    testSettings: {
        type: Function,
        default: (webhookSettings: WebhookSettings) => { },
        required: true
    },
    checkFilter: {
        type: Function,
        required: true
    },
})

const message = useMessage()

const { t } = useScopedI18n('components.WebhookComponent')
const { openSettings } = useGlobalState()

class WebhookSettings {
    filter?: FilterExpression | null
    enabled: boolean = false
    url: string = ''
    method: string = 'POST'
    headers: string = JSON.stringify({}, null, 2)
    body: string = JSON.stringify({}, null, 2)
}

interface WebhookPreset {
    name: string
    doc: string
    settings: WebhookSettings
}

const presets: WebhookPreset[] = [
    {
        name: 'Message Pusher',
        doc: 'https://github.com/songquanpeng/message-pusher',
        settings: {
            enabled: true,
            url: 'https://msgpusher.com/push/username',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "token": "token",
                "title": "${subject}",
                "description": "${subject}",
                "content": "*${subject}*\n\nFrom: ${from}\nTo: ${to}\n\n${parsedText}\n"
            }, null, 2),
        },
    },
    {
        name: 'Bark',
        doc: 'https://github.com/Finb/Bark',
        settings: {
            enabled: true,
            url: 'https://api.day.app/YOUR_KEY',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "title": "${subject}",
                "body": "From: ${from}\nTo: ${to}\n\n${parsedText}",
                "group": "email"
            }, null, 2),
        },
    },
    {
        name: 'ntfy',
        doc: 'https://docs.ntfy.sh/publish/',
        settings: {
            enabled: true,
            url: 'https://ntfy.sh/YOUR_TOPIC',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "topic": "YOUR_TOPIC",
                "title": "${subject}",
                "message": "From: ${from}\nTo: ${to}\n\n${parsedText}",
                "tags": ["envelope"]
            }, null, 2),
        },
    },
    {
        name: 'Telegram Bot',
        doc: 'https://core.telegram.org/bots/api#sendmessage',
        settings: {
            enabled: true,
            url: 'https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "chat_id": "YOUR_CHAT_ID",
                "text": "New Email\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
            }, null, 2),
        },
    },
    {
        name: 'WeChat Work',
        doc: 'https://developer.work.weixin.qq.com/document/path/91770',
        settings: {
            enabled: true,
            url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "msgtype": "text",
                "text": {
                    "content": "New Email\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
                }
            }, null, 2),
        },
    },
    {
        name: 'Discord',
        doc: 'https://discord.com/developers/docs/resources/webhook',
        settings: {
            enabled: true,
            url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "content": "**New Email**\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
            }, null, 2),
        },
    },
]

const presetDropdownOptions: DropdownOption[] = presets.map((preset, index) => ({
    label: preset.name,
    key: index,
}))

const handlePresetSelect = (key: number) => {
    const preset = presets[key]
    if (!preset) {
        message.error('Invalid preset')
        return
    }
    Object.assign(webhookSettings.value, preset.settings)
    presetDocs.value = preset.doc
    message.success(t('fillInDemoTip'))
}

const webhookSettings = ref<WebhookSettings>(new WebhookSettings())
const state = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const available = computed(() => !openSettings.value.fetched || openSettings.value.enableWebhook)
const saving = ref(false)
const presetDocs = ref('')
const savedDelivery = ref<'missingDestination' | 'paused' | 'active'>('missingDestination')
const updateDeliveryStatus = ({ url, enabled }: Pick<WebhookSettings, 'url' | 'enabled'>) => {
    savedDelivery.value = url.trim() ? (enabled ? 'active' : 'paused') : 'missingDestination'
}
const showTestModal = ref(false)
const testMode = ref('random')
const testMailId = ref<number | null>(null)
const testing = ref(false)
const filterValid = ref(true)
const savedFilter = ref<FilterExpression | null>(null)
const showFilterCheckModal = ref(false)
const filterCheckMode = ref('random')
const filterCheckMailId = ref<number | null>(null)
const checkingFilter = ref(false)
const filterFields = ['from', 'to', 'subject', 'text', 'html']
const fields = computed(() => filterFields.map(value => ({ value, label: t(`filter_${value}`) })))
const isFieldAllowed = (field: string) => filterFields.includes(field)
    || /^header\.[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(field)
const operators = computed<FilterOperator[]>(() => [
    ...['equals', 'contains', 'startsWith', 'endsWith'].flatMap(value => [
        { value, label: t(`filter_${value}`) },
        { value: `${value}CaseSensitive`, label: `${t(`filter_${value}`)} (${t('filter_caseSensitive')})` },
    ]),
    { value: 'regex', label: t('filter_regex'),
        options: [{ key: 'flags', label: t('filter_flags'), placeholder: 'i / m / s' }] },
])

const fetchData = async () => {
    state.value = 'loading'
    try {
        const res = await props.fetchData()
        Object.assign(webhookSettings.value, res)
        savedFilter.value = res.filter ?? null
        updateDeliveryStatus(webhookSettings.value)
        state.value = 'ready'
    } catch (error) {
        loadError.value = (error as Error).message
        state.value = 'error'
    }
}

const saveSettings = async () => {
    if (saving.value || (webhookSettings.value.enabled && !filterValid.value)) return
    const url = webhookSettings.value.url.trim()
    if (!url && webhookSettings.value.enabled) {
        message.error(t('urlMissing'))
        return
    }
    const settings = {
        ...webhookSettings.value,
        url,
        filter: webhookSettings.value.enabled ? webhookSettings.value.filter : savedFilter.value,
    }
    saving.value = true
    try {
        await props.saveSettings(settings)
        savedFilter.value = settings.filter ?? null
        updateDeliveryStatus(settings)
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    } finally {
        saving.value = false
    }
}

const checkFilter = async () => {
    if (checkingFilter.value || !filterValid.value) return
    if (filterCheckMode.value === 'specified' && (!Number.isSafeInteger(filterCheckMailId.value) || (filterCheckMailId.value ?? 0) <= 0)) {
        message.error(t('invalidMailId'))
        return
    }
    checkingFilter.value = true
    try {
        const result = await props.checkFilter({
            filter: webhookSettings.value.filter,
            ...(filterCheckMode.value === 'specified' ? { mail_id: filterCheckMailId.value } : {}),
        })
        if (result.matched) message.success(t('filterMatched'))
        else message.info(t('filterSkipped'))
        showFilterCheckModal.value = false
    } catch (error) {
        message.error((error as Error).message || 'error')
    } finally {
        checkingFilter.value = false
    }
}

const testSettings = async () => {
    if (testing.value) return
    const url = webhookSettings.value.url.trim()
    if (!url) {
        message.error(t('urlMissing'))
        return
    }
    if (testMode.value === 'specified' && (!Number.isSafeInteger(testMailId.value) || (testMailId.value ?? 0) <= 0)) {
        message.error(t('invalidMailId'))
        return
    }
    testing.value = true
    try {
        await props.testSettings({
            ...webhookSettings.value,
            url,
            ...(testMode.value === 'specified' ? { mail_id: testMailId.value } : {}),
        })
        message.success(t('successTip'))
        showTestModal.value = false
    } catch (error) {
        message.error((error as Error).message || "error");
    } finally {
        testing.value = false
    }
}

onMounted(fetchData)
</script>

<template>
    <div class="webhook-settings">
        <n-card v-if="state === 'ready'" class="workspace-panel webhook-card" :bordered="false" :content-style="{ padding: 0 }">
            <header class="webhook-section webhook-row">
                <div class="webhook-title">
                    <h2>{{ t('delivery') }}</h2>
                    <n-tag :type="savedDelivery === 'active' ? 'success' : 'default'" size="small" :bordered="false" role="status">
                        {{ t(savedDelivery) }}
                    </n-tag>
                </div>
                <div class="webhook-control">
                    <span>{{ t('enable') }}</span>
                    <n-switch v-model:value="webhookSettings.enabled" :aria-label="t('enable')" />
                </div>
            </header>

            <section class="webhook-section">
                <div class="webhook-row webhook-section-heading">
                    <h3>{{ t('destination') }}</h3>
                    <div class="workspace-toolbar">
                        <n-button v-if="presetDocs" tag="a" :href="presetDocs" target="_blank" rel="noopener noreferrer" text>
                            {{ t('presetDocs') }}
                        </n-button>
                        <n-dropdown :options="presetDropdownOptions" @select="handlePresetSelect">
                            <n-button secondary size="small">{{ t('presets') }}</n-button>
                        </n-dropdown>
                    </div>
                </div>
                <div class="webhook-destination">
                    <n-form-item-row label="URL" :show-feedback="false">
                        <n-input v-model:value="webhookSettings.url" placeholder="https://example.com/webhook"
                            :input-props="{ 'aria-label': 'URL', spellcheck: false, autocapitalize: 'off' }" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('method')" :show-feedback="false">
                        <n-select v-model:value="webhookSettings.method" filterable tag :options="[{ label: 'POST', value: 'POST' }]" />
                    </n-form-item-row>
                </div>
            </section>

            <section v-show="webhookSettings.enabled" class="webhook-section">
                <div class="webhook-row webhook-section-heading">
                    <h3>{{ t('filter') }}</h3>
                    <n-button :disabled="!filterValid" secondary size="small" @click="showFilterCheckModal = true">
                        {{ t('checkFilter') }}
                    </n-button>
                </div>
                <div class="webhook-filter">
                    <FilterEditor v-model="webhookSettings.filter" :fields="fields" :operators="operators" allow-custom-fields
                        :is-field-allowed="isFieldAllowed" @validity-change="filterValid = $event" />
                    <p>{{ t('filterHelp') }}</p>
                </div>
            </section>

            <section class="webhook-section">
                <h3>{{ t('requestTemplate') }}</h3>
                <div class="webhook-request">
                    <n-form-item-row :label="t('headers')" :show-feedback="false">
                        <n-input v-model:value="webhookSettings.headers" class="webhook-code" type="textarea"
                            :autosize="{ minRows: 4, maxRows: 10 }" :input-props="{ 'aria-label': t('headers'), spellcheck: false }" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('body')" :show-feedback="false">
                        <n-input v-model:value="webhookSettings.body" class="webhook-code" type="textarea"
                            :autosize="{ minRows: 4, maxRows: 10 }" :input-props="{ 'aria-label': t('body'), spellcheck: false }" />
                    </n-form-item-row>
                </div>
            </section>

            <footer class="webhook-section webhook-actions">
                <n-button @click="showTestModal = true" secondary
                    :disabled="!webhookSettings.enabled || !webhookSettings.url.trim()">
                    {{ t('test') }}
                </n-button>
                <n-button @click="saveSettings" type="primary" :loading="saving"
                    :disabled="webhookSettings.enabled && (!filterValid || !webhookSettings.url.trim())">
                    {{ t('save') }}
                </n-button>
            </footer>
        </n-card>
        <div v-else-if="state === 'loading'" class="workspace-panel webhook-section" role="status" aria-busy="true">
            <n-skeleton text :repeat="3" />
        </div>
        <n-alert v-else-if="!available" type="info"
            :title="t(admin ? 'notEnabledAdmin' : 'notEnabled')" />
        <n-alert v-else type="error" :title="t('loadFailed')">
            <div class="webhook-row">
                <span>{{ loadError }}</span>
                <n-button size="small" @click="fetchData">{{ t('retry') }}</n-button>
            </div>
        </n-alert>
        <n-modal v-model:show="showFilterCheckModal" preset="card" :title="t('checkFilter')"
            class="filter-check-modal" style="width: min(420px, calc(100vw - 32px))" :mask-closable="!checkingFilter"
            :close-on-esc="!checkingFilter" :closable="!checkingFilter">
            <n-text depth="3" style="display: block; margin-bottom: 16px">{{ t('filterCheckTip') }}</n-text>
            <n-radio-group v-model:value="filterCheckMode" :disabled="checkingFilter">
                <n-space>
                    <n-radio value="random">{{ t('randomMail') }}</n-radio>
                    <n-radio value="specified">{{ t('specifiedMail') }}</n-radio>
                </n-space>
            </n-radio-group>
            <n-form-item v-if="filterCheckMode === 'specified'" :label="t('mailId')" style="margin-top: 16px">
                <n-input-number v-model:value="filterCheckMailId" :min="1" :max="Number.MAX_SAFE_INTEGER"
                    :precision="0" :show-button="false" :disabled="checkingFilter" :placeholder="t('mailId')"
                    style="width: 100%" />
            </n-form-item>
            <template #footer>
                <n-flex justify="end">
                    <n-button :disabled="checkingFilter" @click="showFilterCheckModal = false">{{ t('cancel') }}</n-button>
                    <n-button type="primary" :loading="checkingFilter" :disabled="!filterValid" @click="checkFilter">{{ t('checkFilter') }}</n-button>
                </n-flex>
            </template>
        </n-modal>
        <n-modal v-model:show="showTestModal" preset="card" :title="t('test')"
            style="width: min(420px, calc(100vw - 32px))" :mask-closable="!testing"
            :close-on-esc="!testing" :closable="!testing">
            <p class="webhook-test-note">{{ t('deliveryTestTip') }}</p>
            <n-radio-group v-model:value="testMode" :disabled="testing">
                <n-space>
                    <n-radio value="random">{{ t('randomMail') }}</n-radio>
                    <n-radio value="specified">{{ t('specifiedMail') }}</n-radio>
                </n-space>
            </n-radio-group>
            <n-form-item v-if="testMode === 'specified'" :label="t('mailId')" style="margin-top: 16px">
                <n-input-number v-model:value="testMailId" :min="1" :max="Number.MAX_SAFE_INTEGER"
                    :precision="0" :show-button="false" :disabled="testing" :placeholder="t('mailId')"
                    style="width: 100%" />
            </n-form-item>
            <template #footer>
                <n-flex justify="end">
                    <n-button :disabled="testing" @click="showTestModal = false">{{ t('cancel') }}</n-button>
                    <n-button type="primary" :loading="testing" @click="testSettings">{{ t('test') }}</n-button>
                </n-flex>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.webhook-settings {
    width: 100%;
    max-width: 860px;
    min-width: 0;
}

.webhook-card {
    background: var(--mail-surface);
    border: 1px solid var(--mail-border);
    border-radius: var(--mail-radius);
}

.webhook-section {
    padding: clamp(14px, 2vw, 22px) clamp(14px, 2.25vw, 24px);
}

.webhook-section + .webhook-section {
    border-top: 1px solid var(--mail-border);
}

.webhook-row, .webhook-control, .webhook-title, .webhook-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.webhook-row {
    flex-wrap: wrap;
    justify-content: space-between;
}

.webhook-title {
    flex-wrap: wrap;
}

.webhook-control {
    font-size: 13px;
}

.webhook-settings :is(h2, h3) {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
}

.webhook-section-heading {
    margin-bottom: 10px;
}

.webhook-destination, .webhook-request {
    display: grid;
    gap: 12px;
}

.webhook-destination {
    grid-template-columns: minmax(0, 1fr) minmax(96px, 132px);
}

.webhook-request {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
    margin-top: 12px;
}

.webhook-code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
}

.webhook-actions {
    justify-content: flex-end;
}

.webhook-filter {
    width: 100%;
    min-width: 0;
}

.webhook-filter p, .webhook-test-note {
    margin: 8px 0 0;
    color: var(--mail-muted);
    font-size: 12px;
}

.webhook-test-note {
    margin: 0 0 12px;
}

@media (max-width: 560px) {
    .webhook-destination, .webhook-request {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
