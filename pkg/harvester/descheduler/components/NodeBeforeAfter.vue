<script setup>
import { computed } from 'vue';
import BeforeAfterBar from './BeforeAfterBar.vue';
import { useTranslation } from '../utils/i18n';
import { classify } from '../utils/utilization';
import { head } from '../utils/moves';
import { formatBytes, formatCores } from '../utils/format';
const props = defineProps({
  before:     { type: Object, required: true },
  after:      { type: Object, required: true },
  thresholds: { type: Object, required: true },
  out:        { type: Array, required: true },
  inn:        { type: Array, required: true }
});
const t = useTranslation();
const bandBefore = computed(() => classify(props.before, props.thresholds));
const bandAfter = computed(() => classify(props.after, props.thresholds));
// A node can send or receive many VMs; the full list is in the table below, so the card only shows the first few.
const SHOWN = 3;
const outHead = computed(() => head(props.out, SHOWN));
const inHead = computed(() => head(props.inn, SHOWN));
const changed = computed(() => props.out.length > 0 || props.inn.length > 0);
const size = (e) => `${ formatCores(e.requests.cpu) }, ${ formatBytes(e.requests.memory) }`;
const detail = (u, kind) => (kind === 'cpu' ? t('harvester.descheduler.nodes.detail', { used: formatCores(u.requests.cpu), total: formatCores(u.allocatable.cpu) }) : t('harvester.descheduler.nodes.detail', { used: formatBytes(u.requests.memory), total: formatBytes(u.allocatable.memory) }));
</script>

<template>
  <section
    class="card"
    :aria-label="before.name"
  >
    <div class="node-head">
      <h3>{{ before.name }}</h3>
      <span class="bands">
        <span
          class="band"
          :class="bandBefore"
        >{{ t(`harvester.descheduler.nodes.band.${ bandBefore }`) }}</span>
        <template v-if="bandBefore !== bandAfter">
          <span class="arrow">→</span>
          <span
            class="band"
            :class="bandAfter"
          >{{ t(`harvester.descheduler.nodes.band.${ bandAfter }`) }}</span>
        </template>
      </span>
    </div>

    <BeforeAfterBar
      :label="t('harvester.descheduler.nodes.cpu')"
      :before="before.cpuPct"
      :after="after.cpuPct"
      :low="thresholds.thresholds.cpu"
      :target="thresholds.targetThresholds.cpu"
      :detail="detail(after, 'cpu')"
    />
    <BeforeAfterBar
      :label="t('harvester.descheduler.nodes.memory')"
      :before="before.memoryPct"
      :after="after.memoryPct"
      :low="thresholds.thresholds.memory"
      :target="thresholds.targetThresholds.memory"
      :detail="detail(after, 'memory')"
    />

    <p class="text-muted pods">
      {{ t('harvester.descheduler.nodes.podsCount', { count: after.pods }) }}<template v-if="before.pods !== after.pods">
        ({{ t('harvester.descheduler.simulator.podsWas', { count: before.pods }) }})
      </template>
    </p>
    <ul
      v-if="changed"
      class="moves"
    >
      <li
        v-for="e in outHead.shown"
        :key="`o${ e.pod }`"
        class="out"
      >
        − {{ e.vm }} <span class="text-muted">→ {{ e.to || '?' }} ({{ size(e) }})</span>
      </li>
      <li
        v-if="outHead.more"
        class="out text-muted"
      >
        − {{ t('harvester.descheduler.simulator.more', { count: outHead.more }) }}
      </li>
      <li
        v-for="e in inHead.shown"
        :key="`i${ e.pod }`"
        class="in"
      >
        + {{ e.vm }} <span class="text-muted">← {{ e.from }} ({{ size(e) }})</span>
      </li>
      <li
        v-if="inHead.more"
        class="in text-muted"
      >
        + {{ t('harvester.descheduler.simulator.more', { count: inHead.more }) }}
      </li>
    </ul>
    <p
      v-else
      class="text-muted"
    >
      {{ t('harvester.descheduler.simulator.noChange') }}
    </p>
  </section>
</template>

<style lang="scss" scoped>
.card { border: var(--border-width) solid var(--border); border-radius: var(--border-radius); padding: 16px; background: var(--box-bg); }
.node-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.node-head h3 { margin: 0; }
.bands { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
.band { padding: 2px 10px; border-radius: 10px; font-size: 14px; white-space: nowrap; }
.band.under { background: var(--info); color: var(--info-text); }
.band.appropriate { background: var(--success); color: var(--success-text); }
.band.over { background: var(--warning); color: var(--warning-text); }
.pods { margin: 0 0 4px; }
.moves { list-style: none; padding: 0; margin: 8px 0 0; }
.moves .out { color: var(--muted); }
.moves .in { color: var(--link); }
</style>
