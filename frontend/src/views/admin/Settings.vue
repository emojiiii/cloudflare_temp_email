<script setup>
import { ChevronRightRound } from '@vicons/material'
import { NIcon } from 'naive-ui'
import { RouterLink } from 'vue-router'
import { useAdminNavigation } from '../workspace/admin-navigation'

const { settingsGroups } = useAdminNavigation()
</script>

<template>
    <div class="settings-overview">
        <section v-for="group in settingsGroups" :key="group.key" class="settings-group"
            :aria-labelledby="`settings-group-${group.key}`">
            <h2 :id="`settings-group-${group.key}`">{{ group.label }}</h2>
            <ul>
                <li v-for="item in group.items" :key="item.key">
                    <RouterLink :to="item.to" class="settings-entry">
                        <span class="settings-entry-icon">
                            <n-icon :component="item.icon" aria-hidden="true" />
                        </span>
                        <span class="settings-entry-label">{{ item.label }}</span>
                        <span v-if="item.status" class="settings-entry-status"
                            :class="{ 'settings-entry-status--enabled': item.status.enabled }">
                            {{ item.status.label }}
                        </span>
                        <n-icon class="settings-entry-arrow" :component="ChevronRightRound" aria-hidden="true" />
                    </RouterLink>
                </li>
            </ul>
        </section>
    </div>
</template>

<style scoped>
.settings-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
    gap: 12px;
    align-items: start;
}

.settings-group {
    min-width: 0;
    padding: 0 8px 8px;
    background: var(--mail-surface);
    border: 1px solid var(--mail-border);
    border-radius: var(--mail-radius);
}

.settings-group h2 {
    margin: 0;
    padding: 16px 11px 9px;
    font-size: 15px;
    font-weight: 700;
}

.settings-group ul {
    display: grid;
    gap: 2px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.settings-entry {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px 9px;
    min-height: 48px;
    padding: 7px 9px;
    border-radius: 8px;
    color: var(--mail-ink);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    overflow-wrap: anywhere;
}

.settings-entry-icon {
    display: inline-grid;
    width: 29px;
    height: 29px;
    place-items: center;
    border-radius: 8px;
    background: var(--mail-hover);
    color: var(--mail-accent);
}

.settings-entry .n-icon {
    font-size: 16px;
}

.settings-entry-status {
    grid-column: 3;
    color: var(--mail-muted);
    font-size: 12px;
    font-weight: 500;
}

.settings-entry-status--enabled {
    color: var(--mail-accent);
}

.settings-entry-arrow {
    grid-column: 4;
    color: var(--mail-muted);
}

.settings-entry:hover {
    color: var(--mail-accent);
    background: var(--mail-hover);
}

.settings-entry:focus-visible {
    outline: 2px solid var(--mail-accent);
    outline-offset: -2px;
}

.settings-entry-arrow:dir(rtl) {
    transform: rotate(180deg);
}
</style>
