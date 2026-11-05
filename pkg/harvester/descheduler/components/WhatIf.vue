<script setup>
import {
  computed, nextTick, onMounted, ref, watch
} from 'vue';
import { useStore } from 'vuex';
import { Banner } from '@components/Banner';
import LabeledSelect from '@shell/components/form/LabeledSelect.vue';
import SortableTable from '@shell/components/SortableTable';
import { useTranslation } from '../utils/i18n';
import { clusterRequest } from '../utils/cluster';
import { simulate } from '../utils/simulate';
import {
  buildManifest, buildPolicyYaml, cleanupCommand, compare, createCommand, isAllowedChoice
} from '../utils/dryrun';
import { loadDryRun, loadNamespaces } from '../utils/api';
import NodeBeforeAfter from './NodeBeforeAfter.vue';
import StepHeader from './StepHeader.vue';
import { routeCounts } from '../utils/moves';
import { simulateRange } from '../utils/range';
import { invalidNamespaces, namespaceOptions, sameSet } from '../utils/namespaces';
import { formatBytes, formatCores } from '../utils/format';
const props = defineProps({
  nodes:     { type: Array, required: true },
  pods:      { type: Array, required: true },
  policy:    { type: Object, default: null },
  policyRaw: { type: String, default: null },
  image:     { type: String, default: null }
});
const t = useTranslation();
const store = useStore();
const form = ref({
  lowCpu: 30, lowMem: 30, targetCpu: 50, targetMem: 50, maxPerNode: 5, nodeFit: true, excluded: []
});

function reset() {
  const lno = props.policy?.lowNodeUtilization;

  form.value = {
    lowCpu:     lno?.thresholds.cpu ?? 30,
    lowMem:     lno?.thresholds.memory ?? 30,
    targetCpu:  lno?.targetThresholds.cpu ?? 50,
    targetMem:  lno?.targetThresholds.memory ?? 50,
    maxPerNode: props.policy?.maxNoOfPodsToEvictPerNode ?? 0,
    nodeFit:    props.policy?.nodeFit ?? true,
    excluded:   [...(props.policy?.evictableNamespacesExclude || [])]
  };
}
// Seed once when the active policy first arrives; never overwrite the user's edits on the 30 s refresh.
let seeded = false;

watch(() => props.policy, (p) => {
  if (p && !seeded) {
    seeded = true;
    reset();
  }
}, { immediate: true });
// Namespaces come from the cluster so a name cannot be mistyped; if the list cannot be loaded, typing new names is allowed (and checked).
const clusterNamespaces = ref([]);
const nsFailed = ref(false);

onMounted(async() => {
  try {
    clusterNamespaces.value = await loadNamespaces(clusterRequest(store));
  } catch (e) {
    nsFailed.value = true;
  }
});
const nsOptions = computed(() => namespaceOptions(clusterNamespaces.value, form.value.excluded));
const excluded = computed(() => form.value.excluded);
const badNamespaces = computed(() => invalidNamespaces(excluded.value));
// The form as the other parts (dry run, apply) see it: the namespaces text turned into a list.
const applyForm = computed(() => ({
  lowCpu:     form.value.lowCpu,
  lowMem:     form.value.lowMem,
  targetCpu:  form.value.targetCpu,
  targetMem:  form.value.targetMem,
  maxPerNode: form.value.maxPerNode,
  nodeFit:    form.value.nodeFit,
  excluded:   excluded.value
}));

// One simulation run for a given set of form values; `order` replays the picks of a real run among VMs of equal priority and QoS.
function simInput(f, order) {
  return {
    thresholds: {
      thresholds:       { cpu: Number(f.lowCpu), memory: Number(f.lowMem) },
      targetThresholds: { cpu: Number(f.targetCpu), memory: Number(f.targetMem) },
      numberOfNodes:    props.policy?.lowNodeUtilization?.numberOfNodes
    },
    options: {
      maxPerNode: Number(f.maxPerNode), nodeFit: f.nodeFit, excluded: f.excluded, order
    }
  };
}

