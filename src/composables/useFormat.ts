import { BigNumber } from "bignumber.js";

export function useFormat() {
  return FORMATTERS;
}

const DEFAULT_FORMATTER = Intl.NumberFormat("en", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2
});

const FORMATTERS = {
  string: {
    uppercase(val?: string): string {
      if (!val || typeof val !== "string") return "";
      return val.toUpperCase();
    },
    lowercase(val?: string): string {
      if (!val || typeof val !== "string") return "";
      return val.toLowerCase();
    },
    shorten(
      val: string | undefined,
      maxLength: number,
      ellipsisPosition: "middle" | "end" = "middle"
    ): string {
      if (!val || maxLength >= val.length) return val ?? "";

      const ellipsis = "…";
      if (ellipsisPosition === "middle") {
        const fragmentSize = Math.trunc((maxLength - ellipsis.length) / 2);
        if (fragmentSize * 2 + ellipsis.length >= val.length) return val;
        return `${val.slice(0, fragmentSize).trimEnd()}${ellipsis}${val
          .slice(val.length - fragmentSize)
          .trimStart()}`;
      } else {
        return `${val.slice(0, maxLength - ellipsis.length + 1).trimEnd()}${ellipsis}`;
      }
    }
  },
  bn: {
    format(value?: BigNumber, decimalPlaces?: number, shortenThreshold = 1_000_000) {
      if (!value) return "";
      if (value.gte(shortenThreshold)) return DEFAULT_FORMATTER.format(value.toNumber());
      return value.toFormat(decimalPlaces);
    }
  }
};
