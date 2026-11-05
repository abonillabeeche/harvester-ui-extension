<script setup>
import { Banner } from '@components/Banner';
import { useTranslation } from '../utils/i18n';
defineProps({
  title:       { type: String, required: true },
  subtitle:    { type: String, required: true },
  updated:     { type: String, default: '' },
  errors:      { type: Array, default: () => [] },
  showRefresh: { type: Boolean, default: true }
});
defineEmits(['refresh']);
const t = useTranslation();
</script>

<template>
  <div>
    <div class="header">
      <div>
        <h1>{{ title }}</h1>
        <p class="text-muted">
          {{ subtitle }}
        </p>
      </div>
      <div
        v-if="showRefresh"
        class="header-actions"
      >
        <span
          v-if="updated"
          class="text-muted mr-10"
        >{{ t('harvester.descheduler.updated', { time: updated }) }}</span>
        <button
          class="btn role-secondary"
          @click="$emit('refresh')"
        >
          {{ t('harvester.descheduler.refresh') }}
        </button>
      </div>
    </div>
    <Banner
      v-for="msg in errors"
      :key="msg"
      color="error"
      :label="msg"
    />
  </div>
</template>

<style lang="scss" scoped>
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.header-actions { display: flex; align-items: center; }
</style>
