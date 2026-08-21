<template>
  <div class="address-ac">
    <input
      :value="modelValue || ''"
      :class="inputClass"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="open = true"
      @blur="closeLater"
      @keydown.esc="open = false"
    />
    <div v-if="open" class="address-ac-menu">
      <button
        v-for="item in filtered"
        :key="item"
        type="button"
        @mousedown.prevent="pick(item)"
      >
        {{ item }}
      </button>
      <div v-if="!filtered.length" class="address-ac-empty">
        Chưa có gợi ý phù hợp — vẫn có thể nhập tự do
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
  modelValue?: string | null;
  suggestions: string[];
  inputClass?: string;
  placeholder?: string;
}>(), {
  modelValue: '',
  inputClass: '',
  placeholder: '',
});
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const open = ref(false);

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
}
const filtered = computed(() => {
  const query = normalize(props.modelValue || '').trim();
  const unique = [...new Set(props.suggestions.filter(Boolean))];
  return (query ? unique.filter((item) => normalize(item).includes(query)) : unique).slice(0, 12);
});
function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  open.value = true;
}
function pick(value: string) {
  emit('update:modelValue', value);
  open.value = false;
}
function closeLater() {
  window.setTimeout(() => { open.value = false; }, 120);
}
</script>

<style scoped>
.address-ac { position: relative; width: 100%; }
.address-ac > input { width: 100%; }
.address-ac-menu { position: absolute; z-index: 80; top: calc(100% + 4px); left: 0; right: 0; max-height: 240px; overflow-y: auto; padding: 5px; border: 1px solid #d9e1e3; border-radius: 9px; background: #fff; box-shadow: 0 12px 30px rgba(20, 45, 55, .16); }
.address-ac-menu button { width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: #26363d; text-align: left; cursor: pointer; }
.address-ac-menu button:hover { background: #edf7f4; color: #116f62; }
.address-ac-empty { padding: 9px 10px; color: #7b878c; font-size: 12px; line-height: 1.4; }
</style>
