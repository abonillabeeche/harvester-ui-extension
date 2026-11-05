<script setup>
defineProps({
  id:    { type: String, required: true },
  step:  { type: Number, required: true },
  title: { type: String, required: true },
  hint:  { type: String, default: '' }
});
</script>

<template>
  <div class="step-head">
    <h2
      :id="id"
      class="step-title"
    >
      <span class="step-no">{{ step }}</span>
      {{ title }}
    </h2>
    <p
      v-if="hint"
      class="step-hint text-muted"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.step-head { margin-bottom: 16px; }
.step-title { display: flex; align-items: center; gap: 12px; margin: 0; }
.step-no {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--primary); color: var(--primary-text); font-size: 18px; font-weight: bold;
}
.step-hint { margin: 8px 0 0 44px; font-size: 14px; }
</style>
