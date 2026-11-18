<script setup>
import { computed, ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'

const message = useMessage()
const D1_STORAGE_PLAN_CONFIG_KEY = 'd1_storage_plan'
const dbVersionData = ref({
    need_initialization: false,
    need_migration: false,
    current_db_version: '',
    code_db_version: '',
    database_size: null
})
const selectedPlan = ref(null)
const savedPlan = ref(null)
const savingPlan = ref(false)
const fetching = ref(false)
const schemaAction = ref('')
const loaded = ref(false)

const planOptions = computed(() => [
    {
        label: t('free_plan'),
        value: 'free',
        databaseLimit: 500 * 1024 ** 2
    },
    {
        label: t('paid_plan'),
        value: 'paid',
        databaseLimit: 10 * 1024 ** 3
    }
])

const selectedPlanDetails = computed(() => (
    planOptions.value.find((plan) => plan.value === selectedPlan.value)
))

const storagePercentage = computed(() => {
    if (!selectedPlanDetails.value || dbVersionData.value.database_size === null) return 0
    return dbVersionData.value.database_size / selectedPlanDetails.value.databaseLimit * 100
})

const progressPercentage = computed(() => Math.min(storagePercentage.value, 100))

const progressStatus = computed(() => {
    if (storagePercentage.value >= 90) return 'error'
    if (storagePercentage.value >= 75) return 'warning'
    return 'success'
})

const { t } = useScopedI18n('views.admin.DatabaseManager')

const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return t('unavailable')
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / 1024 ** unitIndex
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const fetchData = async () => {
    fetching.value = true
    try {
        const [versionRes, configRes] = await Promise.all([
            api.fetch('/admin/db_version', { showLoading: false }),
            api.fetch(`/admin/config/${D1_STORAGE_PLAN_CONFIG_KEY}`, { showLoading: false })
        ]);
        if (versionRes) Object.assign(dbVersionData.value, versionRes);

        const configuredPlan = configRes?.value
        if (planOptions.value.some((plan) => plan.value === configuredPlan)) {
            selectedPlan.value = configuredPlan
            savedPlan.value = configuredPlan
        }
        loaded.value = true
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        fetching.value = false
    }
}

const savePlan = async (plan) => {
    savingPlan.value = true
    try {
        await api.fetch('/admin/config', {
            method: 'POST',
            body: { key: D1_STORAGE_PLAN_CONFIG_KEY, value: plan },
            showLoading: false,
        })
        savedPlan.value = plan
        message.success(t('planSaved'))
    } catch (error) {
        selectedPlan.value = savedPlan.value
        message.error(error.message || "error")
    } finally {
        savingPlan.value = false
    }
}

const updateDatabase = async (operation) => {
    schemaAction.value = operation
    try {
        await api.fetch(`/admin/db_${operation}`, {
            method: 'POST',
            showLoading: false,
        });
        await fetchData();
        message.success(t(operation === 'initialize' ? 'initializationSuccess' : 'migrationSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        schemaAction.value = ''
    }
}

onMounted(fetchData)
</script>


<template>
    <div class="database-settings" :aria-busy="fetching || !!schemaAction">
        <section class="workspace-panel database-card" :aria-label="t('schema')">
            <div class="database-heading">
                <h2>{{ t('schema') }}</h2>
                <n-tag v-if="loaded" size="small" :bordered="false"
                    :type="dbVersionData.need_initialization || dbVersionData.need_migration ? 'warning' : 'success'">
                    {{ t(dbVersionData.need_initialization ? 'initializationRequired'
                        : dbVersionData.need_migration ? 'migrationRequired' : 'schemaReady') }}
                </n-tag>
            </div>
            <n-skeleton v-if="!loaded && fetching" text :repeat="2" />
            <dl v-else class="database-versions">
                <div>
                    <dt>{{ t('current_db_version') }}</dt>
                    <dd>{{ dbVersionData.current_db_version || t('unavailable') }}</dd>
                </div>
                <div>
                    <dt>{{ t('code_db_version') }}</dt>
                    <dd>{{ dbVersionData.code_db_version || t('unavailable') }}</dd>
                </div>
            </dl>
            <div v-if="dbVersionData.need_initialization || dbVersionData.need_migration" class="database-action">
                <n-button v-if="dbVersionData.need_initialization" type="primary" :disabled="fetching || !!schemaAction"
                    :loading="schemaAction === 'initialize'" @click="updateDatabase('initialize')">{{ t('init') }}</n-button>
                <n-button v-else type="primary" :disabled="fetching || !!schemaAction"
                    :loading="schemaAction === 'migration'" @click="updateDatabase('migration')">{{ t('migration') }}</n-button>
            </div>
        </section>
        <section class="workspace-panel database-card storage-panel" :aria-label="t('storage_title')">
            <div class="database-heading">
                <h2>{{ t('storage_title') }}</h2>
                <div class="plan-select">
                    <span>{{ t('plan') }}</span>
                    <n-select v-model:value="selectedPlan" :options="planOptions" :placeholder="t('plan_placeholder')"
                        :disabled="!loaded || savingPlan || !!schemaAction || dbVersionData.need_initialization"
                        :loading="savingPlan" :input-props="{ 'aria-label': t('plan') }" @update:value="savePlan" />
                </div>
            </div>
            <div class="storage-stats">
                <div class="storage-stat">
                    <span>{{ t('current_database_size') }}</span>
                    <strong>{{ formatBytes(dbVersionData.database_size) }}</strong>
                </div>
                <div class="storage-stat">
                    <span>{{ t('single_database_limit') }}</span>
                    <strong>{{ selectedPlanDetails ? formatBytes(selectedPlanDetails.databaseLimit) : '—' }}</strong>
                </div>
            </div>
            <div v-if="selectedPlanDetails && dbVersionData.database_size !== null" class="storage-progress">
                <div class="storage-progress-label">
                    <span>{{ t('storage_usage') }}</span>
                    <span>{{ storagePercentage.toFixed(2) }}%</span>
                </div>
                <n-progress type="line" :percentage="progressPercentage" :status="progressStatus" :show-indicator="false" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.database-settings {
    display: grid;
    gap: 14px;
    width: min(100%, 820px);
}

.database-card {
    padding: clamp(14px, 2.5vw, 22px);
}

.database-heading {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px 18px;
    margin-bottom: 16px;
}

.database-card h2 {
    margin: 0;
    font-size: 16px;
}

.database-versions,
.storage-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
}

.database-versions dt,
.plan-select > span,
.storage-stat span,
.storage-progress-label {
    color: var(--mail-muted);
    font-size: 13px;
}

.database-versions dd {
    margin: 4px 0 0;
    font-weight: 600;
}

.database-action {
    margin-top: 16px;
}

.plan-select {
    width: min(100%, 225px);
}

.plan-select > span {
    display: block;
    margin-bottom: 6px;
}

.storage-stat {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 12px;
    border-radius: 9px;
    background: var(--mail-bg);
}

.storage-stat strong {
    font-size: 18px;
}

.storage-progress {
    margin-top: 16px;
}

.storage-progress-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
}

@media (max-width: 400px) {
    .storage-stats {
        grid-template-columns: 1fr;
    }
}
</style>
