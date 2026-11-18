import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '@/api'
import { useGlobalState } from '@/store'

const translationPaths = {
    mailbox: '/api/translate',
    user: '/user_api/translate',
    admin: '/admin/translate',
}

export function useMailTranslation(scope = 'mailbox', mode = 'reader') {
    const { locale } = useI18n({ useScope: 'global' })
    const {
        openSettings, userSettings, mailTranslationLanguage, draftTranslationLanguage,
        jwt, userJwt, adminAuth,
    } = useGlobalState()
    const preference = mode === 'draft' ? draftTranslationLanguage : mailTranslationLanguage
    const capability = computed(() => {
        if (scope === 'mailbox' && openSettings.value.receiveOnlyUsers) return null
        const translation = scope === 'user' ? userSettings.value.translation : openSettings.value.translation
        return translation?.provider === 'deepseek' ? translation : null
    })
    const providerName = 'DeepSeek'
    const session = computed(() => ({
        mailbox: jwt.value,
        user: userJwt.value,
        admin: adminAuth.value || userJwt.value,
    })[scope])

    const languageOptions = computed(() => {
        if (!capability.value) return []
        const names = new Intl.DisplayNames([locale.value], { type: 'language' })
        return capability.value.languages.map(code => ({ value: code, label: names.of(code) }))
    })

    const language = computed({
        get() {
            const supported = capability.value?.languages ?? []
            const preferredLocale = locale.value.split('-')[0]
            if (supported.includes(preference.value)) return preference.value
            if (supported.includes(preferredLocale)) return preferredLocale
            return supported[0] || 'en'
        },
        set(value) {
            preference.value = value
        },
    })

    async function translate(source, targetLanguage = language.value, signal, layout, incomingMail) {
        const isRich = Array.isArray(source)
        const result = await api.fetch(translationPaths[scope], {
            method: 'POST',
            body: {
                ...(isRich ? { segments: source, layout } : { text: source }),
                targetLanguage,
                provider: capability.value?.provider,
                ...incomingMail,
            },
            showLoading: false,
            signal,
        })
        if (incomingMail?.cacheOnly) return result || null
        return isRich ? result.segments : result.text
    }

    return { capability, providerName, languageOptions, language, session, translate }
}
