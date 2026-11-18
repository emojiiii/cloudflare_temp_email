<script setup>
import { ref, h, onMounted, watch, computed } from 'vue';
import { NButton, NDropdown, NIcon, useMessage } from 'naive-ui'
import { RouterLink, useRouter } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'
import { adminWorkspaceLocation, mailboxLocation } from '@/router/workspace-paths'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { hashPassword, utcToLocalDate } from '../../utils'
import { MoreHorizOutlined, SearchOutlined } from '@vicons/material'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const { loading, openSettings, useUTCDate } = useGlobalState()
const message = useMessage()
const router = useRouter()

const props = defineProps({ accountWorkspace: Boolean })
const { t, locale } = useScopedI18n('views.admin.Account')
const mailLocation = (view, address) => {
    const location = props.accountWorkspace && view === 'mails'
        ? mailboxLocation('mailbox', locale.value)
        : adminWorkspaceLocation('mails', view, locale.value)
    return { ...location, query: { address } }
}
const renderMailCount = (row, view, count, label) => count > 0
    ? h(RouterLink, {
        to: mailLocation(view, row.name),
        class: 'mailboxes-count-link',
        'aria-label': `${t(label)} · ${row.name} · ${count}`,
    }, { default: () => count })
    : h('span', { class: 'mailboxes-count-empty' }, '0')

const showEmailCredential = ref(false)
const curEmailCredential = ref("")
const curEmailAddress = ref("")
const curDeleteAddressId = ref(0);
const curClearInboxAddressId = ref(0);
const curClearSentItemsAddressId = ref(0);
const showResetPassword = ref(false);
const curResetPasswordAddressId = ref(0);
const newPassword = ref('');

// Multi-action mode state
const checkedRowKeys = ref([]);
const showMultiActionModal = ref(false);
const multiActionProgress = ref({ percentage: 0, tip: '0/0' });
const multiActionTitle = ref('');

const selectedCount = computed(() => checkedRowKeys.value.length);
const showMultiActionBar = computed(() => checkedRowKeys.value.length > 0);

const addressQuery = ref("")
const sortBy = ref("")
const sortOrder = ref("")

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showDeleteAccount = ref(false)
const showClearInbox = ref(false)
const showClearSentItems = ref(false)

const showCredential = async (row) => {
    try {
        curEmailAddress.value = row.name
        curEmailCredential.value = await api.adminShowAddressCredential(row.id)
        showEmailCredential.value = true
    } catch (error) {
        message.error(error.message || "error");
        showEmailCredential.value = false
        curEmailCredential.value = ""
        curEmailAddress.value = ""
    }
}

const deleteEmail = async () => {
    try {
        await api.adminDeleteAddress(curDeleteAddressId.value)
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showDeleteAccount.value = false
    }
}

const clearInbox = async () => {
    try {
        await api.fetch(`/admin/clear_inbox/${curClearInboxAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearInbox.value = false
    }
}

const clearSentItems = async () => {
    try {
        await api.fetch(`/admin/clear_sent_items/${curClearSentItemsAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearSentItems.value = false
    }
}

const resetPassword = async () => {
    const normalizedPassword = newPassword.value.trim()
    if (!normalizedPassword) {
        message.error(t("newPassword"));
        return;
    }
    try {
        await api.fetch(`/admin/address/${curResetPasswordAddressId.value}/reset_password`, {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(normalizedPassword)
            })
        });
        message.success(t("passwordResetSuccess"));
        newPassword.value = '';
        showResetPassword.value = false;
    } catch (error) {
        message.error(error.message || "error");
    }
}

// Multi-action mode functions
const multiActionSelectAll = () => {
    checkedRowKeys.value = data.value.map(item => item.id);
}

const multiActionUnselectAll = () => {
    checkedRowKeys.value = [];
}

