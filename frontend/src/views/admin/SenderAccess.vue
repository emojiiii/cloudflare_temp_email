<script setup>
import { ref, h, onMounted, watch } from 'vue';
import { SearchOutlined } from '@vicons/material'
import { NButton, NPopconfirm, NTag, useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { utcToLocalDate } from '../../utils';

const { loading, useUTCDate } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.SenderAccess')
const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const curRow = ref({})
const showModal = ref(false)
const senderBalance = ref(0)
const senderEnabled = ref(false)

const addressQuery = ref('')

const updateData = async () => {
  try {
    await api.fetch(`/admin/address_sender`, {
      method: 'POST',
      body: JSON.stringify({
        address: curRow.value.address,
        address_id: curRow.value.id,
        balance: senderBalance.value,
        enabled: senderEnabled.value ? 1 : 0
      })
    });
    showModal.value = false;
    message.success(t("success"));
    await fetchData()
  } catch (error) {
    message.error(error.message || "error");
  }
}

const fetchData = async () => {
  try {
    addressQuery.value = addressQuery.value.trim();
    const query = new URLSearchParams({ limit: pageSize.value, offset: (page.value - 1) * pageSize.value })
    if (addressQuery.value) query.set('address', addressQuery.value)
    const { results, count: addressCount } = await api.fetch(`/admin/address_sender?${query}`);
    data.value = results;
    count.value = addressCount;
  } catch (error) {
    console.log(error)
    message.error(error.message || "error");
  }
}

const search = () => {
  if (page.value === 1) return fetchData()
  page.value = 1
}

const columns = [
  {
    title: "ID",
    key: "id"
  },
  {
    title: t('address'),
    key: "address"
  },
  {
    title: t('created_at'),
    key: "created_at",
    render(row) {
      return utcToLocalDate(row.created_at, useUTCDate.value);
    }
  },
  {
    title: t('balance'),
    key: "balance"
  },
  {
    title: t('is_enabled'),
    key: "enabled",
    render(row) {
      return h(NTag, { type: row.enabled ? 'success' : 'default', size: 'small', bordered: false },
        { default: () => row.enabled ? t('enable') : t('disable') })
    }
  },
  {
    title: t('action'),
    key: 'actions',
    render(row) {
      return h('div', { class: 'sender-actions' }, [
        h(NButton,
          {
            secondary: true,
            size: 'small',
            onClick: () => {
              showModal.value = true;
              curRow.value = row;
              senderEnabled.value = row.enabled ? true : false;
              senderBalance.value = row.balance;
            }
          },
          { default: () => t('modify') }
        ),
        h(NPopconfirm,
          {
            onPositiveClick: async () => {
              await api.fetch(`/admin/address_sender/${row.id}`, { method: 'DELETE' });
              await fetchData();
            }
          },
          {
            trigger: () => h(NButton,
              {
                tertiary: true,
                size: 'small',
                type: "error",
              },
              { default: () => t('delete') }
            ),
            default: () => t('deleteTip')
          }
        ),
      ])
    }
  }
]

watch([page, pageSize], async () => {
  await fetchData()
})


onMounted(async () => {
  await fetchData()
})
</script>

<template>
  <div class="sender-panel">
    <n-modal v-model:show="showModal" preset="dialog" :title="curRow.address">
      <p>{{ t('modalTip') }}</p>
      <n-form-item :show-label="false">
        <n-checkbox v-model:checked="senderEnabled">
          {{ t('enable') }}
        </n-checkbox>
      </n-form-item>
      <n-form-item :show-label="false">
        <n-input-number v-model:value="senderBalance" :min="0" :max="1000" />
      </n-form-item>
      <template #action>
        <n-button :loading="loading" @click="updateData()" size="small" tertiary type="primary">
          {{ t('ok') }}
        </n-button>
      </template>
    </n-modal>
    <form class="sender-search" @submit.prevent="search">
      <n-input-group>
        <n-input v-model:value="addressQuery" :placeholder="t('address')" clearable
          :input-props="{ 'aria-label': t('address') }">
          <template #prefix><n-icon :component="SearchOutlined" /></template>
        </n-input>
        <n-button attr-type="submit" secondary>{{ t('query') }}</n-button>
      </n-input-group>
    </form>
    <n-data-table :columns="columns" :data="data" :bordered="false" :scroll-x="700" />
    <div class="sender-pagination">
      <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" :page-sizes="[20, 50, 100]"
        show-size-picker>
        <template #prefix="{ itemCount }">{{ t('itemCount') }}: {{ itemCount }}</template>
      </n-pagination>
    </div>
  </div>
</template>

<style scoped>
.sender-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.sender-search {
  width: min(100%, 400px);
}

.sender-pagination {
  display: flex;
  justify-content: flex-end;
  overflow-x: auto;
}

.sender-panel :deep(.sender-actions) {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
