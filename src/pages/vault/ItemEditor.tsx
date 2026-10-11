import { useState } from "react";
import { Dices, Eye, EyeOff, Plus, X } from "lucide-react";
import type { CardColor, CardItem, CustomField, IdentityItem, LoginItem, VaultItem } from "../../lib/types";
import { useVault } from "../../lib/store";
import { DEMO_LIMITS, demoLimitReached } from "../../lib/demo";
import { cn, detectCardBrand, luhnValid, nowIso, uid } from "../../lib/format";
import { defaultGeneratorOptions, generatePassword, passwordStrength, strengthColor, strengthLabel } from "../../lib/password";
import { parseTotp } from "../../lib/totp";
import { Button, DatePicker, Field, IconButton, Input, SecretInput, Select, Textarea, Toggle } from "@/components/kit";
import { CARD_GRADIENTS, CardVisual, typeLabel } from "../../components/visuals";
import { getLocale, t, type TKey } from "@/i18n";

interface Props {
  initial: VaultItem;
  isNew: boolean;
  onCancel: () => void;
  onSaved: (item: VaultItem) => void;
}

export function ItemEditor({ initial, isNew, onCancel, onSaved }: Props) {
  const { data, update, toast } = useVault();
  const [draft, setDraft] = useState<VaultItem>(initial);
  const set = (patch: Partial<VaultItem>) => setDraft((d) => ({ ...d, ...patch }) as VaultItem);

  const save = () => {
    if (!draft.name.trim()) return toast(t("item.nameRequired"), "error");
    if (isNew && demoLimitReached(data, "items")) return toast(t("demo.limitItems", { count: DEMO_LIMITS.items }), "error");
    let item = { ...draft, name: draft.name.trim(), updatedAt: nowIso() } as VaultItem;
    if (item.type === "login") {
      item = { ...item, urls: item.urls.map((u) => u.trim()).filter(Boolean) };
      const before = initial as LoginItem;
      if (!isNew && before.password && before.password !== item.password) {
        item.passwordHistory = [...item.passwordHistory, { password: before.password, date: nowIso() }].slice(-10);
        item.passwordUpdatedAt = nowIso();
      }
    }
    update((d) => ({
      ...d,
      items: isNew ? [...d.items, item] : d.items.map((i) => (i.id === item.id ? item : i)),
    }));
    toast(t(isNew ? "item.added" : "item.saved"), "success");
    onSaved(item);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-line shrink-0">
        <h2 className="text-[15px] font-semibold text-fg flex-1">
          {isNew ? t("item.newTitle", { type: typeLabel(draft.type).toLocaleLowerCase(getLocale()) }) : t("item.editTitle")}
        </h2>
        <Button size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" variant="primary" onClick={save}>
          {t("common.save")}
        </Button>
      </div>

      <form
        className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("item.name")} className="col-span-2 xl:col-span-1">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder={t("item.namePlaceholder")} />
          </Field>
          <Field label={t("item.folder")} className="col-span-2 xl:col-span-1">
            <Select
              value={draft.folderId ?? ""}
              onValueChange={(v) => set({ folderId: v || null })}
              options={[{ value: "", label: t("item.noFolder") }, ...data.folders.map((f) => ({ value: f.id, label: f.name }))]}
            />
          </Field>
        </div>

        {draft.type === "login" && <LoginFields item={draft} set={set} />}
        {draft.type === "card" && <CardFields item={draft} set={set} />}
        {draft.type === "identity" && <IdentityFields item={draft} set={set} />}

        <CustomFields fields={draft.fields} onChange={(fields) => set({ fields })} />

        <Field label={t(draft.type === "note" ? "item.note" : "item.notes")}>
          <Textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={draft.type === "note" ? "min-h-64" : ""} />
        </Field>

        <Toggle checked={draft.favorite} onChange={(favorite) => set({ favorite })} label={t("item.favoriteLabel")} description={t("item.favoriteDesc")} />
        <button type="submit" hidden />
      </form>
    </div>
  );
}

type Setter<T> = { item: T; set: (patch: Partial<T>) => void };

function LoginFields({ item, set }: Setter<LoginItem>) {
  const strength = passwordStrength(item.password);
  const totpInvalid = item.totp.trim() !== "" && !parseTotp(item.totp);
  return (
    <>
      <Field label={t("item.usernameEmail")}>
        <Input value={item.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" spellCheck={false} />
      </Field>
      <Field label={t("common.password")}>
        <div className="flex gap-2">
          <div className="flex-1">
            <SecretInput value={item.password} onChange={(password) => set({ password })} />
          </div>
          <Button icon={Dices} onClick={() => set({ password: generatePassword(defaultGeneratorOptions) })} title={t("item.generateHint")}>
            {t("item.generate")}
          </Button>
        </div>
        {item.password && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1 w-32">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("h-1 flex-1 rounded-full", i < Math.max(1, strength.score) ? strengthColor[strength.score] : "bg-subtle")} />
              ))}
            </div>
            <span className="text-xs text-fg-3">
              {t("strength.bits", { label: strengthLabel(strength), bits: strength.bits })}
            </span>
          </div>
        )}
      </Field>
      <Field label={t("item.totpKey")} hint={totpInvalid ? <span className="text-red-600">{t("item.totpInvalid")}</span> : t("item.totpHint")}>
        <Input value={item.totp} onChange={(e) => set({ totp: e.target.value })} className="font-mono" spellCheck={false} placeholder="JBSWY3DPEHPK3PXP" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-fg-2">{t("item.websites")}</span>
        {item.urls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => set({ urls: item.urls.map((u, j) => (j === i ? e.target.value : u)) })}
              placeholder="https://"
              spellCheck={false}
            />
            <IconButton icon={X} label={t("common.remove")} onClick={() => set({ urls: item.urls.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ urls: [...item.urls, ""] })} className="self-start">
          {t("item.addUrl")}
        </Button>
      </div>
    </>
  );
}

