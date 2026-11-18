<script setup>
import { useScopedI18n } from '@/i18n/app'

import { useIsMobile } from '../../utils/composables'
import { useGlobalState } from '../../store'
import { useMailTranslation } from '../../utils/mail-translation'
const props = defineProps({
    showUseSimpleIndex: {
        type: Boolean,
        default: false
    }
})

const {
    mailboxSplitSize, mailListView, mailListPreviewLineClamp, useIframeShowMail, preferShowTextMail, configAutoRefreshInterval,
    useSideMargin, useUTCDate, useSimpleIndex, autoLoadRemoteImages
} = useGlobalState()
const isMobile = useIsMobile()

const { t } = useScopedI18n('views.common.Appearance')
const { capability, languageOptions, language } = useMailTranslation()
const readingSettings = [
    { label: 'preferShowTextMail', value: preferShowTextMail },
    { label: 'useIframeShowMail', value: useIframeShowMail },
    { label: 'autoLoadRemoteImages', value: autoLoadRemoteImages },
    { label: 'useUTCDate', value: useUTCDate }
]
</script>

<template>
    <div class="appearance-settings">
        <section class="workspace-panel appearance-section">
            <h2>{{ t('mailLayout') }}</h2>
            <label v-if="!isMobile" class="appearance-row">
                <span>{{ t('mailListView') }}</span>
                <n-switch v-model:value="mailListView" :aria-label="t('mailListView')" />
            </label>
            <div v-if="!isMobile" class="appearance-slider">
                <div class="appearance-slider-label">
                    <span>{{ t('mailboxSplitSize') }}</span><output>{{ Math.round(mailboxSplitSize * 100) }}%</output>
                </div>
                <n-slider v-model:value="mailboxSplitSize" :min="0" :max="0.75" :step="0.01"
                    :aria-label="t('mailboxSplitSize')" :format-tooltip="value => Math.round(value * 100) + '%'" />
            </div>
            <div class="appearance-slider">
                <div class="appearance-slider-label">
                    <span>{{ t('mailListPreviewLineClamp') }}</span><output>{{ mailListPreviewLineClamp || t('off') }}</output>
                </div>
                <n-slider v-model:value="mailListPreviewLineClamp" :min="0" :max="5" :step="1"
                    :aria-label="t('mailListPreviewLineClamp')" />
            </div>
            <div class="appearance-slider">
                <div class="appearance-slider-label">
                    <span>{{ t('autoRefreshInterval') }}</span><output>{{ configAutoRefreshInterval }}</output>
                </div>
                <n-slider v-model:value="configAutoRefreshInterval" :min="30" :max="300" :step="1"
                    :aria-label="t('autoRefreshInterval')" />
            </div>
            <label v-if="!isMobile" class="appearance-row">
                <span>{{ t('useSideMargin') }}</span>
                <n-switch v-model:value="useSideMargin" :aria-label="t('useSideMargin')" />
            </label>
            <label v-if="props.showUseSimpleIndex" class="appearance-row">
                <span>{{ t('useSimpleIndex') }}</span>
                <n-switch v-model:value="useSimpleIndex" :aria-label="t('useSimpleIndex')" />
            </label>
        </section>
        <section class="workspace-panel appearance-section">
            <h2>{{ t('reading') }}</h2>
            <label v-for="setting in readingSettings" :key="setting.label" class="appearance-row">
                <span>{{ t(setting.label) }}</span>
                <n-switch v-model:value="setting.value.value" :aria-label="t(setting.label)" />
            </label>
            <div v-if="capability" class="appearance-row appearance-language">
                <span>{{ t('mailTranslationLanguage') }}</span>
                <n-select v-model:value="language" :options="languageOptions" :aria-label="t('mailTranslationLanguage')" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.appearance-settings {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 310px), 1fr));
    align-items: start;
    gap: 16px;
}

.appearance-section {
    padding: 16px 20px 8px;
    text-align: left;
}

.appearance-section h2 {
    margin: 0 0 6px;
    font-size: 17px;
}

.appearance-row,
.appearance-slider {
    padding-block: 11px;
}

.appearance-section > :where(.appearance-row, .appearance-slider) + :where(.appearance-row, .appearance-slider) {
    border-top: 1px solid var(--mail-border);
}

.appearance-row,
.appearance-slider-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.appearance-slider-label output {
    color: var(--mail-muted);
    font-variant-numeric: tabular-nums;
}

.appearance-slider .n-slider {
    margin-top: 6px;
}

.appearance-language .n-select {
    width: min(44%, 152px);
}
</style>
