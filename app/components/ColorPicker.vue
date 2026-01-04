<script setup lang="ts">
import { GANTT_COLORS, GANTT_COLOR_MAP, type GanttColor } from '~/types'

const props = defineProps<{
  modelValue: GanttColor
}>()

const emit = defineEmits<{
  'update:modelValue': [value: GanttColor]
}>()

function selectColor(color: GanttColor) {
  emit('update:modelValue', color)
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="color in GANTT_COLORS"
      :key="color"
      @click="selectColor(color)"
      type="button"
      class="w-7 h-7 rounded-full transition-all duration-150 ring-offset-2"
      :class="[
        modelValue === color 
          ? 'ring-2 ring-surface-400 scale-110' 
          : 'hover:scale-110'
      ]"
      :style="{ backgroundColor: GANTT_COLOR_MAP[color] }"
      :title="color"
    />
  </div>
</template>

