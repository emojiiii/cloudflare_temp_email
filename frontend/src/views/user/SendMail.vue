<script setup>
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { useScopedI18n } from '@/i18n/app'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { EditOutlined, ReplyRound, SendRound } from '@vicons/material'
import { useMessage } from 'naive-ui'
import AdminContact from '../common/AdminContact.vue'
import ShadowHtmlComponent from '../../components/ShadowHtmlComponent.vue'
import DraftTranslation from '../../components/DraftTranslation.vue'
import ReplyDraftAI from '../../components/ReplyDraftAI.vue'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { blockRemoteContent } from '../../utils/remote-content-policy'
import { sanitizeHtml } from '../../utils/sanitize-html'
import { insertAIReplyText } from '../../utils/mail-actions'

const message = useMessage()
const isPreview = ref(false)
const editorRef = shallowRef()
const sending = ref(false)
const requesting = ref(false)
const settings = ref(null)
const settingsLoading = ref(false)
const settingsError = ref('')
const sendMailModel = defineModel('draft', { type: Object, required: true })

const props = defineProps({
    replySource: Object,
    addressId: {
        type: Number,
        default: 0,
    },
    addressOptions: {
        type: Array,
        default: () => [],
    },
    addressLoading: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits(['addressScroll', 'sent', 'update:addressId'])

const { autoLoadRemoteImages, isDark } = useGlobalState()

const { t } = useScopedI18n('views.index.SendMail')
const { t: mailT } = useScopedI18n('components.MailBox')

const getApiPath = (path) => `/user_api/address/${props.addressId}/${path}`
const canSend = computed(() => settings.value?.send_unlimited || settings.value?.send_balance > 0)
const composeTitle = computed(() => {
    if (sendMailModel.value.mode === 'reply') return mailT('reply')
    if (sendMailModel.value.mode === 'forward') return mailT('forwardMail')
    return t('composeMail')
})

let settingsRequest = 0
const refreshSettings = async () => {
    const request = ++settingsRequest
    settingsLoading.value = true
    settingsError.value = ''
    settings.value = null
    try {
        const data = await api.fetch(getApiPath('settings'))
        if (request === settingsRequest) settings.value = data
    } catch (error) {
        if (request === settingsRequest) settingsError.value = error.message
    } finally {
        if (request === settingsRequest) settingsLoading.value = false
    }
}

const contentTypes = computed(() => [
    { label: t('text'), value: 'text' },
    { label: t('html'), value: 'html' },
    { label: t('rich text'), value: 'rich' },
])

const previewContent = computed(() => {
    const content = `${sendMailModel.value.content ?? ''}`
    return autoLoadRemoteImages.value
        ? sanitizeHtml(content)
        : blockRemoteContent(content).html
})

const normalizeSendMailText = (content) => {
    return content
        .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const hasSendMailContent = (content, contentType) => {
    if (typeof content !== 'string' || !content) {
        return false
    }

    if (contentType === 'text') {
        return normalizeSendMailText(content).length > 0
    }

    const container = document.createElement('div')
    container.innerHTML = content
    container.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove())

    const plainContent = normalizeSendMailText(container.textContent ?? '')
    if (plainContent.length > 0) {
        return true
    }

    return Boolean(container.querySelector('img, audio, video, iframe, svg, canvas, table'))
}

const send = async () => {
    if (sending.value || !canSend.value) {
        return
    }

    const subject = `${sendMailModel.value.subject ?? ''}`.trim()
    const toMail = `${sendMailModel.value.toMail ?? ''}`.trim()
    const content = `${sendMailModel.value.content ?? ''}`

    if (!subject) {
        message.error(t('subjectEmpty'))
        return
    }
    if (!toMail) {
        message.error(t('toMailEmpty'))
        return
    }
    if (!hasSendMailContent(content, sendMailModel.value.contentType)) {
        message.error(t('contentEmpty'))
        return
    }

    const { fromName, toName, contentType, replyMailId, inReplyTo, references, replyRecipient } = sendMailModel.value
    const replyHeaders = replyRecipient && toMail.toLowerCase() === replyRecipient.toLowerCase()
        ? { reply_mail_id: replyMailId, in_reply_to: inReplyTo, ...(inReplyTo ? { references } : {}) }
        : {}
    const payload = {
        from_name: fromName,
        to_name: toName,
        to_mail: toMail,
        subject,
        is_html: contentType !== 'text',
        content,
        ...replyHeaders,
    }

    sending.value = true
    try {
        await api.fetch(getApiPath('send_mail'),
            {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        isPreview.value = false
        message.success(t("successSend"));
        emit('sent')
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        sending.value = false
    }
}

const applyAIReply = (text) => {
    insertAIReplyText(sendMailModel.value, text)
    isPreview.value = false
}

const requestAccess = async () => {
    if (requesting.value) return
    requesting.value = true
    try {
        await api.fetch(getApiPath('request_send_mail_access'),
            {
                method: 'POST',
                body: JSON.stringify({})
            }
        )
        message.success(t("requestSuccess"))
        await refreshSettings();
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        requesting.value = false
    }
}

const toolbarConfig = {
    excludeKeys: ["uploadVideo"]
}

const editorConfig = {
    MENU_CONF: {
        'uploadImage': {
            async customUpload() {
                message.error(t('tooLarge'))
            },
            maxFileSize: 1 * 1024 * 1024,
            base64LimitSize: 1 * 1024 * 1024,
        }
    }
}

onBeforeUnmount(() => {
    settingsRequest++
    const editor = editorRef.value
    if (editor == null) return
    editor.destroy()
})

const handleCreated = (editor) => {
    editorRef.value = editor;
}

watch(() => props.addressId, refreshSettings, { immediate: true })
</script>

<template>
    <section class="composer-page" aria-labelledby="linked-compose-title">
        <header class="composer-header">
            <div class="composer-title">
                <span class="composer-mark"><n-icon :component="sendMailModel.mode === 'reply' ? ReplyRound : EditOutlined" /></span>
                <h2 id="linked-compose-title">{{ composeTitle }}</h2>
            </div>
            <span v-if="canSend" class="composer-balance">
                {{ t('send_balance') }} · {{ settings.send_unlimited ? t('sendUnlimited') : settings.send_balance }}
            </span>
        </header>

        <n-form class="composer-form" :model="sendMailModel" label-placement="top" @submit.prevent="send">
            <n-grid cols="1 m:2" responsive="screen" :x-gap="16">
                <n-grid-item>
                    <n-form-item :label="t('senderAddress')" :label-props="{ for: 'send-mail-sender-address' }">
                        <n-select class="address-picker-select" :value="addressId"
                            :options="addressOptions" :loading="addressLoading" filterable
                            :disabled="sending || requesting" :input-props="{ id: 'send-mail-sender-address' }"
                            @scroll="emit('addressScroll', $event)"
                            @update:value="emit('update:addressId', $event)" />
                    </n-form-item>
                </n-grid-item>
                <n-grid-item>
                    <n-form-item :label="t('senderName')" :label-props="{ for: 'send-mail-sender-name' }">
                        <n-input v-model:value="sendMailModel.fromName"
                            :input-props="{ id: 'send-mail-sender-name' }" />
                    </n-form-item>
                </n-grid-item>
            </n-grid>

            <n-skeleton v-if="settingsLoading" text :repeat="3" />
            <n-alert v-else-if="settingsError" type="error">{{ settingsError }}</n-alert>
            <div v-else-if="!canSend">
                <div class="access-state">
                    <div class="access-copy">
                        <h3>{{ t('balanceUnavailable') }}</h3>
                        <p>{{ t('requestAccessTip', { address: settings.address }) }}</p>
                    </div>
                    <n-button type="primary" :loading="requesting" @click="requestAccess">{{ t('requestAccess') }}</n-button>
                </div>
                <div class="admin-contact"><AdminContact /></div>
            </div>

            <template v-else>
                <n-grid cols="1 m:2" responsive="screen" :x-gap="16">
                    <n-grid-item>
                        <n-form-item :label="t('recipientAddress')" required
                            :label-props="{ for: 'send-mail-recipient-address' }">
                            <n-input v-model:value="sendMailModel.toMail"
                                :input-props="{ id: 'send-mail-recipient-address' }" />
                        </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                        <n-form-item :label="t('recipientName')" :label-props="{ for: 'send-mail-recipient-name' }">
                            <n-input v-model:value="sendMailModel.toName"
                                :input-props="{ id: 'send-mail-recipient-name' }" />
                        </n-form-item>
                    </n-grid-item>
                </n-grid>

                <n-form-item :label="t('subject')" required :label-props="{ for: 'send-mail-subject' }">
                    <n-input v-model:value="sendMailModel.subject"
                        :input-props="{ id: 'send-mail-subject' }" />
                </n-form-item>

                <div class="editor-panel">
                    <div class="editor-panel-header">
                        <n-text id="send-mail-content-label" strong>{{ t('content') }} <span
                                class="required-mark">*</span></n-text>
                        <div class="editor-controls">
                            <n-radio-group class="format-options" v-model:value="sendMailModel.contentType"
                                size="small" aria-labelledby="send-mail-content-label">
                                <n-radio-button v-for="option in contentTypes" :key="option.value"
                                    :value="option.value" :label="option.label" />
                            </n-radio-group>
                            <n-button v-if="sendMailModel.contentType !== 'text'" tertiary size="small"
                                @click="isPreview = !isPreview">
                                {{ isPreview ? t('edit') : t('preview') }}
                            </n-button>
                        </div>
                    </div>

                    <div v-if="isPreview && sendMailModel.contentType !== 'text'" class="compose-preview">
                        <ShadowHtmlComponent :htmlContent="previewContent" :isDark="isDark" />
                    </div>
                    <div v-else-if="sendMailModel.contentType === 'rich'" class="rich-editor">
                        <Toolbar :defaultConfig="toolbarConfig" :editor="editorRef" mode="default" />
                        <Editor v-model="sendMailModel.content" :defaultConfig="editorConfig" mode="default"
                            @onCreated="handleCreated" />
                    </div>
                    <n-input v-else class="compose-textarea" type="textarea" :bordered="false"
                        v-model:value="sendMailModel.content" :placeholder="t('contentPlaceholder')"
                        :input-props="{ 'aria-label': t('content') }"
                        :autofocus="sendMailModel.mode === 'reply'"
                        :autosize="{ minRows: 14, maxRows: 24 }" />
                </div>

                <div class="composer-actions">
                    <n-text depth="3" class="draft-status">{{ t('draftSaved') }}</n-text>
                    <ReplyDraftAI v-if="replySource && sendMailModel.mode === 'reply'" :source="replySource" scope="user"
                        :disabled="sending" @apply="applyAIReply" />
                    <DraftTranslation v-model:draft="sendMailModel" scope="user"
                        :reply="sendMailModel.mode === 'reply'" :disabled="sending" @applied="isPreview = false" />
                    <n-button type="primary" attr-type="submit" :loading="sending" :disabled="sending">
                        <template #icon><n-icon :component="SendRound" /></template>
                        {{ t('send') }}
                    </n-button>
                </div>
            </template>
        </n-form>
    </section>
</template>

<style scoped>
.composer-page {
    width: min(900px, 100%);
    margin-inline: auto;
    padding: clamp(8px, 2vw, 26px) 0;
    text-align: left;
}

.composer-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
}

.composer-title {
    display: flex;
    align-items: center;
    gap: 12px;
}

.composer-title > h2 {
    margin: 0;
    font-size: clamp(21px, 3vw, 30px);
    font-weight: 720;
    letter-spacing: -.035em;
}

.composer-mark {
    display: grid;
    place-items: center;
    width: 43px;
    height: 43px;
    border-radius: 12px;
    background: var(--mail-active);
    color: var(--mail-accent);
    font-size: 22px;
}

.composer-balance {
    padding: 5px 10px;
    border-radius: 8px;
    background: var(--mail-hover);
    color: var(--mail-accent);
    font-size: 12px;
    font-weight: 650;
}

.access-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 16px;
    border: 1px solid var(--mail-border);
    border-radius: var(--mail-radius);
    background: var(--mail-rail);
}

.access-copy h3 {
    margin: 0;
    font-size: 16px;
}

.access-copy p {
    max-width: 640px;
    margin: 8px 0 0;
    line-height: 1.65;
    color: var(--mail-muted);
}

.admin-contact {
    margin-top: 12px;
}

.editor-panel {
    overflow: hidden;
    border: 1px solid var(--mail-border);
    border-radius: var(--mail-radius);
}

.editor-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 46px;
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--mail-border);
    background: var(--mail-rail);
}

