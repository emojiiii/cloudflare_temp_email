<script setup>
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue'

const props = defineProps({
    onCompose: { type: Function, required: true },
})

const fetchMailData = (params, options) => api.fetch(`/admin/mails_unknow?${params}`, options)
const deleteMail = (id) => api.fetch(`/admin/mails/${id}`, { method: 'DELETE' })
</script>

<template>
    <MailBox translation-scope="admin" :enable-user-delete-email="true" :fetch-mail-data="fetchMailData" :delete-mail="deleteMail"
        :show-reply="true" :on-compose="props.onCompose" />
</template>
