import { useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArchiveRestore, ChevronDown, Download, ExternalLink, File, History, Keyboard, Paperclip, Pencil, Plus, Repeat, Star, Trash2, X } from "lucide-react";
import type { Attachment, CardItem, IdentityItem, LoginItem, VaultItem } from "../../lib/types";
import { useVault } from "../../lib/store";
import { api, errorMessage, isTauri } from "../../lib/api";
import { autotypeSteps } from "../../lib/autotype";
import { cn, formatBytes, formatDate, formatMoney, groupCardNumber, hostname, nowIso, relativeTime } from "../../lib/format";
import { passwordStrength, strengthColor, strengthLabel } from "../../lib/password";
import { STATUS_STYLE, cycleShort, statusLabel } from "../../lib/subscriptions";
import { Badge, Button, ConfirmModal, DetailRow, IconButton } from "@/components/kit";
import { CardVisual, ItemIcon, cardMonthsLeft, typeLabel } from "../../components/visuals";
import { TotpRow } from "../../components/Totp";
import { t } from "@/i18n";

export function openExternal(url: string) {
  const full = url.includes("://") ? url : `https://${url}`;
  if (isTauri) openUrl(full).catch(() => {});
  else window.open(full, "_blank", "noopener");
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && <h4 className="text-xs font-semibold text-fg-3 px-1">{title}</h4>}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">{children}</div>
    </div>
  );
}