.editor-controls {
    display: flex;
    align-items: center;
    gap: 8px;
}

.required-mark {
    color: #d03050;
}

.format-options {
    display: flex;
}

.format-options :deep(.n-radio-button) {
    min-width: 72px;
    text-align: center;
}

.compose-preview {
    min-height: 360px;
    padding: 18px;
}

.rich-editor {
    --w-e-textarea-bg-color: var(--mail-surface);
    --w-e-textarea-color: var(--mail-ink);
    --w-e-toolbar-bg-color: var(--mail-rail);
    --w-e-toolbar-color: var(--mail-muted);
    --w-e-toolbar-border-color: var(--mail-border);
    background: var(--mail-surface);
}

.rich-editor :deep(.w-e-toolbar) {
    border-bottom: 1px solid var(--mail-border);
}

.rich-editor :deep(.w-e-text-container) {
    min-height: 360px;
}

.rich-editor :deep(.w-e-scroll) {
    min-height: 360px;
}

.compose-textarea :deep(.n-input__textarea-el),
.compose-textarea :deep(.n-input__placeholder) {
    line-height: 1.7;
    text-align: left;
}

.composer-form :deep(.n-input__input-el) {
    text-align: left;
}

.composer-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--mail-border);
}

.draft-status {
    font-size: 13px;
    color: var(--mail-muted);
}

@media (max-width: 640px) {
    .composer-page {
        padding-top: 8px;
    }

    .access-state {
        align-items: stretch;
        flex-direction: column;
        gap: 16px;
    }

    .editor-panel-header {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .editor-controls {
        width: 100%;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .format-options {
        max-width: 100%;
    }

    .format-options :deep(.n-radio-button) {
        min-width: 0;
        padding-right: 8px;
        padding-left: 8px;
    }

    .rich-editor :deep(.w-e-toolbar) {
        overflow-x: auto;
    }
}
</style>
