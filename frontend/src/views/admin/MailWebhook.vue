<script setup lang="ts">
// @ts-ignore
import { api } from '../../api'

// @ts-ignore
import WebhookComponent from '../../components/WebhookComponent.vue'

const fetchData = async () => {
    return await api.fetch('/admin/mail_webhook/settings', { showLoading: false })
}

const saveSettings = async (webhookSettings: any) => {
    await api.fetch(`/admin/mail_webhook/settings`, {
        method: 'POST',
        body: JSON.stringify(webhookSettings),
    })
}

const testSettings = async (webhookSettings: any) => {
    await api.fetch(`/admin/mail_webhook/test`, {
        method: 'POST',
        body: JSON.stringify(webhookSettings),
    })
}

const checkFilter = async (filter: any) => {
    return await api.fetch(`/admin/mail_webhook/check_filter`, {
        method: 'POST',
        body: JSON.stringify(filter),
    })
}
</script>

<template>
    <WebhookComponent admin :fetchData="fetchData" :saveSettings="saveSettings" :testSettings="testSettings" :checkFilter="checkFilter" />
</template>
