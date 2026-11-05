import { DRYRUN_LABEL, parseDryRunFailure, parseDryRunLog } from './dryrun';
import { activity, historyRows, parseCycles } from './history';
import { parseYaml, summarisePolicy } from './policy';
async function maybe(request, url) {
  try {
    return await request({ url });
  } catch (e) {
    if (e?._status === 404 || e?.status === 404) {
      return null;
    }
    throw e;
  }
}
export async function loadNodes(request) {
  return (await request({ url: '/v1/nodes' }))?.data || [];
}
export async function loadNamespaces(request) {
  const items = (await request({ url: '/k8s/clusters/local/api/v1/namespaces' }))?.items || [];

  return items.map((n) => n?.metadata?.name).filter(Boolean);
}
export async function loadPods(request) {
  // managedFields is large and unused
  return (await request({ url: '/v1/pods?exclude=metadata.managedFields' }))?.data || [];
}
export async function loadDescheduler(request) {
  const [addon, deployment, cm] = await Promise.all([
    maybe(request, '/v1/harvesterhci.io.addons/kube-system/descheduler'),
    maybe(request, '/v1/apps.deployments/kube-system/descheduler'),
    maybe(request, '/v1/configmaps/kube-system/descheduler')
  ]);
  const policyRaw = cm?.data?.['policy.yaml'] || null;
  let policy = null;
  let policyError = null;

  // A bad policy must not hide the add-on and deployment state.
  if (policyRaw) {
    try {
      policy = summarisePolicy(parseYaml(policyRaw));
    } catch (e) {
      policyError = e?.message || String(e);
    }
  }

  return {
    addon, deployment, policyRaw, policy, policyError
  };
}
const HOUR = 3600000;

/**
 * Migrations (KubeVirt prunes old ones, so this is only the retained history) plus the descheduler's own log, which is
 * what lets us say whether a node evacuation was really a drain. The log is fetched from just before the oldest
 * migration (or the last 24 h when there are none), to keep the download small.
 */
export async function loadHistory(request, pods) {
  const res = await request({ url: '/v1/kubevirt.io.virtualmachineinstancemigrations' });
  const vmims = res?.data || [];
  const oldest = vmims.reduce((min, m) => Math.min(min, Date.parse(m.metadata?.creationTimestamp)), Date.now());
  const since = new Date(Math.min(oldest - HOUR, Date.now() - 24 * HOUR)).toISOString();
  let cycles = [];
  let logError = null;
  const pod = pods.find((p) => p?.metadata?.namespace === 'kube-system' && /^descheduler-/.test(p?.metadata?.name || ''));

  if (!pod) {
    logError = 'descheduler pod not found';
  } else {
    try {
      const log = await request({ url: `/k8s/clusters/local/api/v1/namespaces/kube-system/pods/${ pod.metadata.name }/log?sinceTime=${ encodeURIComponent(since) }` });

      cycles = parseCycles(typeof log === 'string' ? log : (log?.data || ''));
    } catch (e) {
      logError = e?.message || e?._statusText || String(e);
    }
  }

  return {
    rows: historyRows(vmims, cycles), activity: activity(cycles), logError
  };
}
/** Finds the dry-run pod the user created (the one whose name starts with `prefix`, else the newest) and parses its log. */
export async function loadDryRun(request, prefix) {
  const res = await request({ url: '/v1/pods?exclude=metadata.managedFields' });
  const mine = (res?.data || [])
    .filter((p) => p?.metadata?.namespace === 'kube-system' && p?.metadata?.labels?.['app.kubernetes.io/name'] === DRYRUN_LABEL)
    .filter((p) => !prefix || p.metadata.name.startsWith(prefix))
    .sort((a, b) => Date.parse(b.metadata.creationTimestamp) - Date.parse(a.metadata.creationTimestamp));
  const pod = mine[0];

  if (!pod) {
    return null;
  }
  let log = '';

  try {
    const r = await request({ url: `/k8s/clusters/local/api/v1/namespaces/kube-system/pods/${ pod.metadata.name }/log` });

    log = typeof r === 'string' ? r : (r?.data || '');
  } catch (e) {
    log = ''; // still pending/creating: report the phase only
  }
  const phase = pod.status?.phase || 'Pending';

  return {
    pod:       pod.metadata.name,
    phase,
    finished:  phase === 'Succeeded' || phase === 'Failed',
    ranCycle:  log.includes('Total number of evictions/requests'),
    evictions: parseDryRunLog(log),
    failure:   parseDryRunFailure(log)
  };
}
const ADDON_URL = '/v1/harvesterhci.io.addons/kube-system/descheduler';

/** The live descheduler Addon (null when not installed). Used by the editor, which always works from a fresh copy. */
export async function loadAddon(request) {
  return maybe(request, ADDON_URL);
}
/**
 * The only write this extension makes to the cluster: replace the descheduler Addon (its valuesContent and our revert
 * annotation). The object comes from `planSave`/`planRevert`, which carry the resourceVersion, so a concurrent change is rejected
 * by the API server instead of overwritten.
 */
