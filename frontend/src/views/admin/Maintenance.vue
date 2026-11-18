<script setup>
import { ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { AddFilled, DeleteFilled } from '@vicons/material'

import { api } from '../../api'

const message = useMessage()
const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const runningCleanup = ref('')
const pendingCleanup = ref(null)
const showCleanupConfirm = ref(false)
const cleanupModel = ref({
    enableMailsAutoCleanup: false,
    cleanMailsDays: 30,
    enableUnknowMailsAutoCleanup: false,
    cleanUnknowMailsDays: 30,
    enableSendBoxAutoCleanup: false,
    cleanSendBoxDays: 30,
    enableAddressAutoCleanup: false,
    cleanAddressDays: 30,
    enableInactiveAddressAutoCleanup: false,
    cleanInactiveAddressDays: 30,
    enableUnboundAddressAutoCleanup: false,
    cleanUnboundAddressDays: 30,
    enableEmptyAddressAutoCleanup: false,
    cleanEmptyAddressDays: 30,
    customSqlCleanupList: []
})

const { t } = useScopedI18n('views.admin.Maintenance')

const cleanupGroups = [
    {
        title: 'messages',
        rules: [
            { type: 'mails', label: 'mailBoxLabel', enabled: 'enableMailsAutoCleanup', days: 'cleanMailsDays' },
            { type: 'mails_unknow', label: 'mailUnknowLabel', enabled: 'enableUnknowMailsAutoCleanup', days: 'cleanUnknowMailsDays' },
            { type: 'sendbox', label: 'sendBoxLabel', enabled: 'enableSendBoxAutoCleanup', days: 'cleanSendBoxDays' },
        ],
    },
    {
        title: 'addresses',
        rules: [
            { type: 'addressCreated', label: 'addressCreateLabel', enabled: 'enableAddressAutoCleanup', days: 'cleanAddressDays' },
            { type: 'inactiveAddress', label: 'inactiveAddressLabel', enabled: 'enableInactiveAddressAutoCleanup', days: 'cleanInactiveAddressDays' },
            { type: 'unboundAddress', label: 'unboundAddressLabel', enabled: 'enableUnboundAddressAutoCleanup', days: 'cleanUnboundAddressDays' },
            { type: 'emptyAddress', label: 'emptyAddressLabel', enabled: 'enableEmptyAddressAutoCleanup', days: 'cleanEmptyAddressDays' },
        ],
    },
]

const confirmCleanup = (rule) => {
    pendingCleanup.value = { type: rule.type, label: t(rule.label), days: cleanupModel.value[rule.days] }
    showCleanupConfirm.value = true
}

const cleanup = async () => {
    const { type, days } = pendingCleanup.value
    runningCleanup.value = type
    try {
        await api.fetch('/admin/cleanup', {
            method: 'POST',
            body: { cleanType: type, cleanDays: days },
            showLoading: false,
        });
        message.success(t('cleanupSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        runningCleanup.value = ''
    }
}

const addCustomSql = () => {
    if (!cleanupModel.value.customSqlCleanupList) {
        cleanupModel.value.customSqlCleanupList = [];
    }
    cleanupModel.value.customSqlCleanupList.push({
        id: Date.now().toString(),
        name: '',
        sql: '',
        enabled: false
    });
}

const removeCustomSql = (index) => {
    cleanupModel.value.customSqlCleanupList.splice(index, 1);
}

const fetchData = async () => {
    loading.value = true
    try {
        const res = await api.fetch('/admin/auto_cleanup', { showLoading: false });
        if (res) Object.assign(cleanupModel.value, res);
        if (!cleanupModel.value.customSqlCleanupList) {
            cleanupModel.value.customSqlCleanupList = [];
        }
        loaded.value = true
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false
    }
}

const save = async () => {
    saving.value = true
    try {
        await api.fetch('/admin/auto_cleanup', {
            method: 'POST',
            body: cleanupModel.value,
            showLoading: false,
        });
        message.success(t('saveSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        saving.value = false
    }
}

onMounted(fetchData)
</script>


<template>
    <div class="cleanup-settings" :aria-busy="loading || saving || !!runningCleanup">
        <div class="cleanup-toolbar">
            <p>{{ t('cronTip') }}</p>
            <n-button v-if="loaded" type="primary" :loading="saving" :disabled="saving || !!runningCleanup" @click="save">
                {{ t('save') }}
            </n-button>
            <n-button v-else-if="!loading" secondary @click="fetchData">{{ t('retry') }}</n-button>
        </div>
        <n-skeleton v-if="loading" text :repeat="4" />
        <template v-else-if="loaded">
            <section v-for="group in cleanupGroups" :key="group.title"
                class="workspace-panel cleanup-panel" :aria-label="t(group.title)">
                <h2>{{ t(group.title) }}</h2>
                <div v-for="rule in group.rules" :key="rule.type" class="cleanup-row">
                    <strong>{{ t(rule.label) }}</strong>
                    <div class="cleanup-controls">
                        <n-checkbox v-model:checked="cleanupModel[rule.enabled]" :disabled="saving"
                            :aria-label="t('enableRule', { rule: t(rule.label) })">{{ t('autoCleanup') }}</n-checkbox>
                        <n-input-number v-model:value="cleanupModel[rule.days]" :min="0" :max="1000" size="small"
                            :show-button="false" :disabled="saving"
                            :input-props="{ 'aria-label': t('ruleDays', { rule: t(rule.label) }) }">
                            <template #suffix>{{ t('days') }}</template>
                        </n-input-number>
                        <n-button size="small" quaternary type="error" :loading="runningCleanup === rule.type"
                            :disabled="saving || !!runningCleanup || cleanupModel[rule.days] == null"
                            :aria-label="t('cleanupRule', { rule: t(rule.label) })" @click="confirmCleanup(rule)">
                            {{ t('cleanupNow') }}
                        </n-button>
                    </div>
                </div>
            </section>

            <details class="workspace-panel cleanup-panel cleanup-sql">
                <summary>{{ t('customSqlCleanup') }}</summary>
                <div class="cleanup-sql-content">
                    <p>{{ t('customSqlTip') }}</p>
                    <div v-for="(item, index) in cleanupModel.customSqlCleanupList" :key="item.id" class="sql-rule">
                        <div class="sql-rule-heading">
                            <n-input v-model:value="item.name" :placeholder="t('sqlNamePlaceholder')" :disabled="saving"
                                :input-props="{ 'aria-label': t('sqlName') }" />
                            <n-checkbox v-model:checked="item.enabled" :disabled="saving">{{ t('autoCleanup') }}</n-checkbox>
                            <n-button type="error" quaternary :disabled="saving" @click="removeCustomSql(index)">
                                <template #icon><n-icon :component="DeleteFilled" aria-hidden="true" /></template>
                                {{ t('deleteCustomSql') }}
                            </n-button>
                        </div>
                        <n-input v-model:value="item.sql" type="textarea" :placeholder="t('sqlPlaceholder')"
                            :input-props="{ 'aria-label': t('sqlStatement'), spellcheck: false }"
                            :autosize="{ minRows: 2 }" :disabled="saving" class="sql-input" />
                    </div>
                    <n-button size="small" :disabled="saving" @click="addCustomSql">
                        <template #icon><n-icon :component="AddFilled" aria-hidden="true" /></template>
                        {{ t('addCustomSql') }}
                    </n-button>
                </div>
            </details>
        </template>
        <n-modal v-if="pendingCleanup" v-model:show="showCleanupConfirm" preset="dialog" type="error"
            :title="t('cleanupRule', { rule: pendingCleanup.label })"
            :content="t('cleanupConfirm', { rule: pendingCleanup.label, days: pendingCleanup.days })"
            :positive-text="t('cleanupNow')" :negative-text="t('cancel')" :loading="!!runningCleanup"
            style="width: min(460px, calc(100vw - 32px))" :mask-closable="false" @positive-click="cleanup" />
    </div>
</template>

<style scoped>
.cleanup-settings {
    display: grid;
    gap: 14px;
    width: min(100%, 870px);
}

.cleanup-toolbar,
.cleanup-row,
.cleanup-controls,
.sql-rule-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
}

.cleanup-toolbar,
.cleanup-row {
    justify-content: space-between;
}

.cleanup-toolbar p,
.cleanup-sql-content p {
    color: var(--mail-muted);
    font-size: 13px;
    margin: 0;
}

.cleanup-toolbar p {
    flex: 1 1 15rem;
}

.cleanup-panel h2,
.cleanup-sql summary {
    margin: 0;
    padding: 15px 18px;
    font-size: 15px;
    font-weight: 650;
}

.cleanup-row {
    min-width: 0;
    padding: 10px 18px;
    border-top: 1px solid var(--mail-border);
}

.cleanup-row strong {
    font-size: 13px;
}

.cleanup-controls .n-input-number {
    width: 5.75rem;
}

.cleanup-sql summary {
    cursor: pointer;
}

.cleanup-sql-content {
    display: grid;
    justify-items: start;
    gap: 12px;
    padding: 0 18px 15px;
}

.sql-rule {
    display: grid;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--mail-border);
    border-radius: 9px;
}

.sql-rule-heading .n-input {
    flex: 1 1 11rem;
    min-width: 0;
}

.sql-input {
    font-family: ui-monospace, monospace;
}

@media (max-width: 600px) {
    .cleanup-row {
        align-items: start;
        flex-direction: column;
    }
}
</style>
