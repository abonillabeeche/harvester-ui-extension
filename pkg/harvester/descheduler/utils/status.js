/**
 * Is the descheduler actually running? The policy ConfigMap can outlive a disabled add-on, and a crash-looping pod
 * leaves it unread, so a "would evict" prediction is only meaningful when this is 'running'.
 */
export function runState(addon, deployment) {
  if (!addon) {
    return 'notInstalled';
  }
  if (!addon.spec?.enabled) {
    return 'disabled';
  }

  return (deployment?.status?.readyReplicas ?? 0) > 0 ? 'running' : 'notReady';
}
