<template>
  <div
    class="shadow-scroll -mx-4 flex flex-grow flex-col gap-4 overflow-auto px-4 py-1 text-sm leading-relaxed"
  >
    <template v-if="!transaction">
      <tx-box-details v-for="i in 3" :key="i" loading />
    </template>

    <template v-else>
      <tx-sign-summary v-if="tx" :tx="tx" />

      <div class="flex items-center pt-2">
        <div class="mx-2 flex-grow border-t border-gray-300"></div>
        <span class="flex-shrink text-xs text-gray-400">Transaction details</span>
        <div class="mx-2 flex-grow border-t border-gray-300"></div>
      </div>

      <tx-box-details
        v-for="(output, index) in tx?.sending"
        :key="index"
        :assets="output.assets"
        :babel-swap="output.isBabelBoxSwap"
        :type="output.isIntrawallet ? 'info' : 'default'"
      >
        <p>
          {{ getOutputTitle(output) }}
        </p>
        <template v-if="!output.isBabelBoxSwap" #subheader>
          <div class="flex flex-col gap-2 break-all font-mono text-sm">
            <p>
              {{ format.string.shorten(output.receiver, 60) }}
              <click-to-copy :content="output.receiver" :size="11" />
            </p>
            <p v-if="isLedger && isP2S(output)">
              <span class="font-sans font-semibold">Script Hash:</span>
              {{ format.string.shorten(output.scriptHash, 20) }}
            </p>
          </div>
        </template>
      </tx-box-details>
      <tx-box-details v-if="tx?.fee" :assets="tx.fee.assets">
        <p>Network fee</p>
      </tx-box-details>
      <div v-if="devMode && tx" class="block rounded bg-gray-700 px-2 py-2 shadow-sm">
        <vue-json-pretty
          class="!font-mono !text-xs text-white"
          :highlight-selected-node="false"
          :show-double-quotes="true"
          :show-length="true"
          :collapse-path="/(extension|tokens|assets|additionalRegisters)$/"
          :show-line="false"
          :deep="1"
          :data="tx?.rawTx"
        ></vue-json-pretty>
      </div>
    </template>
  </div>

  <div>
    <label
      v-if="tx?.burning"
      class="mb-2 inline-flex w-full cursor-pointer items-center rounded border border-red-300 bg-red-100 px-3 py-1 font-normal"
    >
      <input v-model="burnAgreement" class="checkbox" type="checkbox" />
      <span class="text-red-900">I understand that I'm burning token(s).</span>
    </label>

    <template v-if="!isLedger">
      <p v-if="isReadonly" class="text-center text-sm">
        <triangle-alert-icon class="inline align-middle text-yellow-500" :size="20" />
        <span class="align-middle"> This wallet cannot sign transactions.</span>
      </p>
      <div v-else class="text-left">
        <form :disabled="!canSign || isMnemonicSigning" @submit.prevent="sign()">
          <input
            v-model="password"
            placeholder="Spending password"
            type="password"
            :disabled="!canSign || isMnemonicSigning || !transaction"
            class="control block w-full"
            @blur="v$.password.$touch()"
          />
          <p v-if="v$.password.$error" class="input-error">
            {{ v$.password.$errors[0].$message }}
          </p>
        </form>
      </div>
    </template>
  </div>

  <div v-if="!isLedger || (isLedger && !signing && !signed)" class="flex flex-row gap-4">
    <button class="btn outlined w-full" :disabled="isMnemonicSigning" @click="cancel()">
      Cancel
    </button>

    <button class="btn w-full" :disabled="!canSign || !transaction" @click="sign()">
      <loading-indicator v-if="isMnemonicSigning" type="circular" class="h-4 w-4 align-middle" />
      <span v-else>Sign</span>
    </button>
  </div>

  <div v-if="isLedger" class="-mt-6">
    <ledger-device
      v-show="active"
      :caption="signState.statusText"
      :state="signState.type"
      :connected="signState.device?.connected"
      :app-id="signState.device?.appId"
      :model="signState.device?.model"
      :screen-text="signState.device?.screenText"
      compact-view
    />
  </div>
  <sign-state-modal
    v-else-if="!setExternalState"
    title="Signing"
    :caption="signState.statusText"
    :state="signState.type"
    @close="signState.type = undefined"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { useVuelidate } from "@vuelidate/core";
import { helpers, requiredUnless } from "@vuelidate/validators";
import VueJsonPretty from "vue-json-pretty";
import { AddressType } from "@fleet-sdk/core";
import { DeviceError, RETURN_CODE } from "ledger-ergo-js";
import {
  EIP12UnsignedTransaction,
  isDefined,
  SignedInput,
  SignedTransaction
} from "@fleet-sdk/common";
import { TriangleAlertIcon } from "lucide-vue-next";
import TxBoxDetails from "./TxBoxDetails.vue";
import LedgerDevice from "./LedgerDevice.vue";
import { TxInterpreter } from "@/chains/ergo/transaction/interpreter/txInterpreter";
import { ProverStateType, SigningState, WalletType } from "@/types/internal";
import { PasswordError } from "@/common/errors";
import SignStateModal from "@/components/SignStateModal.vue";
import { LedgerDeviceModelId } from "@/constants/ledger";
import { OutputInterpreter } from "@/chains/ergo/transaction/interpreter/outputInterpreter";
import TxSignSummary from "@/components/TxSignSummary.vue";
import { signTransaction } from "@/chains/ergo/signing";
import "vue-json-pretty/lib/styles.css";
import { useAppStore } from "@/stores/appStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { useWalletStore } from "@/stores/walletStore";
import { useFormat } from "@/composables/useFormat";

