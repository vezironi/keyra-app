import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Page } from "@/lib/types";
import { useVault } from "@/lib/store";
import { api, errorMessage, isTauri } from "@/lib/api";
import { autotypeSteps } from "@/lib/autotype";
import { formatMoney, searchKey } from "@/lib/format";
import { cycleShort } from "@/lib/subscriptions";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { ItemIcon, SiteIcon, typeLabel } from "./visuals";
import { t, type TKey } from "@/i18n";

interface Result {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
  /** Ctrl+C copies the password, Ctrl+B the username (logins only). */
  copyPassword?: () => void;
  copyUser?: () => void;
  /** Ctrl+Enter types username + password into the previous window. */
  autotype?: () => void;
}

const PAGES: { page: Page; label: TKey }[] = [
  { page: "dashboard", label: "nav.dashboard" },
  { page: "vault", label: "nav.vault" },
  { page: "subscriptions", label: "nav.subscriptions" },
  { page: "calendar", label: "nav.calendar" },
  { page: "reports", label: "nav.reports" },
  { page: "wallet", label: "nav.wallet" },
  { page: "generator", label: "nav.generator" },
  { page: "security", label: "nav.security" },
  { page: "settings", label: "nav.settings" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, navigate, copy, toast } = useVault();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState("");
  const close = () => {
    onOpenChange(false);
    setQ("");
  };

  // Filtering is done here (Turkish-aware lowercasing) rather than by cmdk's fuzzy matcher.
  const groups = useMemo(() => {
    const needle = searchKey(q.trim());
    const hit = (...parts: string[]) => !needle || searchKey(parts.join(" ")).includes(needle);
    const go = (page: Page, id?: string) => () => navigate(page, id);

    const items: Result[] = data.items
      .filter((i) => hit(i.name, i.type === "login" ? `${i.username} ${i.urls.join(" ")}` : ""))
      .slice(0, 8)
      .map((i) => ({
        key: `item:${i.id}`,
        label: i.name,
        hint: i.type === "login" ? i.username : typeLabel(i.type),
        icon: <ItemIcon item={i} size={22} />,
        run: go(i.type === "card" ? "wallet" : "vault", i.id),
        copyPassword: i.type === "login" ? () => copy(i.password, t("common.password")) : undefined,
        copyUser: i.type === "login" ? () => copy(i.username, t("common.username")) : undefined,
        autotype:
          isTauri && i.type === "login" && i.password
            ? () => {
                api.autotype(autotypeSteps(i)).catch((e) => toast(errorMessage(e), "error"));
              }
            : undefined,
      }));
    const subs: Result[] = data.subscriptions
      .filter((x) => hit(x.name, x.category, x.plan))
      .slice(0, 6)
      .map((x) => ({
        key: `sub:${x.id}`,
        label: x.name,
        hint: `${formatMoney(x.price, x.currency)}/${cycleShort(x.cycle)}`,
        icon: <SiteIcon url={x.url} name={x.name} size={22} className="rounded-md" />,
        run: go("subscriptions", x.id),
      }));
    const pages: Result[] = PAGES.filter((p) => hit(t(p.label))).map((p) => ({
      key: `page:${p.page}`,
      label: t(p.label),
      hint: "",
      icon: <ArrowUpRight />,
      run: go(p.page),
    }));
    return [
      { heading: t("nav.vault"), results: items },
      { heading: t("nav.subscriptions"), results: subs },
      { heading: t("palette.pages"), results: pages },
    ].filter((g) => g.results.length);
  }, [q, data, navigate, copy, toast]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!e.ctrlKey) return;
    const r = groups.flatMap((g) => g.results).find((x) => x.key === selected);
    const key = e.key.toLowerCase();
    const action = key === "c" ? r?.copyPassword : key === "b" ? r?.copyUser : key === "enter" ? r?.autotype : undefined;
    if (action) {
      e.preventDefault();
      action();
      close();
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={t("palette.title")}
      description={t("palette.description")}
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false} value={selected} onValueChange={setSelected} onKeyDown={onKeyDown}>
      <CommandInput value={q} onValueChange={setQ} placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.heading} heading={g.heading}>
            {g.results.map((r) => (
              <CommandItem
                key={r.key}
                value={r.key}
                onSelect={() => {
                  r.run();
                  close();
                }}
              >
                {r.icon}
                <span className="truncate">{r.label}</span>
                {r.hint && <span className="truncate text-xs text-muted-foreground">{r.hint}</span>}
                {r.copyPassword && <CommandShortcut>Ctrl+C</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-4 border-t px-3 h-9 text-[11px] font-medium text-muted-foreground">
        <span>{t("palette.navigate")}</span>
        <span>{t("palette.open")}</span>
        <span>{t("palette.copyPassword")}</span>
        <span>{t("palette.copyUsername")}</span>
        {isTauri && <span>{t("palette.autotype")}</span>}
      </div>
      </Command>
    </CommandDialog>
  );
}
