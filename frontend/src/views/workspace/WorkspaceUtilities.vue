<script setup>
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { DarkModeOutlined, LanguageOutlined, LightModeOutlined, MonitorHeartOutlined } from '@vicons/material'
import { GithubAlt } from '@vicons/fa'
import { useScopedI18n } from '../../i18n/app'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../../i18n/locale-registry'
import { useGlobalState } from '../../store'

defineEmits(['locale'])

const { t, locale } = useScopedI18n('views.Header')
const { toggleDark, isDark, openSettings, showAdminPage } = useGlobalState()
const languageOptions = SUPPORTED_LOCALES.map((value) => ({ label: getLocaleLabel(value), key: value }))
const languageLabel = computed(() => getLocaleLabel(locale.value))
const showGithub = computed(() => openSettings.value.showGithub
    && (openSettings.value.showGithubForUser || showAdminPage.value))
const version = import.meta.env.PACKAGE_VERSION ? ` v${import.meta.env.PACKAGE_VERSION}` : ''
</script>

<template>
    <div class="workspace-utilities">
        <n-dropdown :options="languageOptions" trigger="click" placement="top-start" @select="$emit('locale', $event)">
            <button class="utility-button utility-language" type="button" :aria-label="languageLabel">
                <n-icon :component="LanguageOutlined" />
                <span>{{ languageLabel }}</span>
            </button>
        </n-dropdown>
        <button type="button" class="utility-button" :title="isDark ? t('light') : t('dark')"
            :aria-label="isDark ? t('light') : t('dark')" @click="toggleDark()">
            <n-icon :component="isDark ? LightModeOutlined : DarkModeOutlined" />
        </button>
        <a v-if="openSettings.statusUrl" class="utility-button" :title="t('status')"
            :aria-label="t('status')" :href="openSettings.statusUrl" rel="noopener noreferrer" target="_blank">
            <n-icon :component="MonitorHeartOutlined" />
        </a>
        <a v-if="showGithub" class="utility-button" :title="`GitHub${version}`" :aria-label="`GitHub${version}`"
            href="https://github.com/dreamhunter2333/cloudflare_temp_email" rel="noopener noreferrer" target="_blank">
            <n-icon :component="GithubAlt" />
        </a>
    </div>
</template>

<style scoped>
.workspace-utilities {
    display: flex;
    align-items: center;
    gap: 3px;
    padding-inline: 1px;
}

.utility-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 31px;
    min-height: 33px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--mail-muted);
    text-decoration: none;
    cursor: pointer;
}

.utility-button:hover {
    background: var(--mail-hover);
    color: var(--mail-ink);
}

.utility-button .n-icon {
    flex: 0 0 auto;
    font-size: 16px;
}

.utility-language {
    min-width: 0;
    margin-inline-end: auto;
    font-size: 12px;
    font-weight: 600;
}

.utility-language span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
