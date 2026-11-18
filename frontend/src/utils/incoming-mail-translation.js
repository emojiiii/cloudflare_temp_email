import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { htmlToPlainText } from './mail-actions'
import { useMailTranslation } from './mail-translation'
import { mailHtmlTextLength, translateMailHtml } from './rich-mail-translation'

export function useIncomingMailTranslation(mail, scope) {
    const preferences = useMailTranslation(scope, 'reader')
    const { capability, language, session, translate } = preferences
    const request = shallowRef(null)
    const translation = shallowRef(null)
    const showingTranslation = ref(false)
    const failed = ref(false)

    const source = computed((previous) => {
        if (!capability.value) return null
        const { text, message, raw } = mail.value
        const html = message && message !== raw && message !== text ? message : ''
        const sourceText = html ? '' : text?.trim() || ''
        if (previous?.html === html && previous?.text === sourceText) return previous
        return { text: sourceText, html, length: html ? mailHtmlTextLength(html) : sourceText.length }
    })
    const exceedsLimit = computed(() => (source.value?.length ?? 0) > (capability.value?.maxLength ?? 0))
    const mailId = computed(() => mail.value.id)
    const savedMail = computed(() => Number.isSafeInteger(mailId.value) && mailId.value > 0)
    const canTranslate = computed(() => Boolean(capability.value && language.value && source.value?.length && !exceedsLimit.value))
    const canReadCache = computed(() => canTranslate.value && savedMail.value && capability.value.cacheOnly === true)

    const cancelRequest = () => {
        request.value?.controller.abort()
        request.value = null
    }

    const runTranslation = async ({ cacheOnly = false, fallbackToCachedLanguage = false } = {}) => {
        if (!canTranslate.value || (cacheOnly && !canReadCache.value)) return
        const current = {
            mailId: mailId.value, source: source.value, language: language.value, session: session.value,
            cacheOnly, controller: new AbortController(),
        }
        const matchesSelection = selected => selected.mailId === mailId.value && selected.source === source.value
            && selected.language === language.value && selected.session === session.value
        if (request.value && matchesSelection(request.value) && (!request.value.cacheOnly || cacheOnly)) return

        cancelRequest()
        failed.value = false
        request.value = current
        const { source: mailSource, controller } = current
        const hasSavedMail = savedMail.value
        let targetLanguage = current.language
        let part = 0
        const translatePart = async (body, layout) => {
            controller.signal.throwIfAborted()
            const options = hasSavedMail ? { mailId: current.mailId, part: part++ } : undefined
            if (cacheOnly) {
                options.cacheOnly = true
                if (options.part === 0 && fallbackToCachedLanguage) options.fallbackToCachedLanguage = true
            }
            const result = await translate(body, targetLanguage, controller.signal, layout, options)
            if (cacheOnly && result) targetLanguage = result.targetLanguage ?? targetLanguage
            return result
        }
        const isCurrent = () => request.value === current && matchesSelection(current)
        try {
            let result
            if (mailSource.html) {
                const html = await translateMailHtml(mailSource.html, translatePart,
                    capability.value.maxLength, { targetLanguage })
                if (html === null) return
                result = { html, text: htmlToPlainText(html) }
            } else {
                const response = await translatePart(mailSource.text)
                if (response === null) return
                result = { html: '', text: cacheOnly ? response.text : response }
            }
            if (!isCurrent()) return
            translation.value = { ...result, targetLanguage }
            showingTranslation.value = true
        } catch {
            if (!cacheOnly && isCurrent()) failed.value = true
        } finally {
            if (request.value === current) request.value = null
        }
    }

    watch(
        [mailId, source, session, language, canTranslate, canReadCache],
        ([id, body, auth, target, , cacheEnabled], [previousId, previousBody, previousAuth, previousTarget, , wasCacheEnabled]) => {
            cancelRequest()
            showingTranslation.value = false
            translation.value = null
            failed.value = false
            if (cacheEnabled) {
                const onlyLanguageChanged = wasCacheEnabled && target !== previousTarget
                    && id === previousId && body === previousBody && auth === previousAuth
                void runTranslation({ cacheOnly: true, fallbackToCachedLanguage: !onlyLanguageChanged })
            }
        },
        { immediate: true },
    )

    onScopeDispose(cancelRequest)

    return {
        ...preferences,
        canTranslate,
        exceedsLimit,
        translating: computed(() => !!request.value && !request.value.cacheOnly),
        translation,
        showingTranslation,
        failed,
        translateMail: () => runTranslation(),
    }
}
