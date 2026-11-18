<script setup>
import { computed, h, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { Copy, User, ExchangeAlt } from '@vicons/fa'
import { FullscreenExitOutlined, MoreHorizRound } from '@vicons/material'
import { NIcon } from 'naive-ui'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import Login from '../common/Login.vue'
import TelegramAddress from './TelegramAddress.vue'
import LocalAddress from './LocalAddress.vue'
import AddressManagement from '../user/AddressManagement.vue'
import { getRouterPathWithLang } from '../../utils'
import AddressSelect from '../../components/AddressSelect.vue'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const router = useRouter()
const props = defineProps({ showSimpleMode: Boolean })

const {
    jwt, settings, openSettings, showAddressCredential,
    isTelegram, addressPassword, showUserSystem, showUserMailboxes, useSimpleIndex,
} = useGlobalState()

const { locale, t } = useScopedI18n('views.index.AddressBar')
const { t: tPicker } = useScopedI18n('components.AddressSelect')
const { t: tIndex } = useScopedI18n('views.Index')

const showAddressManage = ref(false)
const addressSelect = ref(null)
const addressActions = computed(() => [
    { key: 'copy', label: tPicker('copy'), icon: () => h(NIcon, { component: Copy }) },
    { key: 'manage', label: t('addressManage'), icon: () => h(NIcon, { component: ExchangeAlt }) },
    ...(props.showSimpleMode ? [{
        key: 'simple', label: tIndex('enterSimpleMode'), icon: () => h(NIcon, { component: FullscreenExitOutlined }),
    }] : []),
])

const selectAddressAction = (action) => {
    if (action === 'copy') void addressSelect.value?.copy()
    if (action === 'manage') showAddressManage.value = true
    if (action === 'simple') useSimpleIndex.value = true
}

const onUserLogin = async () => {
    await router.push(getRouterPathWithLang("/login", locale.value))
}

onMounted(async () => {
    await api.getSettings();
});
</script>

<template>
    <div class="mailbox-address-bar">
        <div v-if="!settings.fetched" class="mailbox-loading" aria-busy="true">
            <n-skeleton :sharp="false" height="36px" width="220px" />
        </div>
        <div v-else-if="settings.address" class="mailbox-address-picker">
            <AddressSelect ref="addressSelect" :show-copy="false">
                <template #actions>
                    <n-dropdown trigger="click" placement="bottom-end" :options="addressActions" @select="selectAddressAction">
                        <n-button class="address-manage" size="small" quaternary :aria-label="t('addressManage')"
                            :title="t('addressManage')">
                            <template #icon><n-icon :component="MoreHorizRound" /></template>
                        </n-button>
                    </n-dropdown>
                </template>
            </AddressSelect>
        </div>
        <div v-else-if="isTelegram">
            <TelegramAddress />
        </div>
        <div v-else-if="showUserMailboxes" class="center">
            <n-card :bordered="false" embedded style="max-width: 900px; width: 100%;">
                <AddressManagement />
            </n-card>
        </div>
        <div v-else class="center">
            <div class="mailbox-login">
                <n-alert v-if="jwt" type="warning" :show-icon="false" :bordered="false" closable>
                    <span>{{ t('fetchAddressError') }}</span>
                </n-alert>
                <Login />
                <n-button v-if="showUserSystem" @click="onUserLogin" type="primary" block quaternary>
                    <template #icon>
                        <n-icon :component="User" />
                    </template>
                    {{ t(openSettings.disableAnonymousUserCreateEmail ? 'accountLogin' : 'userCenter') }}
                </n-button>
            </div>
        </div>
        <AddressCredentialModal v-model:show="showAddressCredential" :address="settings.address" :jwt="jwt"
            :address-password="addressPassword" />
        <n-modal v-model:show="showAddressManage" preset="card" :title="t('addressManage')"
            style="width: min(720px, calc(100vw - 32px));">
            <TelegramAddress v-if="isTelegram" />
            <AddressManagement v-else-if="showUserMailboxes" />
            <LocalAddress v-else />
        </n-modal>
    </div>
</template>

<style scoped>
.mailbox-address-bar {
    min-width: 0;
}

.mailbox-address-picker :deep(.address-row) {
    justify-content: flex-end !important;
    flex-wrap: nowrap !important;
    gap: 4px;
}

.mailbox-address-picker :deep(.address-select) {
    min-width: 0;
    flex: 1 1 auto;
    max-width: 250px;
}

.mailbox-address-picker :deep(.n-base-selection) {
    --n-height: 32px !important;
    --n-border-radius: 8px !important;
    --n-color: var(--mail-rail, #f7f8fb) !important;
    --n-border: 1px solid transparent !important;
}

.mailbox-address-picker :deep(.n-base-selection .n-base-selection-label) {
    text-align: start;
}

.mailbox-loading {
    padding-block: 12px;
}

.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: clamp(20px, 6vh, 70px) auto;
}

.mailbox-login {
    display: grid;
    gap: 12px;
    width: min(480px, 100%);
}

.address-manage {
    flex: 0 0 auto;
    height: 32px;
    width: 32px;
    padding: 0;
}

@media (max-width: 820px) {
    .mailbox-address-picker :deep(.address-select) {
        max-width: none;
    }
}

</style>
