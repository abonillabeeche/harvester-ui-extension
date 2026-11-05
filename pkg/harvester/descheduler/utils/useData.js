import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { useTranslation } from './i18n';
import { clusterRequest } from './cluster';
import { loadDescheduler, loadNodes, loadPods } from './api';
import { nodeUsage } from './utilization';
/**
 * The cluster data every page needs (nodes, pods, the add-on and its policy), loaded through the dashboard session.
 * `autoRefreshMs` > 0 reloads on a timer (the overview); the Simulator page passes 0 so numbers do not move under an edit.
 */
export function useData(autoRefreshMs = 0) {
  const store = useStore();
  const t = useTranslation();
  const request = clusterRequest(store);
  const state = ref(null);
  const usages = ref([]);
  const rawNodes = ref([]);
  const rawPods = ref([]);
  const errors = ref([]);
  const failed = ref([]); // which sources could not be loaded: nodes, pods, descheduler
  const loading = ref(true);
  const updated = ref('');
  let timer;

  async function refresh() {
    const errs = [];
    const bad = [];
    const guard = async(what, fn, fallback) => {
      try {
        return await fn();
      } catch (e) {
        bad.push(what);
        errs.push(t('harvester.descheduler.error', { what, message: e?.message || e?._statusText || String(e) }));

        return fallback;
      }
    };
    const [nodes, pods, desched] = await Promise.all([
      guard('nodes', () => loadNodes(request), []),
      guard('pods', () => loadPods(request), []),
      guard('descheduler', () => loadDescheduler(request), null)
    ]);

    rawNodes.value = nodes;
    rawPods.value = pods;
    usages.value = nodes.map((n) => nodeUsage(n, pods)).sort((a, b) => a.name.localeCompare(b.name));
    state.value = desched;
    errors.value = errs;
    failed.value = bad;
    updated.value = new Date().toLocaleTimeString();
    loading.value = false;
  }
  onMounted(() => {
    refresh();
    if (autoRefreshMs > 0) {
      timer = setInterval(refresh, autoRefreshMs);
    }
  });
  onBeforeUnmount(() => timer && clearInterval(timer));
  // Without nodes and pods there is nothing to measure; showing 0% bars or a verdict would be a lie.
  const dataOk = computed(() => !failed.value.includes('nodes') && !failed.value.includes('pods'));
  const descheduler = computed(() => !failed.value.includes('descheduler'));

  return {
    state, usages, rawNodes, rawPods, errors, failed, loading, updated, refresh, dataOk, descheduler, request
  };
}
