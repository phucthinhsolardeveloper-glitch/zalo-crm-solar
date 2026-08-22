<template>
  <div ref="rootEl" class="address-ac">
    <input
      :value="modelValue || ''"
      :class="['address-ac-input', inputClass]"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      @input="onInput"
      @focus="openMenu"
      @blur="closeLater"
      @keydown.esc="open = false"
    />
    <span class="address-ac-chevron" aria-hidden="true"></span>
    <Teleport to="body">
      <div v-if="open && !disabled" class="address-ac-menu" :style="menuStyle">
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { normalizeAddressSearch } from './address-suggestion-utils';

const props = withDefaults(defineProps<{
  modelValue?: string | null;
  suggestions: string[];
  inputClass?: string;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  modelValue: '',
  inputClass: '',
  placeholder: '',
  disabled: false,
});
const emit = defineEmits<{
  'update:modelValue': [value: string];
  select: [value: string];
}>();
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

function updateMenuPosition() {
  const rect = rootEl.value?.getBoundingClientRect();
  if (!rect) return;
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  };
}
function openMenu() {
  if (props.disabled) return;
  open.value = true;
  void nextTick(updateMenuPosition);
}

const filtered = computed(() => {
  const query = normalizeAddressSearch(props.modelValue || '');
  const unique = [...new Set(props.suggestions.filter(Boolean))];
  return (query ? unique.filter((item) => normalizeAddressSearch(item).includes(query)) : unique).slice(0, 12);
});
function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  openMenu();
}
function pick(value: string) {
  emit('update:modelValue', value);
  emit('select', value);
  open.value = false;
}
function closeLater() {
  window.setTimeout(() => { open.value = false; }, 120);
}
onMounted(() => {
  window.addEventListener('resize', updateMenuPosition);
  window.addEventListener('scroll', updateMenuPosition, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMenuPosition);
  window.removeEventListener('scroll', updateMenuPosition, true);
});
</script>

<style scoped>
.address-ac { position: relative; width: 100%; }
.address-ac > input { width: 100%; }
.address-ac-input { box-sizing: border-box; height: 36px; padding: 0 34px 0 11px !important; border: 1px solid #d6dde1; border-radius: 7px; outline: none; background: #fff; color: #26363d; font: inherit; transition: border-color .15s, box-shadow .15s; }
.address-ac-input:hover { border-color: #aebbc1; }
.address-ac-input:focus { border-color: #168778; box-shadow: 0 0 0 3px rgba(22, 135, 120, .12); }
.address-ac-input:disabled { color: #8b959a; background: #f3f5f6 !important; cursor: not-allowed; }
.address-ac-chevron { position: absolute; top: 50%; right: 13px; width: 7px; height: 7px; border-right: 2px solid #758289; border-bottom: 2px solid #758289; transform: translateY(-70%) rotate(45deg); pointer-events: none; transition: transform .15s; }
.address-ac:focus-within .address-ac-chevron { border-color: #116f62; transform: translateY(-25%) rotate(225deg); }
.address-ac-menu { z-index: 10000; max-height: min(260px, 45vh); overflow-y: auto; padding: 5px; border: 1px solid #d9e1e3; border-radius: 9px; background: #fff; box-shadow: 0 12px 30px rgba(20, 45, 55, .18); box-sizing: border-box; }
.address-ac-menu button { width: 100%; min-height: 36px; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: #26363d; text-align: left; cursor: pointer; }
.address-ac-menu button:hover { background: #edf7f4; color: #116f62; }
.address-ac-empty { padding: 9px 10px; color: #7b878c; font-size: 12px; line-height: 1.4; }
</style>
