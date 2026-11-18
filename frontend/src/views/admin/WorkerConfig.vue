<script setup>
import { computed, onMounted, ref } from 'vue'
import { SearchRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'

const { t } = useScopedI18n('views.admin.WorkerConfig')
const settings = ref({})
const query = ref('')
const pending = ref(false)
const failure = ref('')
const rows = computed(() => Object.entries(settings.value).filter(([name]) =>
    name.toLowerCase().includes(query.value.trim().toLowerCase())))

const fetchData = async () => {
    pending.value = true
    failure.value = ''
    try {
        settings.value = await api.fetch('/admin/worker/configs', { showLoading: false })
    } catch (error) {
        failure.value = error.message
    } finally {
        pending.value = false
    }
}

onMounted(fetchData)
</script>

<template>
    <section class="workspace-panel worker-configuration" :aria-busy="pending">
        <div class="worker-toolbar">
            <n-input v-model:value="query" clearable :placeholder="t('search')"
                :input-props="{ 'aria-label': t('search') }" :disabled="pending">
                <template #prefix><n-icon :component="SearchRound" aria-hidden="true" /></template>
            </n-input>
        </div>
        <n-skeleton v-if="pending" text :repeat="5" class="worker-feedback" />
        <div v-else-if="failure" class="worker-feedback">
            <n-alert type="error">{{ failure }}</n-alert>
            <n-button size="small" secondary @click="fetchData">{{ t('retry') }}</n-button>
        </div>
        <div v-else-if="!rows.length" class="worker-feedback">
            <n-empty :description="t('empty')" />
        </div>
        <dl v-else class="worker-fields">
            <div v-for="[name, value] in rows" :key="name" class="worker-field">
                <dt><code>{{ name }}</code></dt>
                <dd>
                    <n-tag v-if="typeof value === 'boolean'" size="small" :bordered="false" :type="value ? 'success' : 'default'">
                        {{ t(value ? 'enabled' : 'disabled') }}
                    </n-tag>
                    <span v-else-if="value === '' || value == null || (Array.isArray(value) && !value.length)" class="worker-unset">—</span>
                    <div v-else-if="Array.isArray(value) && value.every(item => typeof item === 'string')" class="worker-list">
                        <n-tag v-for="(item, index) in value" :key="index" :bordered="false" size="small">{{ item }}</n-tag>
                    </div>
                    <pre v-else-if="typeof value === 'object'">{{ JSON.stringify(value, null, 2) }}</pre>
                    <span v-else>{{ value }}</span>
                </dd>
            </div>
        </dl>
    </section>
</template>

<style scoped>
.worker-configuration {
    width: min(100%, 850px);
}

.worker-toolbar,
.worker-feedback {
    padding: 14px 18px;
}

.worker-toolbar .n-input {
    width: min(360px, 100%);
}

.worker-feedback .n-button {
    margin-top: 10px;
}

.worker-fields {
    margin: 0;
}

.worker-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: start;
    gap: 5px 14px;
    padding: 10px 18px;
    border-top: 1px solid var(--mail-border);
    overflow-wrap: anywhere;
}

.worker-field code,
.worker-field pre {
    font-size: 12px;
}

.worker-field pre {
    margin: 0;
    white-space: pre-wrap;
}

.worker-field dd {
    min-width: 0;
    margin: 0;
}

.worker-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.worker-unset {
    color: var(--mail-muted);
}

@media (max-width: 570px) {
    .worker-field {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
