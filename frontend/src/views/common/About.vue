<script setup>
import { computed } from 'vue'
import { GithubAlt, Discord, Telegram } from '@vicons/fa'
import { LaunchOutlined, MailOutlineRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { sanitizeHtml } from '../../utils/sanitize-html'
const { announcement, openSettings } = useGlobalState()
const { t } = useScopedI18n('views.common.About')
const safeAnnouncement = computed(() => sanitizeHtml(announcement.value))
const links = [
    { label: 'GitHub', icon: GithubAlt, url: 'https://github.com/dreamhunter2333/cloudflare_temp_email' },
    { label: 'Discord', icon: Discord, url: 'https://discord.gg/dQEwTWhA6Q' },
    { label: 'Telegram', icon: Telegram, url: 'https://t.me/cloudflare_temp_email' }
]
</script>

<template>
    <section class="workspace-panel about-panel">
        <div class="about-identity">
            <n-icon class="about-logo" :component="MailOutlineRound" />
            <div>
                <h2>{{ openSettings.title || t('projectName') }}</h2>
                <span v-if="openSettings.version">v{{ openSettings.version }}</span>
            </div>
        </div>
        <div v-if="safeAnnouncement" class="about-announcement" v-html="safeAnnouncement"></div>
        <nav class="about-links" :aria-label="t('projectLinks')">
            <a v-for="link in links" :key="link.label" :href="link.url" target="_blank" rel="noopener noreferrer">
                <n-icon :component="link.icon" aria-hidden="true" />
                <span>{{ link.label }}</span>
                <n-icon :component="LaunchOutlined" aria-hidden="true" />
            </a>
        </nav>
    </section>
</template>

<style scoped>
.about-panel {
    width: min(100%, 680px);
    padding: clamp(16px, 3vw, 28px);
}

.about-identity {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
}

.about-logo {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    border-radius: 12px;
    background: var(--mail-active);
    color: var(--mail-accent);
    font-size: 22px;
}

.about-identity h2 {
    margin: 0;
    font-size: 20px;
}

.about-identity span {
    color: var(--mail-muted);
    font-size: 13px;
}

.about-announcement,
.about-links {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--mail-border);
}

.about-links {
    display: grid;
    gap: 2px;
}

.about-links a {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    align-items: center;
    min-height: 42px;
    gap: 10px;
    padding-inline: 8px;
    border-radius: 8px;
    color: var(--mail-ink);
    text-align: left;
    text-decoration: none;
}

.about-links a:hover {
    color: var(--mail-accent);
    background: var(--mail-hover);
}
</style>
