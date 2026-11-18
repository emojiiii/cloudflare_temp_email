<script setup>
import { computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { MailOutlineRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { api } from '../api'
import UserLogin from './user/UserLogin.vue'

const message = useMessage()
const { openSettings, userOpenSettings, showUserSystem } = useGlobalState()
const { t } = useScopedI18n('views.Header')
const brand = computed(() => openSettings.value.title || t('title'))
const siteReady = computed(() => openSettings.value.fetched && !openSettings.value.needAuth)
const formReady = computed(() => siteReady.value && (!showUserSystem.value || userOpenSettings.value.fetched))

watch(() => siteReady.value && showUserSystem.value, ready => {
    if (ready) void api.getUserOpenSettings(message)
}, { immediate: true })
</script>

<template>
    <main class="login-screen" aria-labelledby="login-brand">
        <div class="login-panel">
            <header class="login-panel__brand">
                <span class="login-panel__mark" aria-hidden="true">
                    <n-icon :component="MailOutlineRound" />
                </span>
                <h1 id="login-brand">{{ brand }}</h1>
            </header>

            <div :aria-busy="!formReady">
                <UserLogin v-if="formReady" />
                <n-skeleton v-else height="220px" :sharp="false" />
            </div>
        </div>
    </main>
</template>

<style scoped>
.login-screen {
    display: grid;
    place-items: center;
    min-block-size: 100dvh;
    padding: clamp(16px, 4vw, 40px);
    background:
        radial-gradient(ellipse at 50% 0%, var(--mail-active), transparent 66%),
        var(--mail-rail);
}

.login-panel {
    inline-size: min(100%, 440px);
    padding: clamp(20px, 5vw, 36px);
    border: 1px solid var(--mail-border);
    border-radius: 18px;
    background: var(--mail-surface);
    box-shadow: 0 16px 56px rgba(21, 34, 85, .07);
}

.login-panel__brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-block-end: 22px;
}

.login-panel__mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 42px;
    block-size: 42px;
    border-radius: 12px;
    background: var(--mail-brand);
    color: #ffffff;
    font-size: 24px;
}

.login-panel__brand h1 {
    margin: 0;
    font-size: clamp(22px, 6vw, 27px);
    font-weight: 720;
    letter-spacing: -.025em;
    overflow-wrap: anywhere;
}

@media (max-width: 480px) {
    .login-screen {
        background: var(--mail-surface);
    }

    .login-panel {
        border: 0;
        box-shadow: none;
    }
}
</style>
