import { useState } from "react";
import { CreditCard, FileText, Globe, IdCard, type LucideIcon } from "lucide-react";
import type { CardColor, CardItem, ItemType, VaultItem } from "../lib/types";
import { cn, groupCardNumber, hostname, initials } from "../lib/format";
import { useVault } from "../lib/store";
import { tDynamic } from "@/i18n";
import { t } from "@/i18n";

export const TYPE_ICON: Record<ItemType, LucideIcon> = {
  login: Globe,
  card: CreditCard,
  note: FileText,
  identity: IdCard,
};

export const typeLabel = (type: ItemType) => tDynamic(`itemType.${type}`);

/**
 * Site icon fetched from DuckDuckGo's icon service. Only the hostname leaves the
 * device, and it can be turned off in Settings; falls back to initials.
 */
export function SiteIcon({ url, name, size = 32, className }: { url?: string; name: string; size?: number; className?: string }) {
  const { data } = useVault();
  const [failed, setFailed] = useState(false);
  const host = url ? hostname(url) : "";
  const box = cn("shrink-0 rounded-lg flex items-center justify-center overflow-hidden bg-subtle text-fg-2 font-semibold", className);
  if (host && data.settings.showIcons && !failed) {
    return (
      <div className={box} style={{ width: size, height: size }}>
        <img
          src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
          alt=""
          width={size * 0.55}
          height={size * 0.55}
          onError={() => setFailed(true)}
          draggable={false}
        />
      </div>
    );
  }
  return (
    <div className={box} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

export function ItemIcon({ item, size = 32 }: { item: VaultItem; size?: number }) {
  if (item.type === "login") return <SiteIcon url={item.urls[0]} name={item.name} size={size} />;
  if (item.type === "card") return <MiniCard color={item.color} size={size} />;
  const Icon = TYPE_ICON[item.type];
  return (
    <div className="shrink-0 rounded-lg flex items-center justify-center bg-subtle text-fg-3" style={{ width: size, height: size }}>
      <Icon size={size * 0.45} />
    </div>
  );
}

export const CARD_GRADIENTS: Record<CardColor, string> = {
  graphite: "from-neutral-800 to-neutral-950",
  ocean: "from-sky-600 to-blue-900",
  forest: "from-emerald-600 to-teal-900",
  sunset: "from-orange-500 to-rose-700",
  violet: "from-violet-500 to-indigo-900",
  rose: "from-pink-500 to-fuchsia-800",
  gold: "from-amber-400 to-yellow-700",
};

export function MiniCard({ color, size = 32 }: { color: CardColor; size?: number }) {
  return (
    <div className="shrink-0 flex items-center justify-center rounded-lg bg-subtle" style={{ width: size, height: size }}>
      <div className={cn("rounded-[3px] bg-gradient-to-br", CARD_GRADIENTS[color])} style={{ width: size * 0.62, height: size * 0.42 }} />
    </div>
  );
}

export function CardVisual({ card, reveal = false, className }: { card: CardItem; reveal?: boolean; className?: string }) {
  const digits = card.number.replace(/\D/g, "");
  const shown = reveal ? groupCardNumber(digits) : `•••• •••• •••• ${digits.slice(-4) || "••••"}`;
  return (
    <div className={cn("relative aspect-[1.586] w-full rounded-2xl p-5 text-white bg-gradient-to-br shadow-lg shadow-neutral-900/15 overflow-hidden flex flex-col", CARD_GRADIENTS[card.color], className)}>
      <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-white/8" />
      <div className="absolute -right-24 top-10 w-64 h-64 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{card.bank || t("item.bank")}</div>
          <div className="text-sm font-semibold mt-0.5 truncate max-w-48">{card.name || t("itemType.card")}</div>
        </div>
        <div className="text-sm font-bold italic tracking-wide">{card.brand}</div>
      </div>
      <div className="relative mt-auto">
        <div className="w-9 h-7 rounded-md bg-gradient-to-br from-amber-200 to-amber-400/80 mb-3 opacity-90" />
        <div className="font-mono text-lg tracking-[0.12em] whitespace-nowrap">{shown}</div>
        <div className="flex items-end justify-between mt-2 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-white/50">{t("item.cardholder")}</div>
            <div className="font-semibold uppercase truncate">{card.cardholder || "—"}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-white/50">{t("wallet.expShort")}</div>
            <div className="font-semibold font-mono">{card.expMonth && card.expYear ? `${card.expMonth.padStart(2, "0")}/${card.expYear.slice(-2)}` : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Months until a card expires (negative when already expired), or null if unknown. */
export function cardMonthsLeft(card: CardItem): number | null {
  const m = Number(card.expMonth);
  let y = Number(card.expYear);
  if (!m || !y) return null;
  if (y < 100) y += 2000;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
}
