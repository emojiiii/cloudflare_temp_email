<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { StarOutlineRound, StarRound } from '@vicons/material'
import { api } from '@/api'
import { useScopedI18n } from '@/i18n/app'

const sender = defineModel({ type: String, default: '' })
const props = defineProps({ inputId: String, disabled: Boolean })
const emit = defineEmits(['default-address'])
const { t } = useScopedI18n('views.admin.SendMail')
const message = useMessage()

const preferencePath = '/admin/send_mail/preferences'
const preferences = ref(null)
const preferencesFailed = ref(false)
const refreshPreferences = ref(0)
const savingPreference = ref(false)
const domains = ref([])
const addresses = ref([])
const query = ref('')
const loading = ref(true)
const failed = ref(false)
const refresh = ref(0)
const manual = ref(false)
const prefixInput = ref(null)
const addressSelect = ref(null)
const preferredDomain = ref('')

const splitAddress = (address) => {
    const at = address.lastIndexOf('@')
    return at < 0 ? [address, ''] : [address.slice(0, at), address.slice(at + 1).toLowerCase()]
}
const senderParts = computed(() => splitAddress(sender.value.trim()))
const prefix = computed(() => senderParts.value[0])
const domain = computed(() => senderParts.value[1] || preferredDomain.value || domains.value[0] || '')
const currentAddress = computed(() => `${prefix.value}@${senderParts.value[1]}`)
const favoriteAddresses = computed(() => preferences.value?.addresses ?? [])
const isFavorite = computed(() => favoriteAddresses.value.includes(currentAddress.value))
const favoriteAction = computed(() => t(isFavorite.value ? 'removeFavorite' : 'addFavorite'))
const defaultAddress = computed(() => {
    const address = preferences.value?.defaultAddress
    return address && domains.value.includes(splitAddress(address)[1]) ? address : ''
})
const isDefault = computed(() => defaultAddress.value === currentAddress.value)
const hasPreferenceAddress = computed(() => Boolean(preferences.value)
    && /^[^\s@<>]+$/.test(prefix.value) && domains.value.includes(senderParts.value[1]))
const canSavePreference = computed(() => hasPreferenceAddress.value && !props.disabled && !savingPreference.value)
const options = computed(() => {
    const search = query.value.toLowerCase()
    const exactFavorites = favoriteAddresses.value.filter(address => domains.value.includes(splitAddress(address)[1]))
    const groups = [
        { key: 'favorite-senders', label: t('favoriteSenders'), addresses: exactFavorites.filter(address => address.toLowerCase().includes(search)) },
        { key: 'existing-senders', label: t('existingSenders'), addresses: addresses.value.filter(address => !exactFavorites.includes(address)) },
    ]
    return groups.filter(group => group.addresses.length).map(group => ({
        key: group.key, label: group.label, type: 'group',
        children: group.addresses.map(address => ({ label: address, value: address })),
    }))
})

watch(defaultAddress, address => emit('default-address', address))

watch(refreshPreferences, async (_, __, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    preferencesFailed.value = false
    try {
        const result = await api.fetch(preferencePath, { signal: controller.signal, showLoading: false })
        if (!controller.signal.aborted) preferences.value = result
    } catch {
        if (!controller.signal.aborted) preferencesFailed.value = true
    }
}, { immediate: true })

watch([query, refresh], ([search], _, onCleanup) => {
    const controller = new AbortController()
    loading.value = true
    failed.value = false
    addresses.value = []
    const timer = setTimeout(async () => {
        try {
            const params = new URLSearchParams({ query: search })
            const result = await api.fetch(`/admin/send_mail/options?${params}`, { signal: controller.signal, showLoading: false })
            if (controller.signal.aborted) return
            domains.value = result.domains
            addresses.value = result.addresses
        } catch {
            if (!controller.signal.aborted) failed.value = true
        } finally {
            if (!controller.signal.aborted) loading.value = false
        }
    }, search ? 180 : 0)
    onCleanup(() => {
        clearTimeout(timer)
        controller.abort()
    })
}, { immediate: true })