export default defineComponent({
  name: "TxSignView",
  components: {
    TxSignSummary,
    SignStateModal,
    TxBoxDetails,
    VueJsonPretty,
    LedgerDevice,
    TriangleAlertIcon
  },
  props: {
    transaction: { type: Object as PropType<Readonly<EIP12UnsignedTransaction>>, required: false },
    inputsToSign: { type: Array<number>, required: false },
    isModal: { type: Boolean, default: false },
    setExternalState: {
      type: Function as PropType<(state: ProverStateType, message?: string) => void>,
      required: false
    }
  },
  emits: ["success", "fail", "refused"],
  setup() {
    return {
      v$: useVuelidate(),
      app: useAppStore(),
      assets: useAssetsStore(),
      wallet: useWalletStore(),
      format: useFormat()
    };
  },
  data() {
    return {
      burnAgreement: false,
      password: "",
      signState: {
        type: undefined,
        statusText: "",
        device: {
          model: LedgerDeviceModelId.nanoS,
          appId: 0,
          connected: false,
          screenText: ""
        }
      } as SigningState
    };
  },
  validations() {
    return {
      password: {
        required: helpers.withMessage(
          "A spending password is required for transaction signing.",
          requiredUnless(this.isLedger)
        )
      }
    };
  },
  computed: {
    signing() {
      return this.signState.type === ProverStateType.busy;
    },
    signed() {
      return this.signState.type === ProverStateType.success;
    },
    active() {
      return isDefined(this.signState.type);
    },
    mode() {
      return this.isModal ? "modal" : "embedded";
    },
    isReadonly() {
      return this.wallet.type === WalletType.ReadOnly;
    },
    isLedger() {
      return this.wallet.type === WalletType.Ledger;
    },
    isMnemonicSigning() {
      return this.isModal && this.signing && !this.isLedger && !this.setExternalState;
    },
    currentWalletId() {
      return this.wallet.id;
    },
    canSign(): boolean {
      return (
        !this.isReadonly &&
        (this.tx?.burning === undefined || (this.tx?.burning !== undefined && this.burnAgreement))
      );
    },
    tx(): TxInterpreter | undefined {
      if (this.wallet.addresses.length === 0 || !this.transaction) return;

      return new TxInterpreter(
        this.transaction,
        this.wallet.addresses.map((a) => a.script),
        this.assets.metadata
      );
    },
    devMode() {
      return this.app.settings.devMode;
    }
  },
  methods: {
    async sign() {
      if (!this.canSign) return;

      const isValid = await this.v$.$validate();
      if (!isValid || !this.transaction) {
        return;
      }

      this.setState(ProverStateType.busy, { statusText: "Signing transaction..." });

      try {
        const signedTx = await signTransaction(
          this.transaction,
          this.currentWalletId,
          this.password,
          this.patchState,
          this.inputsToSign
        );

        if (this.mode === "embedded" || this.isMnemonicSigning) {
          this.setState(ProverStateType.success);
        }

        this.succeed(signedTx, this.setState);
      } catch (e) {
        const errorMessage = typeof e === "string" ? e : (e as Error).message;
        // eslint-disable-next-line no-console
        console.error(e);

        if (e instanceof DeviceError) {
          if (e.code === RETURN_CODE.DENIED) {
            this.fail(e.message);

            return;
          }
        } else if (!(e instanceof PasswordError) && this.mode == "embedded") {
          this.fail(errorMessage);

          return;
        }

        this.setState(ProverStateType.error, {
          statusText: errorMessage
        });
      }
    },
    setState(state: ProverStateType, newState?: Omit<Partial<SigningState>, "state">) {
      if (this.setExternalState) {
        this.setExternalState(state, newState?.statusText);
      }

      this.signState.type = state;
      if (newState) {
        this.patchState(newState);
      }
    },
    patchState(newState: Partial<SigningState>) {
      if (newState.device && this.signState.device) {
        Object.assign(this.signState.device, newState.device);
        delete newState.device;
      }

      Object.assign(this.signState, newState);
    },
    cancel() {
      this.refuse("User rejected");
    },
    refuse(info: string) {
      this.$emit("refused", info);
    },
    fail(info: string) {
      this.$emit("fail", info);
    },
    succeed(
      signedTx: SignedTransaction | SignedInput[],
      setStateFn: (state: ProverStateType, obj: Omit<Partial<SigningState>, "state">) => void
    ) {
      this.$emit("success", signedTx, setStateFn);
    },
    getOutputTitle(output: OutputInterpreter) {
      if (output.isBabelBoxSwap) {
        return "Babel Fee swap";
      } else if (output.isIntrawallet) {
        return "Sending to your address";
      } else if (output.receiverAddressType === AddressType.P2S) {
        return "Sending to contract";
      } else if (output.receiverAddressType === AddressType.P2SH) {
        return "Sending to script hash";
      }

      return "Sending to external address";
    },
    isP2S(output: OutputInterpreter) {
      return output.receiverAddressType === AddressType.P2S;
    }
  }
});
</script>
