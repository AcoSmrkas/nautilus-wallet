<script setup lang="ts">
import { MAINNET } from "@/constants/ergo";

defineProps({
  rootClass: { type: String, required: false, default: "" },
  contentClass: { type: String, required: false, default: "" }
});

const testnet = !MAINNET;
const staging = import.meta.env.MODE === "staging";
const displayName = staging ? "Abyss" : testnet ? "Testnet" : "Mainnet";
const logo = staging
  ? "/icons/app/logo-staging.svg?url"
  : testnet
    ? "/icons/app/logo-testnet.svg?url"
    : "/icons/app/logo-mainnet.svg?url";
</script>

<template>
  <div v-once class="text-center" :class="rootClass">
    <div class="min-h-max" :class="testnet || staging ? '-mb-4' : ''">
      <img :src="logo" class="inline-block min-w-max" :class="contentClass" />
    </div>

    <span
      v-if="staging || testnet"
      class="select-none rounded px-1 py-0 text-xs uppercase"
      :class="{ 'bg-yellow-300 text-gray-700': testnet, 'bg-indigo-600 text-light-100': staging }"
    >
      {{ displayName }}
    </span>
  </div>
</template>