const COLORS = Object.keys(CARD_GRADIENTS) as CardColor[];

function CardFields({ item, set }: Setter<CardItem>) {
  const digits = item.number.replace(/\D/g, "");
  const luhnBad = digits.length >= 12 && !luhnValid(digits);
  return (
    <>
      <div className="max-w-xs">
        <CardVisual card={item} reveal />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-2 mr-1">{t("item.color")}</span>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => set({ color: c })}
            className={cn("w-6 h-6 rounded-full bg-gradient-to-br cursor-pointer ring-offset-2 ring-offset-surface", CARD_GRADIENTS[c], item.color === c && "ring-2 ring-fg")}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("item.cardholder")} className="col-span-2">
          <Input value={item.cardholder} onChange={(e) => set({ cardholder: e.target.value })} />
        </Field>
        <Field label={t("item.cardNumber")} className="col-span-2" hint={luhnBad ? <span className="text-amber-600">{t("item.luhn")}</span> : undefined}>
          <Input
            value={item.number}
            inputMode="numeric"
            className="font-mono"
            onChange={(e) => {
              const number = e.target.value.replace(/[^\d ]/g, "").slice(0, 23);
              const detected = detectCardBrand(number);
              set({ number, brand: detected || item.brand });
            }}
          />
        </Field>
        <Field label={t("item.expMonth")}>
          <Select
            value={item.expMonth}
            onValueChange={(expMonth) => set({ expMonth })}
            placeholder={t("item.month")}
            options={Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => ({ value: m, label: m }))}
          />
        </Field>
        <Field label={t("item.expYear")}>
          <Select
            value={item.expYear}
            onValueChange={(expYear) => set({ expYear })}
            placeholder={t("item.year")}
            options={Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map((y) => ({ value: y, label: y }))}
          />
        </Field>
        <Field label={t("item.cvv")}>
          <SecretInput value={item.cvv} onChange={(cvv) => set({ cvv: cvv.replace(/\D/g, "").slice(0, 4) })} />
        </Field>
        <Field label={t("item.cardKind")}>
          <Select
            value={item.kind}
            onValueChange={(v) => set({ kind: v as CardItem["kind"] })}
            options={[
              { value: "credit", label: t("cardKind.credit") },
              { value: "debit", label: t("cardKind.debit") },
              { value: "virtual", label: t("cardKind.virtual") },
              { value: "prepaid", label: t("cardKind.prepaid") },
            ]}
          />
        </Field>
        <Field label={t("item.bank")}>
          <Input value={item.bank} onChange={(e) => set({ bank: e.target.value })} placeholder={t("item.bankPlaceholder")} />
        </Field>
        <Field label={t("item.brand")}>
          <Select
            value={item.brand}
            onValueChange={(brand) => set({ brand })}
            options={[{ value: "", label: "—" }, ...[...["Visa", "Mastercard", "Troy", "Amex", "Discover"].map((b) => ({ value: b, label: b })), { value: "Diğer", label: t("item.other") }]]}
          />
        </Field>
      </div>
    </>
  );
}

function IdentityFields({ item, set }: Setter<IdentityItem>) {
  const text = (key: keyof IdentityItem, label: TKey, span = false) => (
    <Field label={t(label)} className={span ? "col-span-2" : ""}>
      <Input value={item[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<IdentityItem>)} />
    </Field>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {text("firstName", "item.firstName")}
      {text("lastName", "item.lastName")}
      {text("email", "item.email")}
      {text("phone", "item.phone")}
      {text("nationalId", "item.nationalId")}
      <Field label={t("item.birthDate")}>
        <DatePicker value={item.birthDate} onChange={(birthDate) => set({ birthDate })} />
      </Field>
      {text("company", "item.company", true)}
      {text("address", "item.address", true)}
      {text("city", "item.city")}
      {text("postalCode", "item.postalCode")}
      {text("country", "item.country")}
    </div>
  );
}

function CustomFields({ fields, onChange }: { fields: CustomField[]; onChange: (f: CustomField[]) => void }) {
  const patch = (id: string, p: Partial<CustomField>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-fg-2">{t("item.customFields")}</span>
      {fields.map((f) => (
        <div key={f.id} className="flex gap-2">
          <Input value={f.label} onChange={(e) => patch(f.id, { label: e.target.value })} placeholder={t("item.fieldLabel")} className="w-40 shrink-0" />
          <Input value={f.value} type={f.hidden ? "password" : "text"} onChange={(e) => patch(f.id, { value: e.target.value })} placeholder={t("item.fieldValue")} />
          <IconButton icon={f.hidden ? EyeOff : Eye} label={t(f.hidden ? "item.hiddenField" : "item.visibleField")} onClick={() => patch(f.id, { hidden: !f.hidden })} />
          <IconButton icon={X} label={t("common.remove")} onClick={() => onChange(fields.filter((x) => x.id !== f.id))} />
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...fields, { id: uid(), label: "", value: "", hidden: false }])} className="self-start">
        {t("item.addField")}
      </Button>
    </div>
  );
}