function LoginSection({ item }: { item: LoginItem }) {
  const strength = passwordStrength(item.password);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <Section title={t("item.loginInfo")}>
        <DetailRow label={t("item.usernameEmail")} value={item.username} copyLabel={t("common.username")} />
        <DetailRow
          label={t("common.password")}
          value={item.password}
          secret
          extra={<Badge className={cn("text-white", strengthColor[strength.score])}>{strengthLabel(strength)}</Badge>}
        />
        {item.totp && <TotpRow secret={item.totp} />}
      </Section>
      {item.urls.some(Boolean) && (
        <Section title={t("item.websites")}>
          {item.urls.filter(Boolean).map((url, i) => (
            <DetailRow
              key={i}
              label={hostname(url) || t("item.address")}
              value={url}
              copyLabel={t("item.address")}
              extra={<IconButton icon={ExternalLink} label={t("item.openBrowser")} onClick={() => openExternal(url)} />}
            />
          ))}
        </Section>
      )}
      {item.passwordHistory.length > 0 && (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <button type="button" onClick={() => setHistoryOpen((o) => !o)} className="flex items-center gap-2 w-full px-4 h-10 text-sm font-medium text-fg-2 hover:bg-hover cursor-pointer">
            <History size={15} /> {t("item.history", { count: item.passwordHistory.length })}
            <ChevronDown size={15} className={cn("ml-auto transition-transform", historyOpen && "rotate-180")} />
          </button>
          {historyOpen && (
            <div className="border-t border-line">
              {[...item.passwordHistory].reverse().map((h, i) => (
                <DetailRow key={i} label={formatDate(h.date.slice(0, 10))} value={h.password} secret copyLabel={t("item.oldPassword")} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CardSection({ item }: { item: CardItem }) {
  const left = cardMonthsLeft(item);
  return (
    <>
      <div className="max-w-sm">
        <CardVisual card={item} />
      </div>
      {left !== null && left <= 2 && (
        <div className={cn("rounded-lg px-3 py-2 text-xs font-semibold", left < 0 ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
          {t(left < 0 ? "item.cardExpired" : "item.cardExpiring")}
        </div>
      )}
      <Section title={t("item.cardInfo")}>
        <DetailRow label={t("item.cardholder")} value={item.cardholder} />
        <DetailRow label={t("item.cardNumber")} value={groupCardNumber(item.number)} secret copyLabel={t("item.cardNumber")} />
        <DetailRow label={t("item.expiry")} value={item.expMonth && item.expYear ? `${item.expMonth.padStart(2, "0")}/${item.expYear}` : ""} mono />
        <DetailRow label={t("item.cvvLong")} value={item.cvv} secret copyLabel={t("item.cvv")} />
        <DetailRow label={t("item.bank")} value={item.bank} />
        <DetailRow label={t("item.brand")} value={item.brand} />
      </Section>
    </>
  );
}

function IdentitySection({ item }: { item: IdentityItem }) {
  return (
    <Section title={t("item.identityInfo")}>
      <DetailRow label={t("item.fullName")} value={[item.firstName, item.lastName].filter(Boolean).join(" ")} />
      <DetailRow label={t("item.email")} value={item.email} />
      <DetailRow label={t("item.phone")} value={item.phone} />
      <DetailRow label={t("item.nationalId")} value={item.nationalId} secret mono />
      <DetailRow label={t("item.birthDate")} value={item.birthDate ? formatDate(item.birthDate) : ""} />
      <DetailRow label={t("item.company")} value={item.company} />
      <DetailRow label={t("item.address")} value={[item.address, item.postalCode, item.city, item.country].filter(Boolean).join(", ")} />
    </Section>
  );
}

function AttachmentsSection({ item, readOnly }: { item: VaultItem; readOnly: boolean }) {
  const { update, toast } = useVault();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Attachment | null>(null);
  const setAttachments = (fn: (list: Attachment[]) => Attachment[]) =>
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, attachments: fn(i.attachments), updatedAt: nowIso() } : i)) }));

  const add = async () => {
    try {
      const path = await openDialog({ multiple: false });
      if (typeof path !== "string") return;
      setBusy(true);
      const meta = await api.attachmentAdd(path);
      setAttachments((list) => [...list, { ...meta, addedAt: nowIso() }]);
      toast(t("item.attachmentAdded", { name: meta.name }), "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveAs = async (a: Attachment) => {
    try {
      const path = await saveDialog({ defaultPath: a.name });
      if (!path) return;
      await api.attachmentSave(a.id, path);
      toast(t("item.attachmentSaved"), "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const remove = (a: Attachment) => {
    setAttachments((list) => list.filter((x) => x.id !== a.id));
    api.attachmentDelete(a.id).catch(() => {});
  };

  if (!isTauri || (readOnly && !item.attachments.length)) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-semibold text-fg-3">{t("item.attachments")}</h4>
        {!readOnly && (
          <button type="button" onClick={add} disabled={busy} className="flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg cursor-pointer disabled:opacity-50">
            <Plus size={13} /> {t(busy ? "item.attachmentEncrypting" : "item.attachmentAdd")}
          </button>
        )}
      </div>
      {item.attachments.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          {item.attachments.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 px-4 h-11 border-b border-line last:border-b-0">
              <File size={15} className="text-fg-3 shrink-0" />
              <span className="text-sm font-medium text-fg truncate flex-1">{a.name}</span>
              <span className="text-xs font-medium text-fg-3 tabular-nums">{formatBytes(a.size)}</span>
              <IconButton icon={Download} label={t("item.attachmentSave")} onClick={() => saveAs(a)} />
              {!readOnly && <IconButton icon={X} label={t("common.remove")} onClick={() => setConfirm(a)} className="hover:text-red-600" />}
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={add} disabled={busy} className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-line-strong text-xs font-medium text-fg-3 hover:text-fg hover:bg-hover cursor-pointer">
          <Paperclip size={14} /> {t("item.attachmentHint")}
        </button>
      )}
      <ConfirmModal
        open={!!confirm}
        title={t("item.attachmentDeleteTitle")}
        message={t("item.attachmentDeleteBody", { name: confirm?.name ?? "" })}
        onConfirm={() => confirm && remove(confirm)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

interface ItemDetailProps {
  item: VaultItem;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Shown from the trash: read-only, with restore / delete-forever actions. */
  trashed?: { onRestore: () => void; onDelete: () => void };
}

export function ItemDetail({ item, onEdit, onDelete, trashed }: ItemDetailProps) {
  const { data, update, navigate, toast } = useVault();
  const folder = data.folders.find((f) => f.id === item.folderId);
  const linkedSubs = data.subscriptions.filter((s) => (item.type === "card" ? s.cardId === item.id : s.loginId === item.id));

  const toggleFavorite = () =>
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, favorite: !i.favorite } : i)) }));

  const autotype = async () => {
    if (item.type !== "login") return;
    try {
      await api.autotype(autotypeSteps(item));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-line shrink-0">
        <ItemIcon item={item} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-fg truncate">{item.name || t("common.unnamed")}</h2>
          <div className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
            {typeLabel(item.type)}
            {folder && <span>· {folder.name}</span>}
          </div>
        </div>
        {trashed ? (
          <>
            <Button size="sm" variant="danger" icon={Trash2} onClick={trashed.onDelete}>
              {t("vault.deleteForever")}
            </Button>
            <Button size="sm" icon={ArchiveRestore} onClick={trashed.onRestore}>
              {t("vault.restore")}
            </Button>
          </>
        ) : (
          <>
            {isTauri && item.type === "login" && item.password && <IconButton icon={Keyboard} label={t("item.autotype")} onClick={autotype} />}
            <IconButton
              icon={Star}
              label={t(item.favorite ? "item.unfavorite" : "item.favorite")}
              onClick={toggleFavorite}
              className={item.favorite ? "text-amber-500 hover:text-amber-600 [&_svg]:fill-current" : ""}
            />
            <IconButton icon={Trash2} label={t("vault.moveToTrash")} onClick={onDelete} className="hover:text-red-600" />
            <Button size="sm" icon={Pencil} onClick={onEdit}>
              {t("common.edit")}
            </Button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-5 bg-canvas/50">
        {item.type === "login" && <LoginSection item={item} />}
        {item.type === "card" && <CardSection item={item} />}
        {item.type === "identity" && <IdentitySection item={item} />}

        {item.fields.length > 0 && (
          <Section title={t("item.customFields")}>
            {item.fields.map((f) => (
              <DetailRow key={f.id} label={f.label || t("item.field")} value={f.value} secret={f.hidden} />
            ))}
          </Section>
        )}

        {item.notes && (
          <Section title={t("item.notes")}>
            <p className="px-4 py-3 text-sm text-fg whitespace-pre-wrap selectable">{item.notes}</p>
          </Section>
        )}

        <AttachmentsSection item={item} readOnly={!!trashed} />

        {linkedSubs.length > 0 && (
          <Section title={t(item.type === "card" ? "item.cardSubs" : "item.linkedSubs")}>
            {linkedSubs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate("subscriptions", s.id)}
                className="flex items-center gap-3 w-full px-4 py-2.5 border-b border-line last:border-b-0 hover:bg-hover cursor-pointer text-left"
              >
                <Repeat size={15} className="text-fg-3" />
                <span className="text-sm font-medium text-fg flex-1 truncate">{s.name}</span>
                <Badge className={STATUS_STYLE[s.status]}>{statusLabel(s.status)}</Badge>
                <span className="text-sm font-semibold text-fg tabular-nums">
                  {formatMoney(s.price, s.currency)}
                  <span className="text-fg-3 font-medium">/{cycleShort(s.cycle)}</span>
                </span>
              </button>
            ))}
          </Section>
        )}

        <div className="text-[11px] font-medium text-fg-4 px-1 flex flex-col gap-0.5">
          <span>{t("item.created", { date: formatDate(item.createdAt.slice(0, 10)) })}</span>
          <span>{t("item.updated", { when: relativeTime(item.updatedAt) })}</span>
          {item.type === "login" && <span>{t("item.pwChanged", { when: relativeTime(item.passwordUpdatedAt) })}</span>}
        </div>
      </div>
    </div>
  );
}
