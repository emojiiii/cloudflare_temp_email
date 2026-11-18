<script setup>
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { useScopedI18n } from '@/i18n/app'
import { mailboxLocation } from '@/router/workspace-paths'
import { useRouter } from 'vue-router'
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { SendRound } from '@vicons/material'
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
const router = useRouter()
const isPreview = ref(false)
const editorRef = shallowRef()
const composerInput = ref(null)
const sending = ref(false)
defineProps({ replySource: Object })
const emit = defineEmits(['sent'])

const {
    settings, sendMailModel, userSettings,
    autoLoadRemoteImages, isDark,
} = useGlobalState()

const applyAIReply = (text) => {
    insertAIReplyText(sendMailModel.value, text)
    isPreview.value = false
}

const { t, locale } = useScopedI18n('views.index.SendMail')
const canSend = computed(() => settings.value.send_unlimited || settings.value.send_balance > 0)
const hasDraft = computed(() => Boolean(sendMailModel.value.toMail || sendMailModel.value.subject || sendMailModel.value.content))

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
    if (sending.value) {
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

    const payload = {
        from_name: sendMailModel.value.fromName,
        to_name: sendMailModel.value.toName,
        to_mail: toMail,
        subject,
        is_html: sendMailModel.value.contentType != 'text',
        content,
        reply_mail_id: sendMailModel.value.replyMailId,
        in_reply_to: sendMailModel.value.inReplyTo,
        references: sendMailModel.value.references,
    }

    sending.value = true
    try {
        await api.fetch(`/api/send_mail`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        sendMailModel.value = {
            fromName: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        }
        isPreview.value = false
        emit('sent')
        message.success(t("successSend"));
        await router.push(mailboxLocation('sendbox', locale.value))
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        sending.value = false
    }
}

const requestAccess = async () => {
    try {
        await api.fetch(`/api/request_send_mail_access`,
            {
                method: 'POST',
                body: JSON.stringify({})
            }
        )
        message.success(t("requestSuccess"))
        await api.getSettings();
    } catch (error) {
        message.error(error.message || "error");
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
    const editor = editorRef.value
    if (editor == null) return
    editor.destroy()
})

const handleCreated = (editor) => {
    editorRef.value = editor;
}

onMounted(async () => {
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
    await api.getSettings();
    if (sendMailModel.value.composeMode === 'reply') {
        await nextTick();
        const textArea = composerInput.value?.textareaElRef;
        textArea?.focus();
        textArea?.setSelectionRange(0, 0);
    }
})
</script>

<template>
    <div class="composer-page" v-if="settings.address">
        <n-card class="composer-card" :bordered="false">
            <template #header>
                <div class="composer-title">
                    <n-text depth="3">{{ t('senderAddress') }}</n-text>
                    <n-text strong>{{ settings.address }}</n-text>
                </div>
            </template>
            <template #header-extra>
                <span v-if="canSend" class="composer-quota">
                    {{ settings.send_unlimited ? t('sendUnlimited') : `${t('send_balance')} · ${settings.send_balance}` }}
                </span>
            </template>

            <div v-if="!canSend">
                <div class="access-state">
                    <div class="access-copy">
                        <h3>{{ t('balanceUnavailable') }}</h3>
                        <p>{{ t('requestAccessTip', { address: settings.address }) }}</p>
                    </div>
                    <n-button type="primary" @click="requestAccess">{{ t('requestAccess') }}</n-button>
                </div>
                <div class="admin-contact"><AdminContact /></div>
            </div>

            <template v-else>
                <n-form class="composer-form" :model="sendMailModel" label-placement="top">
                    <n-form-item :label="t('recipientAddress')" required :show-feedback="false"
                        :label-props="{ for: 'send-mail-recipient-address' }">
                        <n-input v-model:value="sendMailModel.toMail"
                            :input-props="{ id: 'send-mail-recipient-address', inputmode: 'email' }" />
                    </n-form-item>

                    <n-form-item :label="t('subject')" required :show-feedback="false"
                        :label-props="{ for: 'send-mail-subject' }">
                        <n-input v-model:value="sendMailModel.subject"
                            :input-props="{ id: 'send-mail-subject' }" />
                    </n-form-item>
                    <details class="composer-options">
                        <summary>{{ t('options') }}</summary>
                        <div class="composer-option-fields">
                            <n-form-item :label="t('recipientName')" :show-feedback="false"
                                :label-props="{ for: 'send-mail-recipient-name' }">
                                <n-input v-model:value="sendMailModel.toName"
                                    :input-props="{ id: 'send-mail-recipient-name' }" />
                            </n-form-item>
                            <n-form-item :label="t('senderName')" :show-feedback="false"
                                :label-props="{ for: 'send-mail-sender-name' }">
                                <n-input v-model:value="sendMailModel.fromName"
                                    :input-props="{ id: 'send-mail-sender-name' }" />
                            </n-form-item>
                        </div>
                    </details>

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
                        <n-input v-else ref="composerInput" class="compose-textarea" type="textarea" :bordered="false"
                            v-model:value="sendMailModel.content" :placeholder="t('contentPlaceholder')"
                            :input-props="{ 'aria-label': t('content') }"
                            :autosize="{ minRows: 14, maxRows: 24 }" />
                    </div>

                    <div class="composer-actions">
                        <n-text v-if="hasDraft" depth="3" class="draft-status">{{ t('draftSaved') }}</n-text>
                        <ReplyDraftAI v-if="replySource && sendMailModel.composeMode === 'reply'"
                            :source="replySource" scope="mailbox" :disabled="sending" @apply="applyAIReply" />
                        <DraftTranslation v-model:draft="sendMailModel" scope="mailbox"
                            :reply="sendMailModel.composeMode === 'reply'" :disabled="sending" @applied="isPreview = false" />
                        <n-button type="primary" :loading="sending" :disabled="sending" @click="send">
                            <template #icon><n-icon :component="SendRound" /></template>
                            {{ t('send') }}
                        </n-button>
                    </div>
                </n-form>
            </template>
        </n-card>
    </div>
</template>

<style scoped>
.composer-page {
    width: 100%;
    padding-bottom: 20px;
    text-align: left;
}

.composer-card {
    width: min(790px, 100%);
    margin-inline: auto;
    background: var(--mail-surface, #fff);
    border: 1px solid var(--mail-border, #e7eaf0);
    border-radius: var(--mail-radius, 10px);
}

.composer-card :deep(.n-card-header) {
    border-bottom: 1px solid var(--mail-border, #e7eaf0);
    margin-bottom: 18px;
}

.composer-title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px 12px;
}

.composer-title .n-text {
    font-size: 13px;
    word-break: break-all;
}

.composer-quota {
    color: var(--mail-muted, #626b7c);
    font-size: 12px;
    font-weight: 450;
}

.composer-options {
    color: var(--mail-muted, #626b7c);
    font-size: 13px;
}

.composer-options summary {
    width: fit-content;
    cursor: pointer;
    padding: 3px 0;
}

.composer-option-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 11px;
}

.composer-form {
    display: grid;
    gap: 14px;
}

.access-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 6px 0 18px;
}

.access-copy h3 {
    margin: 0;
    font-size: 16px;
}

.access-copy p {
    max-width: 640px;
    margin: 8px 0 0;
    line-height: 1.65;
    opacity: 0.72;
}

.admin-contact {
    margin-top: 4px;
}

.editor-panel {
    overflow: hidden;
    border: 1px solid var(--mail-border, #e7eaf0);
    border-radius: 8px;
}

.editor-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
    padding: 5px 8px 5px 12px;
    border-bottom: 1px solid var(--mail-border, #e7eaf0);
    background: var(--mail-rail, #f7f8fb);
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
    background: #fff;
}

.rich-editor :deep(.w-e-toolbar) {
    border-bottom: 1px solid #e5e7eb;
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
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 16px;
    margin-top: 2px;
}

.draft-status {
    font-size: 12px;
    margin-inline-end: auto;
}

@media (max-width: 640px) {
    .composer-option-fields {
        grid-template-columns: minmax(0, 1fr);
    }

    .composer-page {
        padding-top: 8px;
    }

    .access-state {
        align-items: stretch;
        flex-direction: column;
        gap: 16px;
    }

    .composer-card :deep(.n-card-header) {
        flex-wrap: wrap;
        gap: 8px 12px;
    }

    .composer-card :deep(.n-card-header__main) {
        flex: 1 1 180px;
        min-width: 0;
    }

    .composer-card :deep(.n-card-header__extra) {
        margin-left: auto;
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
