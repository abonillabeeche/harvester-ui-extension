<script setup>
import { computed } from 'vue';
import { useTranslation } from '../utils/i18n';
const props = defineProps({
  label:  { type: String, required: true },
  pct:    { type: Number, required: true },
  detail: { type: String, required: true },
  low:    { type: Number, default: undefined }, // "underutilized below" marker
  target: { type: Number, default: undefined } // "overutilized above" marker
});
const t = useTranslation();
const width = computed(() => `${ Math.min(Math.max(props.pct, 0), 100) }%`);
const aria = computed(() => [
  `${ props.label } ${ props.pct }%`,
  props.low !== undefined ? t('harvester.descheduler.nodes.markLow', { value: props.low }) : '',
  props.target !== undefined ? t('harvester.descheduler.nodes.markTarget', { value: props.target }) : ''
].filter(Boolean).join('. '));
const level = computed(() => {
  if (props.target !== undefined && props.pct > props.target) {
    return 'over';
  }
  if (props.low !== undefined && props.pct < props.low) {
    return 'under';
  }

  return 'ok';
});
</script>

<template>
  <div class="util">
    <div class="util-head">
      <span class="util-label">{{ label }}</span>
      <span class="util-pct">{{ pct }}%</span>
      <span class="util-detail text-muted">{{ detail }}</span>
    </div>
    <div
      class="util-track"
      role="img"
      :aria-label="aria"
    >
      <div
        class="util-fill"
        :class="level"
        :style="{ width }"
      />
      <div
        v-if="low !== undefined"
        class="util-mark"
        :style="{ left: `${ low }%` }"
        :title="`${ low }%`"
      />
      <div
        v-if="target !== undefined"
        class="util-mark"
        :style="{ left: `${ target }%` }"
        :title="`${ target }%`"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.util { margin-bottom: 12px; }
.util-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin-bottom: 6px; }
.util-label { min-width: 70px; font-weight: bold; }
.util-pct { min-width: 48px; font-size: 18px; font-weight: bold; }
.util-detail { font-size: 14px; }
.util-track { position: relative; height: 14px; background: var(--border); border-radius: 7px; overflow: visible; }
.util-fill { height: 100%; border-radius: 7px; }
.util-fill.ok { background: var(--success); }
.util-fill.under { background: var(--info); }
.util-fill.over { background: var(--warning); }
.util-mark { position: absolute; top: -3px; width: 2px; height: 20px; background: var(--body-text); opacity: 0.7; }
</style>
