<script setup>
import { computed } from 'vue';
import { Banner } from '@components/Banner';
import WhatIf from '../components/WhatIf.vue';
import PageHeader from '../components/PageHeader.vue';
import { useTranslation } from '../utils/i18n';
import { useData } from '../utils/useData';
import { runState } from '../utils/status';
const t = useTranslation();
// No auto-refresh: the numbers must not move while you are editing values.
const {
  state, rawNodes, rawPods, errors, loading, updated, refresh, dataOk, descheduler
} = useData(0);
const run = computed(() => runState(state.value?.addon || null, state.value?.deployment || null));
</script>

<template>
  <div class="descheduler">
    <PageHeader
      :title="t('harvester.descheduler.whatif.title')"
      :subtitle="t('harvester.descheduler.whatif.subtitle')"
      :updated="updated"
      :errors="errors"
      @refresh="refresh"
    />

    <p v-if="loading">
      {{ t('harvester.descheduler.loading') }}
    </p>

    <template v-else>
      <Banner
        v-if="descheduler && run !== 'running'"
        color="warning"
        :label="t(`harvester.descheduler.run.${ run }`)"
      />

      <WhatIf
        v-if="dataOk"
        :nodes="rawNodes"
        :pods="rawPods"
        :policy="state?.policy || null"
        :policy-raw="state?.policyRaw || null"
        :image="state?.deployment?.spec?.template?.spec?.containers?.[0]?.image || null"
      />
    </template>
  </div>
</template>