function runSimulation(f, order) {
  const i = simInput(f, order);

  return simulate(props.nodes, props.pods, i.thresholds, i.options);
}
const sim = computed(() => runSimulation(form.value));
// One run is only ONE possible outcome: equal VMs are tried in no particular order. The range says what else can happen.
const range = computed(() => {
  if (!sim.value.evictions.length) {
    return null;
  }
  const i = simInput(form.value);

  return simulateRange(props.nodes, props.pods, i.thresholds, i.options);
});
const varies = computed(() => !!range.value && range.value.max > range.value.min);
const thresholds = computed(() => ({
  thresholds:       { cpu: Number(form.value.lowCpu), memory: Number(form.value.lowMem) },
  targetThresholds: { cpu: Number(form.value.targetCpu), memory: Number(form.value.targetMem) }
}));
const cards = computed(() => sim.value.before.map((b) => ({
  before: b,
  after:  sim.value.after.find((a) => a.name === b.name) || b,
  out:    sim.value.evictions.filter((e) => e.from === b.name),
  inn:    sim.value.evictions.filter((e) => e.to === b.name)
})));
const changed = computed(() => {
  const lno = props.policy?.lowNodeUtilization;
  const f = form.value;

  return !lno || lno.thresholds.cpu !== Number(f.lowCpu) || lno.thresholds.memory !== Number(f.lowMem) ||
        lno.targetThresholds.cpu !== Number(f.targetCpu) || lno.targetThresholds.memory !== Number(f.targetMem) ||
        !sameSet(excluded.value, props.policy?.evictableNamespacesExclude || []);
});
const color = computed(() => {
  if (sim.value.reason === 'invalidThresholds') {
    return 'error';
  }

  return sim.value.evictions.length ? 'warning' : 'info';
});
const summary = computed(() => {
  if (!sim.value.evictions.length) {
    return t(`harvester.descheduler.whatif.result.${ sim.value.reason }`);
  }
  if (range.value && varies.value) {
    return t(`harvester.descheduler.whatif.result.${ range.value.exact ? 'range' : 'rangeApprox' }`, { min: range.value.min, max: range.value.max });
  }

  return t('harvester.descheduler.whatif.result.moves', { count: sim.value.evictions.length });
});
// The moves as table rows. A cluster can send many VMs at once, so they go in a sortable, searchable, paged table.
const evictionRows = computed(() => sim.value.evictions.map((e) => ({
  _key:   e.pod,
  vm:     `${ e.namespace }/${ e.vm }`,
  from:   e.from,
  to:     e.to || '?',
  cpu:    e.requests.cpu,
  memory: e.requests.memory,
  size:   `${ formatCores(e.requests.cpu) }, ${ formatBytes(e.requests.memory) }`
})));
const evictionHeaders = [
  {
    name: 'vm', labelKey: 'harvester.descheduler.whatif.vm', value: 'vm', sort: ['vm']
  },
  {
    name: 'from', labelKey: 'harvester.descheduler.whatif.from', value: 'from', sort: ['from', 'vm'], width: 180
  },
  {
    name: 'to', labelKey: 'harvester.descheduler.whatif.to', value: 'to', sort: ['to', 'vm'], width: 180
  },
  {
    name: 'size', labelKey: 'harvester.descheduler.whatif.size', value: 'size', sort: ['cpu', 'memory'], width: 220
  }
];
const routes = computed(() => routeCounts(sim.value.evictions));
const possible = computed(() => Object.entries(range.value?.possible || {}).map(([node, names]) => ({
  node,
  count:     names.length,
  always:    names.filter((n) => range.value?.certain.includes(n)),
  sometimes: names.filter((n) => !range.value?.certain.includes(n))
})));
const skippedText = (s) => `${ s.vm }: ${ t(`harvester.descheduler.whatif.why.${ s.why }`) }`;
// --- verify with the real descheduler (a dry-run Job that the user applies; this page never writes) ---
const generated = ref(null);
const generatedForm = ref(null);
const verifyError = ref('');
const dryRun = ref(null);
const checked = ref(false);
const comparison = ref(null);
const copied = ref('');
const runStep = ref(null);
const sameResult = computed(() => !!comparison.value && !comparison.value.onlySimulated.length && !comparison.value.onlyReal.length);
const verdictColor = computed(() => (sameResult.value ? 'success' : comparison.value?.allowed ? 'info' : 'warning'));
const verdictLabel = computed(() => t(`harvester.descheduler.verify.${ sameResult.value ? 'same' : comparison.value?.allowed ? 'allowed' : 'differs' }`, { count: dryRun.value?.evictions.length ?? 0 }));

