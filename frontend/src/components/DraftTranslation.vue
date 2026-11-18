<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { TranslateRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { useMailTranslation } from '@/utils/mail-translation'
import { blockRemoteContent } from '@/utils/remote-content-policy'
import { mailHtmlTextLength, translateMailHtml } from '@/utils/rich-mail-translation'
import ShadowHtmlComponent from './ShadowHtmlComponent.vue'

const props = defineProps({
    scope: { type: String, required: true },
    reply: Boolean,
    disabled: Boolean,
})
const draft = defineModel('draft', { type: Object, required: true })
const emit = defineEmits(['applied'])
const { t } = useScopedI18n('components.DraftTranslation')
const { capability, providerName, languageOptions, language, translate } = useMailTranslation(props.scope, 'draft')

const show = ref(false)
const translating = ref(false)
const preview = shallowRef(null)
const error = ref('')
let request
const input = computed(() => {
    const { subject, content, contentType = 'text' } = draft.value
    const body = content ?? ''
    const isHtml = contentType !== 'text'
    const quote = props.reply && !isHtml
        ? /(?:^|\r?\n\r?\n)> [^\r\n]*(?:\r?\n> [^\r\n]*)*(?:\r?\n)*$/.exec(body)
        : null
    const translatableBody = isHtml ? body : (quote ? body.slice(0, quote.index) : body).trim()
    return {
        subject: props.reply ? '' : (subject ?? '').trim(),
        body: translatableBody,
        textLength: isHtml ? mailHtmlTextLength(body, { skipQuotes: props.reply }) : translatableBody.length,
        quote: quote?.[0] || '',
        isHtml,
        skipQuotes: props.reply,
    }
})
const hasText = computed(() => Boolean(input.value.subject || input.value.textLength))
const tooLong = computed(() => capability.value &&
    Math.max(input.value.subject.length, input.value.textLength) > capability.value.maxLength)
const richPreview = computed(() => preview.value?.source.isHtml && preview.value.body
    ? blockRemoteContent(preview.value.body).html : '')

watch([show, input, language, capability], () => {
    request?.abort()
    preview.value = null
    translating.value = false
    error.value = ''
})
onBeforeUnmount(() => request?.abort())

const previewTranslation = async () => {
    if (!hasText.value || tooLong.value || translating.value) return
    const source = input.value
    const target = language.value
    const current = new AbortController()
    request = current
    translating.value = true
    preview.value = null
    error.value = ''
    const translateText = text => translate(text, target, current.signal)
    const translateSegments = (segments, layout) => translate(segments, target, current.signal, layout)
    try {
        const [subject, body] = await Promise.all([
            source.subject ? translateText(source.subject) : null,
            source.textLength ? (source.isHtml
                ? translateMailHtml(source.body, translateSegments, capability.value.maxLength,
                    { skipQuotes: source.skipQuotes, targetLanguage: target })
                : translateText(source.body)) : null,
        ])
        if (!current.signal.aborted) {
            preview.value = { source, target, subject: subject?.replace(/\s+/g, ' ').trim(), body }
        }
    } catch {
        if (!current.signal.aborted) {
            error.value = t('failed')
            current.abort()
        }
    } finally {
        if (request === current) {
            request = undefined
            translating.value = false
        }
    }
}

const apply = () => {
    const result = preview.value
    if (!result || result.source !== input.value || result.target !== language.value || props.disabled) return
    draft.value = {
        ...draft.value,
        ...(result.subject ? { subject: result.subject } : {}),
        ...(result.body ? { content: result.body + result.source.quote } : {}),
    }
    show.value = false
    emit('applied')
}
</script>

<template>
    <template v-if="capability">
        <n-button size="small" secondary attr-type="button" :disabled="disabled || !hasText" @click="show = true">
            <template #icon><n-icon :component="TranslateRound" /></template>
            {{ t('translate') }}
        </n-button>

        <n-modal v-model:show="show" preset="card" :title="t('translate')"
            class="draft-translation-modal" :style="{ width: 'min(600px, calc(100vw - 24px))' }">
            <div class="draft-translation-body">
                <n-form-item :label="t('targetLanguage')" :show-feedback="false">
                    <n-select v-model:value="language" :options="languageOptions" :aria-label="t('targetLanguage')" />
                </n-form-item>
                <p class="draft-translation-note">{{ t('providerNotice', { provider: providerName }) }}</p>
                <n-alert v-if="tooLong" type="warning">
                    {{ t('tooLong', { max: capability.maxLength }) }}
                </n-alert>
                <n-alert v-if="error" type="error" role="alert">{{ error }}</n-alert>
                <section v-if="preview" class="draft-translation-preview">
                    <h3>{{ t('preview') }}</h3>
                    <strong v-if="preview.subject" dir="auto">{{ preview.subject }}</strong>
                    <ShadowHtmlComponent v-if="richPreview" :html-content="richPreview" dir="auto" />
                    <p v-else-if="preview.body" class="draft-translation-text" dir="auto">{{ preview.body }}</p>
                </section>
            </div>
            <template #action>
                <div class="draft-translation-actions">
                    <n-button v-if="preview" type="primary" attr-type="button" :disabled="disabled" @click="apply">
                        {{ t('apply') }}
                    </n-button>
                    <n-button v-else type="primary" attr-type="button" :loading="translating"
                        :disabled="!hasText || tooLong || !language || disabled" @click="previewTranslation">
                        {{ t('previewTranslation') }}
                    </n-button>
                </div>
            </template>
        </n-modal>
    </template>
</template>

<style scoped>
.draft-translation-body {
    display: grid;
    gap: 12px;
}

.draft-translation-note {
    margin: 0;
    color: var(--mail-muted, #626b7c);
    font-size: 13px;
}

.draft-translation-preview {
    display: grid;
    gap: 8px;
    max-height: min(48vh, 440px);
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 14px;
    border: 1px solid var(--mail-border, #e7eaf0);
    border-radius: 8px;
    background: var(--mail-rail, #f7f8fb);
}

.draft-translation-preview h3,
.draft-translation-text {
    margin: 0;
}

.draft-translation-preview h3 {
    font-size: 13px;
}

.draft-translation-text {
    white-space: pre-wrap;
}

.draft-translation-preview :deep(.mail-boundary) {
    background: transparent;
    color: inherit;
    font: inherit;
}

.draft-translation-actions {
    display: flex;
    justify-content: flex-end;
}
</style>
