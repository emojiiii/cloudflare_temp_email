<script setup>
import { NIcon } from 'naive-ui'
import { EditOutlined, MailOutlineRound } from '@vicons/material'
import { RouterLink } from 'vue-router'

defineProps({
    title: { type: String, required: true },
    composeTo: { type: Object, default: null },
    composeActive: { type: Boolean, default: false },
    composeLabel: { type: String, required: true },
    primaryLinks: { type: Array, required: true },
    accountLinks: { type: Array, required: true },
    navigationLabel: { type: String, required: true },
    adminLinks: { type: Array, required: true },
    adminLabel: { type: String, required: true },
    identity: { type: String, default: '' },
})
defineEmits(['brand', 'navigate'])
</script>

<template>
    <div class="rail-content">
        <button type="button" class="rail-brand" @click="$emit('brand')">
            <span class="rail-mark"><n-icon :component="MailOutlineRound" /></span>
            <span class="rail-brand-title">{{ title }}</span>
        </button>

        <RouterLink v-if="composeTo" :to="composeTo" custom v-slot="{ href, navigate }">
            <a :href="href" class="rail-compose" :aria-current="composeActive ? 'page' : undefined"
                @click="navigate($event); $emit('navigate')">
                <n-icon :component="EditOutlined" />
                <span>{{ composeLabel }}</span>
            </a>
        </RouterLink>

        <nav :aria-label="navigationLabel" class="rail-links">
            <RouterLink v-for="item in primaryLinks" :key="item.key" :to="item.to" custom v-slot="{ href, navigate }">
                <a :href="href" class="rail-link" :aria-current="item.active ? 'page' : undefined"
                    @click="navigate($event); $emit('navigate')">
                    <n-icon :component="item.icon" />
                    <span>{{ item.label }}</span>
                </a>
            </RouterLink>

            <div v-if="accountLinks.length" class="rail-account-links">
                <RouterLink v-for="item in accountLinks" :key="item.key" :to="item.to" custom
                    v-slot="{ href, navigate }">
                    <a :href="href" class="rail-link" :aria-current="item.active ? 'page' : undefined"
                        @click="navigate($event); $emit('navigate')">
                        <n-icon :component="item.icon" />
                        <span>{{ item.label }}</span>
                    </a>
                </RouterLink>
            </div>
        </nav>

        <nav v-if="adminLinks.length" :aria-label="adminLabel" class="rail-links rail-admin">
            <div class="rail-group-label">{{ adminLabel }}</div>
            <RouterLink v-for="item in adminLinks" :key="item.key" :to="item.to" custom
                v-slot="{ href, navigate }">
                <a :href="href" class="rail-link" :aria-current="item.active ? 'page' : undefined"
                    @click="navigate($event); $emit('navigate')">
                    <n-icon :component="item.icon" />
                    <span>{{ item.label }}</span>
                </a>
            </RouterLink>
        </nav>

        <div class="rail-footer">
            <div v-if="identity" class="rail-identity">
                <span class="rail-avatar" aria-hidden="true">{{ identity.slice(0, 1).toUpperCase() }}</span>
                <span class="rail-identity-address" :title="identity">{{ identity }}</span>
            </div>
            <slot name="footer" />
        </div>
    </div>
</template>

<style scoped>
.rail-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 20px 12px 12px;
}

.rail-brand,
.rail-link,
.rail-compose {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    text-align: start;
    text-decoration: none;
}

.rail-brand {
    color: var(--mail-ink);
    background: transparent;
    border: 0;
    padding: 0 4px;
    margin-bottom: 24px;
    cursor: pointer;
}

.rail-mark,
.rail-avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
}

.rail-mark {
    width: 31px;
    height: 31px;
    border-radius: 8px;
    background: var(--mail-brand);
    color: #fff;
    font-size: 19px;
}

.rail-brand-title {
    font-size: 16px;
    font-weight: 720;
    line-height: 1.25;
    overflow-wrap: anywhere;
    letter-spacing: -.03em;
}

.rail-compose {
    min-height: 40px;
    border-radius: 7px;
    padding: 8px 10px;
    color: #fff;
    background: var(--mail-brand);
    font-weight: 650;
    margin-bottom: 16px;
}

.rail-compose:hover {
    background: color-mix(in srgb, var(--mail-brand), #000 10%);
    color: #fff;
}

.rail-links {
    display: grid;
    gap: 2px;
}

.rail-link {
    min-height: 37px;
    border-radius: 7px;
    padding: 6px 9px;
    color: var(--mail-muted);
    font-size: 13px;
    font-weight: 550;
}

.rail-link .n-icon,
.rail-compose .n-icon {
    font-size: 17px;
    flex: 0 0 auto;
}

.rail-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rail-link:focus-visible {
    outline: 2px solid var(--mail-accent);
    outline-offset: -2px;
}

.rail-link:hover {
    color: var(--mail-ink);
    background: var(--mail-hover);
}

.rail-link[aria-current="page"] {
    color: var(--mail-accent);
    background: var(--mail-active);
    font-weight: 670;
}

.rail-account-links {
    border-top: 1px solid var(--mail-border);
    margin-top: 10px;
    padding-top: 10px;
    display: grid;
    gap: 4px;
}

.rail-admin {
    border-top: 1px solid var(--mail-border);
    margin-block-start: 13px;
    padding-block-start: 12px;
}

.rail-group-label {
    margin: 0 9px 5px;
    color: var(--mail-muted);
    font-size: 11px;
    font-weight: 650;
}

.rail-admin .rail-link {
    min-height: 34px;
}

.rail-footer {
    display: grid;
    gap: 5px;
    margin-block-start: auto;
    padding-block-start: 12px;
}

.rail-identity {
    display: flex;
    align-items: center;
    gap: 9px;
    border-top: 1px solid var(--mail-border);
    padding: 10px 5px 3px;
    color: var(--mail-ink);
    min-width: 0;
}

.rail-avatar {
    width: 27px;
    height: 27px;
    font: 650 12px var(--mail-font);
    border-radius: 50%;
    color: var(--mail-accent);
    background: var(--mail-active);
}

.rail-identity-address {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}
</style>