function generate() {
  verifyError.value = '';
  dryRun.value = null;
  checked.value = false;
  comparison.value = null;
  try {
    if (!props.policyRaw || !props.image) {
      throw new Error(t('harvester.descheduler.verify.missing'));
    }
    const manifest = buildManifest(buildPolicyYaml(props.policyRaw, { ...applyForm.value }), props.image);
    // The simulation is kept as it was when the Job was generated, so the comparison and the replay use the same values and cluster state.
    const snapshot = { ...form.value, excluded: [...form.value.excluded] };

    generated.value = {
      name:      manifest.name,
      yaml:      manifest.yaml,
      commands:  createCommand(manifest.yaml),
      simulated: sim.value.evictions,
      replay:    (order) => runSimulation(snapshot, order).evictions
    };
    generatedForm.value = { ...form.value };
    // The result appears below the button, often off screen: bring it into view.
    nextTick(() => runStep.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
  } catch (e) {
    verifyError.value = e?.message || String(e);
  }
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
  } catch (e) {
    copied.value = '';
  }
}

async function check() {
  verifyError.value = '';
  try {
    dryRun.value = await loadDryRun(clusterRequest(store), generated.value?.name);
    checked.value = true;
    comparison.value = dryRun.value?.ranCycle ? compare(generated.value?.simulated ?? sim.value.evictions, dryRun.value.evictions) : null;
    if (comparison.value && generated.value && (comparison.value.onlyReal.length || comparison.value.onlySimulated.length)) {
      comparison.value.allowed = isAllowedChoice(generated.value.replay(dryRun.value?.evictions.map((e) => e.pod) || []), dryRun.value?.evictions || []);
    }
  } catch (e) {
    verifyError.value = t('harvester.descheduler.error', { what: 'dry run', message: e?.message || e?._statusText || String(e) });
  }
}
</script>

