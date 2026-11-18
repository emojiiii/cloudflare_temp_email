<script setup>
import DOMPurify from 'dompurify'
import { useScopedI18n } from '../i18n/app'
import { useGlobalState } from '../store'

const { openSettings } = useGlobalState()
const { t } = useScopedI18n('views.Footer')
</script>

<template>
    <footer v-if="openSettings.copyright" class="workspace-footer">
        <span>{{ t('copyright') }} © {{ new Date().getFullYear() }}</span>
        <span v-html="DOMPurify.sanitize(openSettings.copyright)" />
    </footer>
</template>

<style scoped>
.workspace-footer {
    display: flex;
    flex-wrap: wrap;
    column-gap: 4px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--mail-muted);
}
</style>
