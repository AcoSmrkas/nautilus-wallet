import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, onMounted, shallowReactive, watch } from "vue";
import { some, uniq } from "@fleet-sdk/common";
import { difference } from "lodash-es";
import { useStorage } from "@vueuse/core";
import { useAppStore } from "./appStore";
import { assetInfoDbService } from "@/database/assetInfoDbService";
import { graphQLService } from "@/chains/ergo/services/graphQlService";
import { assetPricingService, AssetRate } from "@/chains/ergo/services/assetPricingService";
import { BasicAssetMetadata } from "@/types/internal";
import { ERG_DECIMALS, ERG_TOKEN_ID } from "@/constants/ergo";
import {
  ErgoTokenBlacklist,
  ergoTokenBlacklistService
} from "@/chains/ergo/services/tokenBlacklistService";

const _ = undefined;
const ERG_METADATA: BasicAssetMetadata = { name: "ERG", decimals: ERG_DECIMALS };

const PRICE_RATES_UPDATE_INTERVAL = 5 * 30 * 1000;
const PRICE_RATES_DEFAULTS = { lastUpdated: 0, prices: new Map<string, AssetRate>() };
const PRICE_RATES_SERIALIZER = {
  read: (raw: string): typeof PRICE_RATES_DEFAULTS => {
    const parsed = JSON.parse(raw);
    return {
      lastUpdated: parsed.lastUpdated,
      prices: new Map<string, AssetRate>(parsed.prices)
    };
  },
  write(val: typeof PRICE_RATES_DEFAULTS): string {
    return JSON.stringify({
      lastUpdated: val.lastUpdated,
      prices: Array.from(val.prices.entries())
    });
  }
};

const BLACKLIST_UPDATE_INTERVAL = 10 * 60 * 1000;
const BLACKLIST_DEFAULTS = {
  lastUpdated: 0,
  nsfw: [] as string[],
  scam: [] as string[]
};

const DEFAULT_DB_CONFIG = { shallow: true, mergeDefaults: true };

const elapsed = (interval: number, lastUpdated: number) => Date.now() - lastUpdated >= interval;

const usePrivateState = defineStore("_assets", () => ({
  blacklist: useStorage("ergoTokensBlacklist", BLACKLIST_DEFAULTS, _, DEFAULT_DB_CONFIG),
  prices: useStorage("ergoTokenRates", PRICE_RATES_DEFAULTS, _, {
    ...DEFAULT_DB_CONFIG,
    serializer: PRICE_RATES_SERIALIZER
  })
}));

export const useAssetsStore = defineStore("assets", () => {
  const app = useAppStore();
  const privateState = usePrivateState();

  const metadata = shallowReactive(new Map([[ERG_TOKEN_ID, ERG_METADATA]]));

  onMounted(() => Promise.all([fetchBlacklists(), loadAssetPriceRates()]));

  watch(
    () => app.settings.conversionCurrency,
    () => loadAssetPriceRates(true)
  );
  watch(
    () => app.settings.blacklistedTokensLists,
    () => fetchBlacklists(true)
  );

  async function fetchBlacklists(force = false) {
    const lastUpdated = privateState.blacklist.lastUpdated ?? Date.now();
    if (!force && !elapsed(BLACKLIST_UPDATE_INTERVAL, lastUpdated)) return;

    const ergoBlacklists = await ergoTokenBlacklistService.fetch();
    privateState.blacklist = { ...ergoBlacklists, lastUpdated: Date.now() };
  }

  async function loadAssetPriceRates(force = false) {
    const lastUpdated = privateState.prices.lastUpdated ?? Date.now();
    if (!force && !elapsed(PRICE_RATES_UPDATE_INTERVAL, lastUpdated)) return;

    const prices = await assetPricingService.getRates(app.settings.conversionCurrency);
    privateState.prices = { lastUpdated: Date.now(), prices };
  }

  const blacklist = computed(() => {
    let tokenIds = [] as string[];
    for (const listName of app.settings.blacklistedTokensLists) {
      const list = privateState.blacklist[listName as keyof ErgoTokenBlacklist];
      if (Array.isArray(list) && list.length > 0) tokenIds = tokenIds.concat(list);
    }

    return tokenIds;
  });

  const prices = computed(() => privateState.prices.prices);

  async function loadMetadataFor(tokenIds: string[]) {
    const unloaded = difference(uniq(tokenIds), Array.from(metadata.keys()));
    if (unloaded.length === 0) return;

    const patch = await assetInfoDbService.getAnyOf(unloaded);
    if (unloaded.length > patch.length) {
      const missing = difference(
        unloaded,
        patch.map((x) => x.id)
      );

      const newMetadata = await graphQLService.getAssetsInfo(missing);
      if (some(newMetadata)) {
        await assetInfoDbService.bulkPut(newMetadata);
        patch.push(...newMetadata);
      }
    }

    for (const info of patch) {
      metadata.set(info.id, {
        name: info.name,
        decimals: info.decimals,
        type: info.subtype,
        artworkUrl: info.artworkCover ?? info.artworkUrl
      });
    }
  }

  return { blacklist, metadata, prices, loadMetadataFor };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAssetsStore, import.meta.hot));
}