// 通用批量操作函数
const executeBatchOperation = async ({
    shouldSkip = () => false,
    apiCall,
    title,
    operationName = 'operation'
}) => {
    try {
        loading.value = true;
        const selectedAddresses = data.value.filter((item) =>
            checkedRowKeys.value.includes(item.id)
        );

        if (selectedAddresses.length === 0) {
            message.error(t('pleaseSelectAddress'));
            return;
        }

        const failedIds = [];
        const totalCount = selectedAddresses.length;

        multiActionProgress.value = {
            percentage: 0,
            tip: `0/${totalCount}`
        };
        multiActionTitle.value = title;
        showMultiActionModal.value = true;

        for (const [index, address] of selectedAddresses.entries()) {
            try {
                if (!shouldSkip(address)) {
                    await apiCall(address.id);
                }
            } catch (error) {
                console.error(`${operationName} failed for address ${address.id}:`, error);
                failedIds.push(address.id);
            }
            multiActionProgress.value = {
                percentage: Math.floor((index + 1) / totalCount * 100),
                tip: `${index + 1}/${totalCount}`
            };
        }

        await fetchData();
        checkedRowKeys.value = failedIds;
        message.success(t("success"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false;
    }
}

const multiActionDeleteAccounts = async () => {
    await executeBatchOperation({
        apiCall: (id) => api.adminDeleteAddress(id),
        title: t('multiDelete') + ' ' + t('success'),
        operationName: 'Delete'
    });
}

const multiActionClearInbox = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.mail_count <= 0,
        apiCall: (id) => api.fetch(`/admin/clear_inbox/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearInbox') + ' ' + t('success'),
        operationName: 'ClearInbox'
    });
}

const multiActionClearSentItems = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.send_count <= 0,
        apiCall: (id) => api.fetch(`/admin/clear_sent_items/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearSentItems') + ' ' + t('success'),
        operationName: 'ClearSentItems'
    });
}

const fetchData = async () => {
    try {
        addressQuery.value = addressQuery.value.trim()
        const { results, count: addressCount } = await api.fetch(
            `/admin/address`
            + `?limit=${pageSize.value}`
            + `&offset=${(page.value - 1) * pageSize.value}`
            + (addressQuery.value ? `&query=${addressQuery.value}` : "")
            + (sortBy.value ? `&sort_by=${sortBy.value}` : "")
            + (sortOrder.value ? `&sort_order=${sortOrder.value}` : "")
        );
        data.value = results;
        if (page.value === 1 || addressCount > 0) {
            count.value = addressCount ?? 0;
        }
    } catch (error) {
        console.error(error);
        message.error(error.message || "error");
    }
}

