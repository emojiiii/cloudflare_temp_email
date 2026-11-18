<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../api'
import { useGlobalState } from '../../store'
import MailBox from '../../components/MailBox.vue'
import MailboxTabs from '../../components/MailboxTabs.vue'

const props = defineProps({
    onCompose: { type: Function, required: true },
})

const route = useRoute()
const router = useRouter()
const { openSettings } = useGlobalState()
const address = computed(() => typeof route.query.address === 'string' ? route.query.address : '')

const selectMailbox = mailbox => {
    if (mailbox !== address.value) return router.push({ query: { ...route.query, address: mailbox || undefined } })
}

const fetchMailboxes = ({ limit, offset, query, signal }) => {
    const params = new URLSearchParams({ limit, offset, sort_by: 'name', sort_order: 'ascend' })
    if (query) params.set('query', query)
    return api.fetch(`/admin/address?${params}`, { signal, showLoading: false })
}

const fetchMailData = (params, options) => {
    if (address.value) params.set('address', address.value)
    return api.fetch(`/admin/mails?${params}`, options)
}

const deleteMail = (id) => api.fetch(`/admin/mails/${id}`, { method: 'DELETE' })
const updateMailReadStatus = (id, isUnread) => api.fetch(`/admin/mails/${id}/read`, {
    method: 'PATCH', body: JSON.stringify({ isUnread }), showLoading: false,
})
</script>

<template>
    <MailboxTabs :model-value="address" :fetch-mailboxes="fetchMailboxes" allow-exact
        @update:model-value="selectMailbox" />
    <MailBox :key="address" translation-scope="admin" :enable-user-delete-email="true" :fetch-mail-data="fetchMailData"
        :delete-mail="deleteMail" :show-e-mail-to="!address" show-filter-input :show-reply="true"
        :enable-mail-read-status="openSettings.enableMailReadStatus" :update-mail-read-status="updateMailReadStatus"
        :on-compose="props.onCompose" />
</template>
