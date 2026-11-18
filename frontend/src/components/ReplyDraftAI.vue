<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AutoAwesomeRound } from '@vicons/material'
import { api } from '@/api'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '@/store'

const props = defineProps({
    source: { type: Object, default: null },
    scope: { type: String, required: true },
    disabled: Boolean,
})
const emit = defineEmits(['apply'])
const { t, locale } = useScopedI18n('components.ReplyDraftAI')
const { openSettings } = useGlobalState()

const paths = {
    mailbox: '/api/ai_reply',
    user: '/user_api/ai_reply',
    admin: '/admin/ai_reply',
}
const capability = computed(() => openSettings.value.aiReply)
const subject = computed(() => props.source?.subject?.trim() ?? '')
const body = computed(() => props.source?.text?.trim() ?? '')
const show = ref(false)
const intent = ref('')
const notes = computed(() => intent.value.trim())
const targetLanguage = ref('auto')
const preview = ref(null)
const showTranslation = computed(() => preview.value && preview.value.chineseText !== preview.value.text)
const generating = ref(false)
const failed = ref(false)
let request

const languageOptions = computed(() => {
    const names = new Intl.DisplayNames([locale.value], { type: 'language' })
    return [
        { value: 'auto', label: t('followOriginalLanguage') },
        ...capability.value.languages.map(value => ({ value, label: names.of(value) })),
    ]
})
const contextTruncated = computed(() => subject.value.length > capability.value.maxSubjectLength
    || body.value.length > capability.value.maxBodyLength)
const canGenerate = computed(() => !!capability.value
    && notes.value.length <= capability.value.maxIntentLength && !props.disabled && !generating.value)

const cancelGeneration = () => {
    request?.abort()
    request = undefined
    generating.value = false
}

watch(show, visible => { if (!visible) cancelGeneration() })
watch([subject, body, () => props.scope], () => {
    show.value = false
    intent.value = ''
    targetLanguage.value = 'auto'
    preview.value = null
    failed.value = false
    cancelGeneration()
})
watch([intent, targetLanguage], () => {
    preview.value = null
    failed.value = false
    cancelGeneration()
})
onBeforeUnmount(cancelGeneration)

const generate = async () => {
    if (!canGenerate.value) return
    const { maxSubjectLength, maxBodyLength } = capability.value
    const current = new AbortController()
    request = current
    generating.value = true
    failed.value = false
    try {
        const draft = await api.fetch(paths[props.scope], {
            method: 'POST',
            body: {
                subject: subject.value.slice(0, maxSubjectLength),
                body: body.value.slice(0, maxBodyLength),
                ...(notes.value ? { intent: notes.value } : {}),
                targetLanguage: targetLanguage.value,
            },
            signal: current.signal,
            showLoading: false,
        })
        if (request === current) preview.value = draft
    } catch {
        if (request === current) failed.value = true
    } finally {
        if (request === current) {
            request = undefined
            generating.value = false
        }
    }
}

const apply = () => {
    if (!preview.value || generating.value || props.disabled) return
    emit('apply', preview.value.text)
    preview.value = null
    show.value = false
}
</script>

<template>
    <template v-if="capability && (subject || body)">
        <n-button size="small" secondary attr-type="button" :disabled="disabled" @click="show = true">
            <template #icon><n-icon :component="AutoAwesomeRound" /></template>
            {{ t('title') }}
        </n-button>

        <n-modal v-model:show="show" preset="card" :title="t('title')"
            :style="{ width: `min(${showTranslation ? 860 : 580}px, calc(100vw - 24px))` }">
            <div class="reply-ai-body" :aria-busy="generating">
                <n-form-item :label="t('intent')" :show-feedback="false">
                    <n-input v-model:value="intent" type="textarea" :autosize="{ minRows: 3, maxRows: 5 }"
                        :maxlength="capability.maxIntentLength" :placeholder="t('intentPlaceholder')"
                        :input-props="{ 'aria-label': t('intent') }" />
                </n-form-item>
                <n-form-item :label="t('targetLanguage')" :show-feedback="false">
                    <n-select v-model:value="targetLanguage" :options="languageOptions" :aria-label="t('targetLanguage')" />
                </n-form-item>
                <p class="reply-ai-note">{{ t('providerNotice') }}</p>
                <p v-if="contextTruncated" class="reply-ai-note">{{ t('truncatedNotice') }}</p>
                <n-alert v-if="failed" type="error" role="alert">{{ t('failed') }}</n-alert>
                <section v-if="preview" class="reply-ai-preview">
                    <h3>{{ t('preview') }}</h3>
                    <div class="reply-ai-preview-columns" :class="{ 'reply-ai-preview-columns--bilingual': showTranslation }">
                        <div class="reply-ai-preview-panel">
                            <h4>{{ t('original') }}</h4>
                            <p dir="auto">{{ preview.text }}</p>
                        </div>
                        <div v-if="showTranslation" class="reply-ai-preview-panel">
                            <h4>{{ t('chineseTranslation') }}</h4>
                            <p lang="zh-Hans">{{ preview.chineseText }}</p>
                        </div>
                    </div>
                </section>
            </div>
            <template #action>
                <div class="reply-ai-actions">
                    <n-button attr-type="button" :type="preview ? 'default' : 'primary'" :loading="generating"
                        :disabled="!canGenerate" @click="generate">
                        {{ t(preview ? 'regenerate' : 'generate') }}
                    </n-button>
                    <n-button v-if="preview" type="primary" attr-type="button" :disabled="disabled || generating" @click="apply">
                        {{ t('apply') }}
                    </n-button>
                </div>
            </template>
        </n-modal>
    </template>
</template>

<style scoped>
.reply-ai-body {
    display: grid;
    gap: 12px;
    max-block-size: min(68dvh, 620px);
    overflow-y: auto;
    scrollbar-width: thin;
}

.reply-ai-note {
    margin: 0;
    color: var(--mail-muted);
    font-size: 13px;
}

.reply-ai-preview-columns {
    display: grid;
    gap: 10px;
}

.reply-ai-preview-panel {
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--mail-border);
    border-radius: 8px;
    background: var(--mail-rail);
}

.reply-ai-preview h3,
.reply-ai-preview h4 {
    margin: 0 0 8px;
    font-size: 13px;
}

@media (min-width: 720px) {
    .reply-ai-preview-columns--bilingual {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.reply-ai-preview p {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.reply-ai-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}
</style>