const searchData = () => {
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const handleSorterChange = (sorter) => {
    sortBy.value = sorter.columnKey || "";
    sortOrder.value = sorter.order || "";
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const columns = computed(() => [
    {
        type: 'selection'
    },
    {
        title: "ID",
        key: "id",
        sorter: true,
        sortOrder: sortBy.value === 'id' ? sortOrder.value : false
    },
    {
        title: t('emailAddress'),
        key: "name",
        sorter: true,
        sortOrder: sortBy.value === 'name' ? sortOrder.value : false,
        render: row => props.accountWorkspace
            ? h(RouterLink, { to: mailLocation('mails', row.name), class: 'mailboxes-address-link' }, { default: () => row.name })
            : row.name,
    },
    {
        title: t('created_at'),
        key: "created_at",
        sorter: true,
        sortOrder: sortBy.value === 'created_at' ? sortOrder.value : false,
        render(row) {
            return utcToLocalDate(row.created_at, useUTCDate.value);
        }
    },
    {
        title: t('updated_at'),
        key: "updated_at",
        sorter: true,
        sortOrder: sortBy.value === 'updated_at' ? sortOrder.value : false,
        render(row) {
            return utcToLocalDate(row.updated_at, useUTCDate.value);
        }
    },
    {
        title: t('source_meta'),
        key: "source_meta",
        sorter: true,
        sortOrder: sortBy.value === 'source_meta' ? sortOrder.value : false,
        render(row) {
            const val = row.source_meta;
            if (!val) return '';
            const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
            const ipv6Regex = /^[0-9a-fA-F:]+$/;
            if (ipv4Regex.test(val) || (val.includes(':') && ipv6Regex.test(val) && !val.startsWith('tg:'))) {
                return h('a', {
                    href: `https://ip.im/${val}`,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                }, val);
            }
            return val;
        }
    },
    {
        title: t('mail_count'),
        key: 'mail_count',
        sorter: true,
        sortOrder: sortBy.value === 'mail_count' ? sortOrder.value : false,
        render(row) {
            return renderMailCount(row, 'mails', row.mail_count, 'viewMails')
        },
    },
    {
        title: t('send_count'),
        key: 'send_count',
        sorter: true,
        sortOrder: sortBy.value === 'send_count' ? sortOrder.value : false,
        render(row) {
            return renderMailCount(row, 'sendBox', row.send_count, 'viewSendBox')
        },
    },
    {
        title: t('actions'),
        key: 'actions',
        render(row) {
            const actions = [
                { key: 'showCredential', run: () => showCredential(row) },
                ...row.mail_count > 0 ? [
                    { key: 'viewMails', run: () => router.push(mailLocation('mails', row.name)) },
                    {
                        key: 'clearInbox', run: () => {
                            curClearInboxAddressId.value = row.id
                            showClearInbox.value = true
                        },
                    },
                ] : [],
                ...row.send_count > 0 ? [
                    { key: 'viewSendBox', run: () => router.push(mailLocation('sendBox', row.name)) },
                    {
                        key: 'clearSentItems', run: () => {
                            curClearSentItemsAddressId.value = row.id
                            showClearSentItems.value = true
                        },
                    },
                ] : [],
                ...openSettings.value.enableAddressPassword ? [{
                    key: 'resetPassword', run: () => {
                        curResetPasswordAddressId.value = row.id
                        showResetPassword.value = true
                    },
                }] : [],
                {
                    key: 'delete', run: () => {
                        curDeleteAddressId.value = row.id
                        showDeleteAccount.value = true
                    },
                },
            ]
            return h(NDropdown, {
                options: actions.map(({ key }) => ({ key, label: t(key) })),
                trigger: 'click',
                onSelect: key => actions.find(action => action.key === key).run(),
            }, {
                default: () => h(NButton, {
                    size: 'small',
                    quaternary: true,
                    circle: true,
                    'aria-label': `${t('actions')} · ${row.name}`,
                    title: t('actions'),
                }, { icon: () => h(NIcon, { component: MoreHorizOutlined, size: 19 }) }),
            })
        },
    },
])

watch([page, pageSize], async () => {
    await fetchData()
})

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div class="mailboxes-panel">
        <AddressCredentialModal v-model:show="showEmailCredential" :address="curEmailAddress"
            :jwt="curEmailCredential" />
        <n-modal v-model:show="showDeleteAccount" preset="dialog" :title="t('deleteMailbox')">
            <p>{{ t('deleteTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="deleteEmail" size="small" tertiary type="error">
                    {{ t('deleteMailbox') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showClearInbox" preset="dialog" :title="t('clearInbox')">
            <p>{{ t('clearInboxTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearInbox" size="small" tertiary type="error">
                    {{ t('clearInbox') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showClearSentItems" preset="dialog" :title="t('clearSentItems')">
            <p>{{ t('clearSentItemsTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearSentItems" size="small" tertiary type="error">
                    {{ t('clearSentItems') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showResetPassword" preset="dialog" :title="t('resetPassword')">
            <n-form-item :label="t('newPassword')">
                <n-input v-model:value="newPassword" type="password" placeholder="" show-password-on="click"
                    @keyup.enter="resetPassword" />
            </n-form-item>
            <template #action>
                <n-button :loading="loading" @click="resetPassword" size="small" tertiary type="info">
                    {{ t('resetPassword') }}
                </n-button>
            </template>
        </n-modal>
        <form class="mailboxes-search" @submit.prevent="searchData">
            <n-input-group>
                <n-input v-model:value="addressQuery" clearable :placeholder="t('addressQueryTip')"
                    :input-props="{ 'aria-label': t('addressQueryTip') }">
                    <template #prefix><n-icon :component="SearchOutlined" /></template>
                </n-input>
                <n-button attr-type="submit" secondary>{{ t('query') }}</n-button>
            </n-input-group>
        </form>

        <n-space v-if="showMultiActionBar" style="margin-bottom: 10px;">
            <n-button @click="multiActionSelectAll" tertiary>
                {{ t('selectAll') }}
            </n-button>
            <n-button @click="multiActionUnselectAll" tertiary>
                {{ t('unselectAll') }}
            </n-button>
            <n-popconfirm @positive-click="multiActionDeleteAccounts">
                <template #trigger>
                    <n-button tertiary type="error">{{ t('multiDelete') }}</n-button>
                </template>
                {{ t('multiDeleteTip') }}
            </n-popconfirm>
            <n-popconfirm @positive-click="multiActionClearInbox">
                <template #trigger>
                    <n-button tertiary type="warning">{{ t('multiClearInbox') }}</n-button>
                </template>
                {{ t('multiClearInboxTip') }}
            </n-popconfirm>
            <n-popconfirm @positive-click="multiActionClearSentItems">
                <template #trigger>
                    <n-button tertiary type="warning">{{ t('multiClearSentItems') }}</n-button>
                </template>
                {{ t('multiClearSentItemsTip') }}
            </n-popconfirm>
            <n-tag type="info">
                {{ t('selectedItems') }}: {{ selectedCount }}
            </n-tag>
        </n-space>
        <div class="mailboxes-table">
            <n-data-table v-model:checked-row-keys="checkedRowKeys" :columns="columns" :data="data" :bordered="false"
                :row-key="row => row.id" :scroll-x="1000" remote @update:sorter="handleSorterChange" />
        </div>
        <div class="mailboxes-pagination">
            <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
                :page-sizes="[20, 50, 100]" show-size-picker>
                <template #prefix="{ itemCount }">
                    {{ t('itemCount') }}: {{ itemCount }}
                </template>
            </n-pagination>
        </div>

        <!-- Multi-action progress modal -->
        <n-modal v-model:show="showMultiActionModal" preset="dialog" :title="multiActionTitle" negative-text="OK">
            <n-space justify="center">
                <n-progress type="circle" status="info" :percentage="multiActionProgress.percentage">
                    <span style="text-align: center">
                        {{ multiActionProgress.tip }}
                    </span>
                </n-progress>
            </n-space>
        </n-modal>

    </div>
</template>

<style scoped>
.mailboxes-panel {
    display: grid;
    gap: 14px;
    min-width: 0;
}

.mailboxes-search {
    width: min(100%, 420px);
}

.mailboxes-panel :deep(.mailboxes-address-link) {
    color: var(--mail-accent);
    text-underline-offset: 2px;
}

.mailboxes-table,
.mailboxes-pagination {
    min-width: 0;
}

.mailboxes-pagination {
    display: flex;
    justify-content: flex-end;
    overflow-x: auto;
}

.mailboxes-panel :deep(.mailboxes-count-link),
.mailboxes-panel :deep(.mailboxes-count-empty) {
    display: inline-grid;
    place-items: center;
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.mailboxes-panel :deep(.mailboxes-count-link) {
    color: var(--mail-accent, #18735a);
    background: color-mix(in srgb, var(--mail-accent, #18735a) 11%, var(--mail-surface, #fff));
    text-decoration: none;
}

.mailboxes-panel :deep(.mailboxes-count-link:hover) {
    text-decoration: underline;
}

.mailboxes-panel :deep(.mailboxes-count-empty) {
    color: var(--mail-muted, #5b6d63);
}
</style>
