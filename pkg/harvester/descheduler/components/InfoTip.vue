<script setup>
// An (i) bubble: the explanation shows on hover, keyboard focus or click, so the page itself stays short.
defineProps({ text: { type: String, required: true } });
</script>

<template>
  <button
    v-clean-tooltip="{ content: text, triggers: ['hover', 'focus', 'click'], popperClass: 'descheduler-info-tip' }"
    type="button"
    class="info-tip"
    :aria-label="text"
  >
    <i
      class="icon icon-info"
      aria-hidden="true"
    />
  </button>
</template>

<style lang="scss" scoped>
.info-tip {
  display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
  margin-left: 8px; padding: 0; border: 0; background: none; color: var(--disabled-text, var(--muted)); font-size: 16px; line-height: 1; cursor: help;
}
.info-tip:hover, .info-tip:focus-visible { color: var(--primary); }
</style>

<style lang="scss">
.descheduler-info-tip .v-popper__inner { max-width: 420px; }
</style>
