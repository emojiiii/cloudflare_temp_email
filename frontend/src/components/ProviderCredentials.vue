<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMessage, useNotification } from 'naive-ui'
import { api } from '@/api'
import { useScopedI18n } from '@/i18n/app'

const props = defineProps({ scope: { type: String, required: true } })
const { t } = useScopedI18n('components.ProviderCredentials')
const message = useMessage()
const notification = useNotification()
const base = computed(() => props.scope === 'admin' ? '/admin/provider_credentials' : '/user_api/provider_credentials')
const state = ref(null)
const failed = ref(false)
const busy = ref('')
const editing = ref('')
const keyInput = ref('')

const selectEditor = id => {
    keyInput.value = ''
    editing.value = id
}

const deepSeekFields = computed(() => [{ id: 'deepseek', name: 'DeepSeek', configured: state.value.deepseekConfigured }])
const resendFields = computed(() => (state.value?.resendDomains || []).map(({ domain, configured }) => ({
    id: `resend/${encodeURIComponent(domain)}`, name: domain, configured,
})))
const groups = computed(() => [{
    name: 'DeepSeek', description: t(props.scope === 'admin' ? 'adminDeepSeek' : 'personalDeepSeek'), fields: deepSeekFields.value,
}, ...(props.scope === 'admin' ? [{ name: 'Resend', description: t('resendDomains'), fields: resendFields.value }] : [])])

const load = async () => {
    failed.value = false
    try {
        state.value = await api.fetch(base.value, { showLoading: false })
    } catch {
        failed.value = true
    }
}

const update = async (id, method) => {
    const apiKey = method === 'PUT' ? keyInput.value.trim() : undefined
    if (busy.value || (method === 'PUT' && !apiKey)) return
    busy.value = id
    try {
        await api.fetch(`${base.value}/${id}`, {
            method,
            ...(method === 'PUT' ? { body: { apiKey } } : {}),
            showLoading: false,
        })
        if (editing.value === id) selectEditor('')
        await load()
        if (props.scope === 'admin') await api.getOpenSettings(message, notification)
        else await api.getUserSettings(message)
        message.success(t(method === 'POST' ? 'migrated' : 'saved'))
    } catch {
        message.error(t('saveFailed'))
    } finally {
        busy.value = ''
    }
}

onMounted(load)
</script>

<template>
    <div class="provider-credentials">
        <n-alert v-if="failed" type="error" role="alert">
            {{ t('loadFailed') }}
            <n-button text type="primary" @click="load">{{ t('retry') }}</n-button>
        </n-alert>
        <n-skeleton v-else-if="!state" text :repeat="4" />
        <template v-if="state && !failed">
            <n-alert v-if="state.storageConfigured === false" type="info">{{ t('storageRequired') }}</n-alert>
            <section v-if="state.canMigrateLegacy" class="workspace-panel provider-card provider-migration">
                <div>
                    <h2>{{ t('migration') }}</h2>
                    <p>{{ t('migrationDescription') }}</p>
                </div>
                <n-button type="primary" secondary :loading="busy === 'migrate'" :disabled="!!busy"
                    @click="update('migrate', 'POST')">{{ t('migrate') }}</n-button>
            </section>
            <section v-for="group in groups" :key="group.name" class="workspace-panel provider-card">
                <header>
                    <h2>{{ group.name }}</h2>
                    <p>{{ group.description }}</p>
                </header>
                <div v-for="field in group.fields" :key="field.id" class="provider-form">
                    <div class="provider-form-header">
                        <div class="provider-key-label">
                            <strong>{{ field.name === group.name ? 'API Key' : field.name }}</strong>
                            <n-tag size="small" :type="field.configured ? 'success' : 'default'" :bordered="false">
                                {{ t(field.configured ? 'configured' : 'unconfigured') }}
                            </n-tag>
                        </div>
                        <n-button v-if="editing !== field.id" secondary :disabled="!!busy || state.storageConfigured === false"
                            :aria-label="t(field.configured ? 'replaceNamed' : 'configureNamed', { name: field.name })"
                            @click="selectEditor(field.id)">{{ t(field.configured ? 'replace' : 'configure') }}</n-button>
                    </div>
                    <form v-if="editing === field.id" class="provider-input-row" @submit.prevent="update(field.id, 'PUT')">
                        <n-input v-model:value="keyInput" type="password" autofocus :disabled="!!busy"
                            :placeholder="t('newKey')" :input-props="{ 'aria-label': `${field.name} API Key`, autocomplete: 'off' }" />
                        <n-button type="primary" attr-type="submit" :loading="busy === field.id"
                            :disabled="!!busy || !keyInput.trim()">{{ t('save') }}</n-button>
                        <n-button quaternary :disabled="!!busy" @click="selectEditor('')">{{ t('cancel') }}</n-button>
                        <n-popconfirm v-if="field.configured" @positive-click="update(field.id, 'DELETE')">
                            <template #trigger>
                                <n-button quaternary type="error" :disabled="!!busy">{{ t('remove') }}</n-button>
                            </template>
                            {{ t('confirmRemove', { name: field.name }) }}
                        </n-popconfirm>
                    </form>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.provider-credentials {
    display: grid;
    gap: 14px;
    width: 100%;
    max-width: 760px;
}

.provider-card {
    display: grid;
    gap: 16px;
    padding: clamp(14px, 2vw, 22px);
}

.provider-card h2,
.provider-card p {
    margin: 0;
}

.provider-card h2 {
    font-size: 17px;
}

.provider-card p {
    margin-top: 3px;
    color: var(--mail-muted);
    font-size: 13px;
}

.provider-migration {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
}

.provider-form {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding-top: 12px;
    border-top: 1px solid var(--mail-border);
}

.provider-form-header,
.provider-key-label,
.provider-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.provider-form-header {
    flex-wrap: wrap;
    justify-content: space-between;
    font-size: 13px;
}

.provider-key-label {
    flex-wrap: wrap;
    min-width: 0;
    overflow-wrap: anywhere;
}

.provider-input-row .n-input {
    min-width: 0;
    flex: 1 1 180px;
}

@media (max-width: 480px) {
    .provider-input-row {
        flex-wrap: wrap;
    }

    .provider-input-row .n-input {
        flex-basis: 100%;
    }
}
</style>
