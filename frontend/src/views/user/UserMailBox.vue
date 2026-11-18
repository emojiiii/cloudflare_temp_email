<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../../api'
import { useGlobalState } from '../../store'
import { getAIReplySource } from '../../utils/mail-actions'
import MailBox from '../../components/MailBox.vue'
import MailboxTabs from '../../components/MailboxTabs.vue'

const emit = defineEmits(['reply'])
const { openSettings, isReceiveOnlyAccount } = useGlobalState()
const route = useRoute()
const router = useRouter()
const addressFilter = computed(() => typeof route.query.address === 'string' ? route.query.address : '')

const fetchMailData = (params, options) => {
    if (addressFilter.value) params.set('address', addressFilter.value)
    return api.fetch(`/user_api/mails?${params}`, options)
}

const fetchMailboxes = ({ limit, offset, query, signal }) => {
    const params = new URLSearchParams({ limit, offset })
    if (query) params.set('query', query)
    return api.fetch(`/user_api/bind_address?${params}`, { signal, showLoading: false })
}

const selectMailbox = address => {
    if (address !== addressFilter.value) return router.push({ query: { ...route.query, address: address || undefined } })
}

const deleteMail = (id) => api.fetch(`/user_api/mails/${id}`, { method: 'DELETE' })
const updateMailReadStatus = (id, isUnread) => api.fetch(`/user_api/mails/${id}/read`, {
    method: 'PATCH', body: JSON.stringify({ isUnread }), showLoading: false,
})

const openCompose = (draft, mail, mode) => {
    emit('reply', { ...draft, address: mail.address, mode, replyKey: `${Date.now()}-${mail.id}-${mode}` },
        mode === 'reply' ? getAIReplySource(mail) : null)
}

</script>

<template>
    <MailboxTabs :model-value="addressFilter" :fetch-mailboxes="fetchMailboxes" @update:model-value="selectMailbox" />
    <MailBox :key="addressFilter || ''" translation-scope="user"
        :enable-user-delete-email="openSettings.enableUserDeleteEmail && !isReceiveOnlyAccount"
        :fetch-mail-data="fetchMailData" :delete-mail="deleteMail" show-filter-input :show-e-mail-to="!addressFilter"
        :enable-mail-read-status="openSettings.enableMailReadStatus" :update-mail-read-status="updateMailReadStatus"
        :show-reply="openSettings.enableSendMail && !isReceiveOnlyAccount" :on-compose="openCompose" />
</template>