const chooseAddress = (address) => { sender.value = address || '' }
const changePrefix = (value) => {
    const [local, suffix] = splitAddress(value.trim())
    sender.value = local ? `${local}@${suffix || domain.value}` : ''
}
const changeDomain = (event) => {
    const suffix = event.target.value
    preferredDomain.value = suffix
    if (prefix.value) sender.value = `${prefix.value}@${suffix}`
}
const savePreference = async (action) => {
    if (!canSavePreference.value) return
    savingPreference.value = true
    try {
        preferences.value = await api.fetch(preferencePath, {
            method: 'PATCH',
            body: JSON.stringify({ action, address: currentAddress.value }),
            showLoading: false,
        })
    } catch (error) {
        message.error(error.message)
    } finally {
        savingPreference.value = false
    }
}
const toggleMode = async () => {
    manual.value = !manual.value
    query.value = ''
    await nextTick()
    if (manual.value) prefixInput.value?.focus()
    else addressSelect.value?.focus()
}
</script>

<template>
    <div class="sender-picker">
        <div class="sender-picker-row">
            <div v-if="manual" class="sender-address-parts">
                <n-input ref="prefixInput" :value="prefix" :disabled="props.disabled" autocomplete="off"
                    :placeholder="t('senderPrefix')" :input-props="{ id: props.inputId, 'aria-label': t('senderPrefix'), maxlength: 254 }"
                    @update:value="changePrefix" />
                <select :value="domain" :aria-label="t('senderDomain')" :disabled="props.disabled || !domains.length" @change="changeDomain">
                    <option v-if="!domains.includes(domain)" :value="domain" disabled>{{ domain ? `@${domain}` : t('senderDomain') }}</option>
                    <option v-for="suffix in domains" :key="suffix" :value="suffix">@{{ suffix }}</option>
                </select>
            </div>
            <n-select v-else ref="addressSelect" :value="sender || null" :options="options"
                :placeholder="t('pickSender')" :loading="loading" :disabled="props.disabled"
                :input-props="{ id: props.inputId, maxlength: 254, autocomplete: 'off' }" filterable remote clearable
                @search="value => query = value.trim()" @update:value="chooseAddress" @update:show="open => { if (!open) query = '' }">
                <template #empty>{{ failed ? t('senderLoadFailed') : t('noSenderMatches') }}</template>
            </n-select>
            <n-button class="sender-favorite" quaternary :type="isFavorite ? 'warning' : 'default'"
                :aria-label="favoriteAction" :aria-pressed="isFavorite" :title="favoriteAction"
                :disabled="!canSavePreference" @click="savePreference(isFavorite ? 'remove' : 'add')">
                <template #icon><n-icon :component="isFavorite ? StarRound : StarOutlineRound" /></template>
            </n-button>
        </div>
        <div class="sender-picker-tools">
            <n-button text :disabled="props.disabled || (loading && !domains.length) || (!domains.length && !manual)" @click="toggleMode">
                {{ manual ? t('useSavedSender') : t('useCustomSender') }}
            </n-button>
            <span v-if="isDefault" role="status">{{ t('defaultSender') }}</span>
            <n-button v-else-if="hasPreferenceAddress" text :disabled="!canSavePreference"
                @click="savePreference('set-default')">{{ t('setDefaultSender') }}</n-button>
            <template v-if="failed">
                <span role="status">{{ t('senderLoadFailed') }}</span>
                <n-button text @click="refresh++">{{ t('retrySenderLoad') }}</n-button>
            </template>
            <span v-else-if="!loading && !domains.length" role="status">{{ t('noSenderDomains') }}</span>
            <template v-if="preferencesFailed">
                <span role="status">{{ t('preferencesLoadFailed') }}</span>
                <n-button text @click="refreshPreferences++">{{ t('retrySenderLoad') }}</n-button>
            </template>
        </div>
    </div>
</template>

<style scoped>
.sender-picker {
    display: grid;
    gap: 8px;
    min-width: 0;
    width: 100%;
}

.sender-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 4px;
}

.sender-address-parts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(100px, 46%);
    gap: 4px;
}

.sender-address-parts select {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding-inline: 7px 4px;
    border: 1px solid var(--mail-border);
    border-radius: 8px;
    background: var(--mail-surface);
    color: var(--mail-ink);
    font-size: 13px;
    text-overflow: ellipsis;
}

.sender-address-parts select:focus-visible {
    outline: 2px solid var(--mail-accent);
    outline-offset: -2px;
}

.sender-favorite.n-button {
    width: 34px;
    padding-inline: 0;
}

.sender-picker-tools {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 7px;
    min-height: 22px;
    font-size: 12px;
    color: var(--mail-muted);
}

.sender-picker-tools .n-button {
    padding-block: 3px;
    font-size: inherit;
    color: var(--mail-accent);
}
</style>