<template>
  <div class="steps">
    <section
      class="step"
      aria-labelledby="wi-step1"
    >
      <StepHeader
        id="wi-step1"
        :step="1"
        :title="t('harvester.descheduler.steps.settings')"
        :hint="t('harvester.descheduler.whatif.note')"
      />

      <div class="form">
        <label>{{ t('harvester.descheduler.policy.low') }} CPU %<input
          v-model.number="form.lowCpu"
          type="number"
          min="0"
          max="100"
        ></label>
        <label>{{ t('harvester.descheduler.policy.low') }} {{ t('harvester.descheduler.nodes.memory') }} %<input
          v-model.number="form.lowMem"
          type="number"
          min="0"
          max="100"
        ></label>
        <label>{{ t('harvester.descheduler.policy.target') }} CPU %<input
          v-model.number="form.targetCpu"
          type="number"
          min="0"
          max="100"
        ></label>
        <label>{{ t('harvester.descheduler.policy.target') }} {{ t('harvester.descheduler.nodes.memory') }} %<input
          v-model.number="form.targetMem"
          type="number"
          min="0"
          max="100"
        ></label>
        <label>{{ t('harvester.descheduler.policy.maxEvict') }}<input
          v-model.number="form.maxPerNode"
          type="number"
          min="0"
        ></label>
        <label class="check"><input
          v-model="form.nodeFit"
          type="checkbox"
        > {{ t('harvester.descheduler.policy.nodeFit') }}</label>
        <div class="ns">
          <LabeledSelect
            v-model:value="form.excluded"
            :label="t('harvester.descheduler.whatif.excluded')"
            :options="nsOptions"
            :multiple="true"
            :taggable="nsFailed"
            :searchable="true"
            :close-on-select="false"
            :loading="!nsFailed && !clusterNamespaces.length"
          />
        </div>
      </div>
      <Banner
        v-if="badNamespaces.length"
        color="error"
        :label="t('harvester.descheduler.whatif.badNamespaces', { list: badNamespaces.join(', ') })"
      />
      <div class="form-foot">
        <button
          class="btn role-secondary"
          :disabled="!policy"
          @click="reset"
        >
          {{ t('harvester.descheduler.whatif.reset') }}
        </button>
        <span
          v-if="changed"
          class="text-muted"
        >{{ t('harvester.descheduler.whatif.changed') }}</span>
      </div>
    </section>

    <section
      class="step"
      aria-labelledby="wi-step2"
    >
      <StepHeader
        id="wi-step2"
        :step="2"
        :title="t('harvester.descheduler.steps.move')"
        :hint="t('harvester.descheduler.steps.moveHint')"
      />

      <div
        role="status"
        aria-live="polite"
        class="result"
      >
        <Banner
          :color="color"
          :label="summary"
        />
      </div>
      <ul
        v-if="routes.length"
        class="routes"
        :aria-label="t('harvester.descheduler.whatif.routesLabel')"
      >
        <li
          v-for="r in routes"
          :key="`${ r.from }-${ r.to }`"
          class="route"
        >
          {{ t('harvester.descheduler.whatif.route', { from: r.from, to: r.to, count: r.count }) }}
        </li>
      </ul>

      <h3 class="sub-title">
        {{ t('harvester.descheduler.whatif.nodes.title') }}
      </h3>
      <p class="text-muted">
        {{ t('harvester.descheduler.whatif.nodes.note') }}
      </p>
      <div class="node-grid">
        <NodeBeforeAfter
          v-for="c in cards"
          :key="c.before.name"
          :before="c.before"
          :after="c.after"
          :thresholds="thresholds"
          :out="c.out"
          :inn="c.inn"
        />
      </div>

      <SortableTable
        v-if="evictionRows.length"
        class="evictions"
        :rows="evictionRows"
        :headers="evictionHeaders"
        key-field="_key"
        :search="evictionRows.length > 10"
        :table-actions="false"
        :row-actions="false"
        :groupable="false"
        :paging="true"
        :rows-per-page="10"
      >
        <template #header-left>
          <h3 class="sub-title">
            {{ t(varies ? 'harvester.descheduler.whatif.exampleTitle' : 'harvester.descheduler.whatif.movesTitle', { count: evictionRows.length }) }}
          </h3>
        </template>
      </SortableTable>
      <p
        v-if="evictionRows.length"
        class="text-muted"
      >
        {{ t('harvester.descheduler.whatif.tieNote') }}
      </p>

      <details
        v-for="p in possible"
        :key="p.node"
        class="fold"
      >
        <summary>{{ t('harvester.descheduler.whatif.possibleSummary', { node: p.node, count: p.count }) }}</summary>
        <p v-if="p.always.length">
          {{ t('harvester.descheduler.whatif.always', { list: p.always.join(', ') }) }}
        </p>
        <p v-if="p.sometimes.length">
          {{ t('harvester.descheduler.whatif.sometimes', { list: p.sometimes.join(', ') }) }}
        </p>
      </details>
      <details
        v-if="sim.skipped.length"
        class="fold"
      >
        <summary>{{ t('harvester.descheduler.whatif.skippedSummary', { count: sim.skipped.length }) }}</summary>
        <ul>
          <li
            v-for="sk in sim.skipped"
            :key="sk.vm"
          >
            {{ skippedText(sk) }}
          </li>
        </ul>
      </details>
    </section>

    <section
      class="step verify"
      aria-labelledby="wi-step3"
    >
      <StepHeader
        id="wi-step3"
        :step="3"
        :title="t('harvester.descheduler.verify.title')"
        :hint="t('harvester.descheduler.verify.note')"
      />

      <ol class="substeps">
        <li>
          <h3 class="sub-title">
            {{ t('harvester.descheduler.verify.step.generate') }}
          </h3>
          <button
            class="btn role-primary"
            :disabled="sim.reason === 'invalidThresholds'"
            @click="generate"
          >
            {{ t('harvester.descheduler.verify.generate') }}
          </button>
          <p
            v-if="generated && !verifyError"
            class="text-muted generated-note"
            role="status"
          >
            {{ t('harvester.descheduler.verify.generated', { name: generated.name }) }}
          </p>
          <Banner
            v-if="verifyError"
            color="error"
            :label="verifyError"
          />
        </li>

        <li
          ref="runStep"
          :class="{ pending: !generated }"
        >
          <h3 class="sub-title">
            {{ t('harvester.descheduler.verify.step.run') }}
          </h3>
          <template v-if="generated">
            <details
              class="manual"
              open
            >
              <summary>{{ t('harvester.descheduler.verify.manual') }}</summary>
              <p class="text-muted">
                {{ t('harvester.descheduler.verify.run', { name: generated.name }) }}
              </p>
              <pre tabindex="0">{{ generated.commands }}</pre>
              <button
                class="btn role-secondary"
                @click="copy(generated.commands, 'create')"
              >
                {{ t('harvester.descheduler.verify.copy') }}
              </button>
              <span
                v-if="copied"
                class="text-muted ml-10"
                role="status"
              >{{ t('harvester.descheduler.verify.copied') }}</span>
            </details>
          </template>
          <p
            v-else
            class="text-muted"
          >
            {{ t('harvester.descheduler.verify.runFirst') }}
          </p>
        </li>

        <li>
          <h3 class="sub-title">
            {{ t('harvester.descheduler.verify.step.check') }}
          </h3>
          <div class="check">
            <button
              class="btn role-secondary"
              @click="check"
            >
              {{ t('harvester.descheduler.verify.check') }}
            </button>
            <span
              v-if="!generated"
              class="text-muted ml-10"
            >{{ t('harvester.descheduler.verify.checkLatest') }}</span>
          </div>

          <div aria-live="polite">
            <template v-if="checked || dryRun">
              <Banner
                v-if="checked && !dryRun"
                color="info"
                :label="t('harvester.descheduler.verify.notFound')"
              />
              <template v-if="dryRun">
                <p class="text-muted">
                  {{ t('harvester.descheduler.verify.status', { pod: dryRun.pod, phase: dryRun.phase }) }}
                </p>
                <Banner
                  v-if="dryRun.failure"
                  color="error"
                  :label="t('harvester.descheduler.verify.failed', { message: dryRun.failure })"
                />
                <Banner
                  v-else-if="!dryRun.ranCycle"
                  color="info"
                  :label="t('harvester.descheduler.verify.notDone')"
                />
                <template v-if="dryRun.ranCycle">
                  <Banner
                    :color="verdictColor"
                    :label="verdictLabel"
                  />
                  <ul
                    v-if="comparison"
                    class="compare"
                  >
                    <li
                      v-for="p in comparison.agree"
                      :key="'a' + p"
                    >
                      {{ p }}: {{ t('harvester.descheduler.verify.both') }}
                    </li>
                    <li
                      v-for="p in comparison.onlyReal"
                      :key="'r' + p"
                    >
                      {{ p }}: {{ t('harvester.descheduler.verify.onlyReal') }}
                    </li>
                    <li
                      v-for="p in comparison.onlySimulated"
                      :key="'s' + p"
                    >
                      {{ p }}: {{ t('harvester.descheduler.verify.onlySim') }}
                    </li>
                  </ul>
                </template>
              </template>
            </template>
          </div>
        </li>
      </ol>
      <p
        v-if="generated || dryRun"
        class="text-muted"
      >
        {{ t('harvester.descheduler.verify.cleanup') }} <code>{{ cleanupCommand() }}</code>
      </p>
    </section>

    <p class="text-muted caveat">
      {{ t('harvester.descheduler.whatif.caveat') }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.steps { display: flex; flex-direction: column; gap: var(--gap-lg, 24px); margin-top: 16px; }
.step { border: var(--border-width) solid var(--border); border-radius: var(--border-radius); padding: 24px; background: var(--box-bg); }
.step p { margin: 0 0 8px; }
.sub-title { margin: 16px 0 8px; font-size: 18px; }

.form { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; align-items: end; }
.form label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--input-label, var(--muted)); }
.form label.check { flex-direction: row; align-items: center; gap: 8px; padding-bottom: 8px; }
.form input[type=number] { width: 100%; }
.form .ns { grid-column: 1 / -1; }
.form-foot { display: flex; align-items: center; gap: 16px; margin-top: 16px; }

.result :deep(.banner) { font-size: 16px; }
.routes { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 12px 0 0; }
.route { padding: 4px 12px; border: var(--border-width) solid var(--border); border-radius: 14px; font-size: 14px; }
.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; margin: 8px 0 16px; }
.evictions { margin-top: 8px; }
.fold { margin-top: 12px; }
.fold summary, .manual summary { cursor: pointer; }
.manual { margin-top: 12px; }
.generated-note { margin: 8px 0 0; }
.fold p, .fold ul { margin: 8px 0 0; }

.substeps { list-style: none; padding: 0; margin: 0; counter-reset: sub; }
.substeps > li { position: relative; padding: 0 0 8px 44px; counter-increment: sub; }
.substeps > li::before {
  content: counter(sub, lower-alpha); position: absolute; left: 0; top: 14px; width: 28px; height: 28px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; border: 2px solid var(--primary); border-radius: 50%; font-weight: bold;
}
.substeps > li.pending > .sub-title { color: var(--muted); }
.verify pre { max-height: 260px; overflow: auto; padding: 12px; background: var(--body-bg); border: var(--border-width) solid var(--border); }
.compare { margin: 8px 0 0; }
.caveat { font-size: 14px; }
</style>
