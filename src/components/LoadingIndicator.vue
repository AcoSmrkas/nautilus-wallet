<template>
  <pulse-loader v-if="type === 'pulse'" :class="class" class="inline-block stroke-current" />
  <circular-loader v-else :class="class" class="inline-block stroke-current" />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import PulseLoader from "@/assets/images/loaders/pulse.svg";
import CircularLoader from "@/assets/images/loaders/circular.svg";

export default defineComponent({
  name: "LoadingIndicator",
  components: {
    PulseLoader,
    CircularLoader
  },
  props: {
    class: { type: String, require: false },
    type: {
      type: String as PropType<"pulse" | "circular">,
      default: "pulse",
      validator(value: string) {
        return ["pulse", "circular"].includes(value);
      }
    }
  }
});
</script>
