<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { CheckRound, SearchRound } from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'

const props = defineProps({
    modelValue: { type: String, default: '' },
    fetchMailboxes: { type: Function, required: true },
    allowExact: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const { t } = useScopedI18n('components.MailboxTabs')

const limit = 12
const mailboxes = ref([])
const loading = ref(true)
const failed = ref(false)
const pickerOpen = ref(false)
const tabList = ref(null)
const trigger = ref(null)
const searchInput = ref(null)
const search = ref('')
const foundMailboxes = ref([])
const searching = ref(false)
const searchFailed = ref(false)

const query = computed(() => search.value.trim())
const options = computed(() => query.value ? foundMailboxes.value : mailboxes.value)
const pending = computed(() => query.value ? searching.value : loading.value)
const pickerFailed = computed(() => query.value ? searchFailed.value : failed.value)
const tabs = computed(() => {
    const visible = mailboxes.value.slice(0, 2)
    if (props.modelValue && !visible.includes(props.modelValue)) visible.push(props.modelValue)
    return ['', ...visible]
})
const typedMailbox = computed(() => {
    if (!query.value.includes('@')) return ''
    const lower = query.value.toLowerCase()
    const match = [...options.value, ...mailboxes.value].find(name => name.toLowerCase() === lower)
    return match || (props.allowExact ? query.value : '')
})

watch(tabs, () => {
    const selected = tabList.value?.querySelector('[aria-pressed="true"]')
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}, { flush: 'post' })

watch(() => props.fetchMailboxes, async (fetchMailboxes, _, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    loading.value = true
    failed.value = false
    try {
        const { results } = await fetchMailboxes({ limit, offset: 0, query: '', signal: controller.signal })
        if (!controller.signal.aborted) mailboxes.value = results.map(row => row.name)
    } catch {
        if (!controller.signal.aborted) failed.value = true
    } finally {
        if (!controller.signal.aborted) loading.value = false
    }
}, { immediate: true })

watch([pickerOpen, query], ([open, term], _, onCleanup) => {
    if (!open || !term) return
    const controller = new AbortController()
    foundMailboxes.value = []
    searching.value = true
    searchFailed.value = false
    const timer = setTimeout(async () => {
        try {
            const { results } = await props.fetchMailboxes({ limit, offset: 0, query: term, signal: controller.signal })
            if (!controller.signal.aborted) foundMailboxes.value = results.map(row => row.name)
        } catch {
            if (!controller.signal.aborted) searchFailed.value = true
        } finally {
            if (!controller.signal.aborted) searching.value = false
        }
    }, 180)
    onCleanup(() => {
        clearTimeout(timer)
        controller.abort()
    })
})

watch(pickerOpen, async open => {
    if (!open) {
        search.value = ''
        return
    }
    await nextTick()
    searchInput.value?.focus()
})

const closePicker = () => {
    pickerOpen.value = false
    trigger.value?.focus()
}

const selectFromPicker = (mailbox) => {
    closePicker()
    emit('update:modelValue', mailbox)
}

const submitSearch = () => {
    const mailbox = typedMailbox.value || (!pending.value && options.value.length === 1 ? options.value[0] : '')
    if (mailbox) selectFromPicker(mailbox)
}
</script>

<template>
    <div class="mailbox-switcher">
        <div ref="tabList" class="mailbox-switcher__tabs" role="group" :aria-label="t('filterByMailbox')">
            <button v-for="mailbox in tabs" :key="mailbox" type="button" class="mailbox-switcher__tab"
                :aria-pressed="modelValue === mailbox" :title="mailbox || t('allMailboxes')"
                @click="emit('update:modelValue', mailbox)">
                {{ mailbox || t('allMailboxes') }}
            </button>
        </div>
        <n-popover v-model:show="pickerOpen" trigger="click" placement="bottom-end" :show-arrow="false"
            :style="{ width: 'min(340px, calc(100vw - 24px))', padding: '10px' }">
            <template #trigger>
                <button ref="trigger" type="button" class="mailbox-switcher__find" :aria-label="t('findMailbox')"
                    :title="t('findMailbox')" :aria-expanded="pickerOpen" aria-haspopup="dialog"
                    @keydown.esc.stop="closePicker">
                    <n-icon :component="SearchRound" />
                </button>
            </template>
            <div role="dialog" :aria-label="t('findMailbox')" @keydown.esc.stop="closePicker">
                <form class="mailbox-picker" @submit.prevent="submitSearch">
                    <n-input ref="searchInput" v-model:value="search" size="small" clearable
                        :placeholder="t('findMailbox')" :input-props="{ 'aria-label': t('findMailbox'), inputmode: 'email' }">
                        <template #prefix><n-icon :component="SearchRound" /></template>
                    </n-input>
                    <div v-if="pending" class="mailbox-picker__status" role="status">
                        <n-spin size="small" :aria-label="t('findMailbox')" />
                    </div>
                    <p v-else-if="pickerFailed" class="mailbox-picker__status" role="status">{{ t('loadFailed') }}</p>
                    <p v-else-if="!options.length && !typedMailbox" class="mailbox-picker__status" role="status">
                        {{ t('noResults') }}
                    </p>
                    <ul v-else-if="options.length" class="mailbox-picker__options">
                        <li v-for="mailbox in options" :key="mailbox">
                            <button type="button" class="mailbox-picker__option" :aria-current="modelValue === mailbox ? 'true' : undefined"
                                @click="selectFromPicker(mailbox)">
                                <span>{{ mailbox }}</span>
                                <n-icon v-if="modelValue === mailbox" :component="CheckRound" aria-hidden="true" />
                            </button>
                        </li>
                    </ul>
                    <button v-if="typedMailbox && !options.includes(typedMailbox)" type="submit" class="mailbox-picker__option mailbox-picker__exact">
                        <span>{{ t('openAddress', { address: typedMailbox }) }}</span>
                    </button>
                </form>
            </div>
        </n-popover>
    </div>
</template>

<style scoped>
.mailbox-switcher {
    display: grid;
    grid-template-columns: minmax(0, max-content) auto;
    align-items: end;
    justify-content: start;
    gap: 8px;
    margin-block-end: 12px;
    border-block-end: 1px solid var(--mail-border);
}

.mailbox-switcher__tabs {
    display: flex;
    gap: 6px;
    min-inline-size: 0;
    padding: 3px 3px 0;
    overflow-x: auto;
    scrollbar-width: thin;
}

.mailbox-switcher__tab,
.mailbox-switcher__find,
.mailbox-picker__option {
    border: 0;
    background: transparent;
    color: var(--mail-muted);
    cursor: pointer;
}

.mailbox-switcher__tab {
    flex: 0 0 auto;
    max-inline-size: min(100%, 250px);
    min-block-size: 37px;
    padding: 3px 11px 0;
    border-block-end: 2px solid transparent;
    border-radius: 7px 7px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}

.mailbox-switcher__tab:hover,
.mailbox-switcher__find:hover,
.mailbox-picker__option:hover {
    color: var(--mail-ink);
    background: var(--mail-hover);
}

.mailbox-switcher__tab[aria-pressed="true"] {
    border-block-end-color: var(--mail-accent);
    background: var(--mail-active);
    color: var(--mail-accent);
    font-weight: 650;
}

.mailbox-switcher__find {
    display: grid;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    margin: 3px;
    border-radius: 8px;
    font-size: 19px;
}

.mailbox-picker {
    display: grid;
    gap: 7px;
}

.mailbox-picker__options {
    max-block-size: min(240px, 40dvh);
    margin: 0;
    padding: 0 2px;
    overflow: auto;
    overscroll-behavior: contain;
    list-style: none;
}

.mailbox-picker__option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    inline-size: 100%;
    min-block-size: 34px;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--mail-ink);
    text-align: start;
    font-size: 13px;
}

.mailbox-picker__option span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.mailbox-picker__option[aria-current="true"],
.mailbox-picker__exact {
    color: var(--mail-accent);
    background: var(--mail-active);
}

.mailbox-picker__status {
    margin: 4px 8px;
    color: var(--mail-muted);
    font-size: 13px;
}
</style>
