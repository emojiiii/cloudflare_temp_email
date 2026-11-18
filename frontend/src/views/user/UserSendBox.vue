<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'
import { useGlobalState } from '../../store'
import SendBox from '../../components/SendBox.vue'

const SendMail = defineAsyncComponent(() => import('./SendMail.vue'))

const ADDRESS_PAGE_SIZE = 100

const props = defineProps({
    mode: {
        type: String,
        default: 'send_mail',
    },
    replyDraft: Object,
    replySource: Object,
})

const emit = defineEmits(['sent'])

const message = useMessage()
const { openSettings, userSettings } = useGlobalState()
const { t } = useScopedI18n('views.user.UserSendBox')
const { t: mailboxT } = useScopedI18n('views.user.UserMailBox')

const emptyDraft = () => ({
    fromName: '',
    toName: '',
    toMail: '',
    subject: '',
    contentType: 'text',
    content: '',
    replyRecipient: '',
    references: [],
})
const draft = useSessionStorage(`linkedSendMailDraft:${userSettings.value.user_id}`, emptyDraft())
const selectedAddressId = ref(null)
const addressFilter = ref(null)
const addressOptions = ref([])
const addressCount = ref(null)
const addressOffset = ref(0)
const addressLoading = ref(false)
const resolvingReply = ref(false)
const unavailableReplyAddress = ref(false)

const hasMoreAddresses = computed(() => addressCount.value === null || addressOffset.value < addressCount.value)
const addressFilterOptions = computed(() => addressOptions.value.map((address) => ({
    label: address.label,
    value: address.address,
})))

const addAddressOptions = (addresses) => {
    const knownIds = new Set(addressOptions.value.map(({ value }) => value))
    addressOptions.value.push(...addresses.filter(({ id }) => !knownIds.has(id)).map(({ id, name }) => ({
        label: name,
        value: id,
        address: name,
    })))
}

let addressPageRequest
const fetchAddresses = () => {
    if (addressPageRequest || !hasMoreAddresses.value) return addressPageRequest
    addressLoading.value = true
    addressPageRequest = api.fetch(`/user_api/bind_address?limit=${ADDRESS_PAGE_SIZE}&offset=${addressOffset.value}`)
        .then(({ results, count }) => {
            addAddressOptions(results)
            addressOffset.value += results.length
            addressCount.value = results.length ? count : addressOffset.value
        })
        .finally(() => {
            addressLoading.value = false
            addressPageRequest = undefined
        })
    return addressPageRequest
}

const findAddress = async (name) => {
    const matches = (address) => address.toLowerCase() === name.toLowerCase()
    const findOption = () => addressOptions.value.find(({ address }) => matches(address))
    const existing = findOption()
    if (existing || !hasMoreAddresses.value) return existing

    if (name.length <= 100 && !/[%_]/.test(name)) {
        const { results, count } = await api.fetch(
            `/user_api/bind_address?limit=${ADDRESS_PAGE_SIZE}&offset=0&query=${encodeURIComponent(name)}`
        )
        const result = results.find(({ name: candidate }) => matches(candidate))
        if (result) {
            addAddressOptions([result])
            return findOption()
        }
        if (results.length >= count) return
    }

    while (hasMoreAddresses.value) {
        await fetchAddresses()
        const option = findOption()
        if (option) return option
    }
}

const handleAddressScroll = async ({ currentTarget: menu }) => {
    if (!menu || menu.scrollHeight - menu.scrollTop - menu.clientHeight > 24) return
    try {
        await fetchAddresses()
    } catch (error) {
        message.error(error.message)
    }
}

const fetchSendbox = async (limit, offset) => {
    return await api.fetch(
        `/user_api/sendbox?limit=${limit}&offset=${offset}`
        + (addressFilter.value ? `&address=${encodeURIComponent(addressFilter.value)}` : '')
    )
}

const deleteSendboxMail = async (mailId) => {
    await api.fetch(`/user_api/sendbox/${mailId}`, { method: 'DELETE' })
}

const sent = () => {
    draft.value = emptyDraft()
    emit('sent')
}

watch(() => props.replyDraft, async (reply, _, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    if (reply && reply.replyKey !== draft.value.replyKey) {
        draft.value = { ...emptyDraft(), ...reply, replyRecipient: reply.toMail }
    }
    const sender = props.mode === 'send_mail' ? draft.value.address : ''
    resolvingReply.value = Boolean(sender)
    unavailableReplyAddress.value = false
    if (sender) selectedAddressId.value = null
    try {
        if (addressCount.value === null) await fetchAddresses()
        if (!active || props.mode !== 'send_mail') return
        const option = sender ? await findAddress(sender) : addressOptions.value[0]
        if (!active) return
        selectedAddressId.value = option?.value ?? null
        unavailableReplyAddress.value = Boolean(sender && !option)
    } catch (error) {
        if (active) message.error(error.message)
    } finally {
        if (active) resolvingReply.value = false
    }
}, { immediate: true })
</script>

<template>
    <div class="user-send-box">
        <template v-if="mode === 'send_mail'">
            <n-alert v-if="unavailableReplyAddress" type="warning" class="reply-sender-alert">
                {{ t('replyAddressUnavailable') }}
            </n-alert>
            <n-skeleton v-if="(addressCount === null && addressLoading) || resolvingReply" text :repeat="3" />
            <SendMail v-else-if="selectedAddressId" v-model:address-id="selectedAddressId" v-model:draft="draft"
                :address-options="addressOptions" :address-loading="addressLoading"
                :reply-source="replyDraft?.replyKey === draft.replyKey ? replySource : null"
                @address-scroll="handleAddressScroll" @sent="sent" />
            <div v-else class="address-empty">
                <n-empty :description="t('noAddress')" />
                <n-select v-if="addressOptions.length" v-model:value="selectedAddressId" :options="addressOptions"
                    :loading="addressLoading" :input-props="{ 'aria-label': t('noAddress') }" class="choose-sender"
                    filterable @scroll="handleAddressScroll" />
            </div>
        </template>
        <template v-else>
            <SendBox :key="addressFilter || ''" :fetch-mail-data="fetchSendbox" show-e-mail-from
                :enable-user-delete-email="openSettings.enableUserDeleteEmail"
                :delete-mail="deleteSendboxMail">
                <template #filters>
                    <n-select v-model:value="addressFilter" class="linked-address-filter" size="small"
                        :options="addressFilterOptions" :loading="addressLoading"
                        :placeholder="mailboxT('allAddresses')"
                        :input-props="{ 'aria-label': mailboxT('allAddresses') }"
                        clearable filterable @scroll="handleAddressScroll" />
                </template>
            </SendBox>
        </template>
    </div>
</template>

<style scoped>
.user-send-box {
    min-width: 0;
    text-align: left;
}

.reply-sender-alert {
    width: min(100%, 850px);
    margin: 0 auto 14px;
}

.address-empty {
    display: grid;
    justify-items: center;
    gap: 18px;
    padding: clamp(30px, 6vw, 70px) 0;
}

.choose-sender {
    width: min(100%, 320px);
}

.linked-address-filter {
    flex: 1 1 200px;
    width: auto;
    min-width: min(160px, 100%);
    max-width: 300px;
}
</style>
