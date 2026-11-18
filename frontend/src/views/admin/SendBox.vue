<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlternateEmailOutlined, ArrowForwardRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'
import SendBox from '../../components/SendBox.vue'

const route = useRoute()
const router = useRouter()
const { t } = useScopedI18n('views.admin.SendBox')
const { t: accountText } = useScopedI18n('views.admin.Account')

const address = computed(() => typeof route.query.address === 'string' ? route.query.address : '')
const addressQuery = ref(address.value)
const refreshKey = ref(0)
watch(address, value => { addressQuery.value = value })

const queryMail = (value) => {
    const queryAddress = value.trim()
    addressQuery.value = queryAddress
    if (queryAddress === address.value) {
        refreshKey.value++
        return
    }
    return router.push({ query: { ...route.query, address: queryAddress || undefined } })
}

const fetchData = (limit, offset) => {
    const query = new URLSearchParams({ limit, offset })
    if (address.value) query.set('address', address.value)
    return api.fetch(`/admin/sendbox?${query}`)
}

const deleteSendboxMail = (id) => api.fetch(`/admin/sendbox/${id}`, { method: 'DELETE' })
</script>

<template>
    <SendBox :key="`${address}:${refreshKey}`" :enable-user-delete-email="true" :delete-mail="deleteSendboxMail"
        :fetch-mail-data="fetchData" :show-e-mail-from="true">
        <template #filters>
            <form class="admin-sent-filter" @submit.prevent="queryMail(addressQuery)">
                <n-input-group>
                    <n-input v-model:value="addressQuery" clearable size="small" :placeholder="accountText('emailAddress')"
                        :input-props="{ 'aria-label': t('queryTip'), inputmode: 'email' }" @clear="queryMail('')">
                        <template #prefix><n-icon :component="AlternateEmailOutlined" /></template>
                    </n-input>
                    <n-button attr-type="submit" size="small" :title="t('query')" :aria-label="t('query')">
                        <template #icon><n-icon :component="ArrowForwardRound" /></template>
                    </n-button>
                </n-input-group>
            </form>
        </template>
    </SendBox>
</template>

<style scoped>
.admin-sent-filter {
    width: min(100%, 24rem);
    min-width: 0;
}
</style>
