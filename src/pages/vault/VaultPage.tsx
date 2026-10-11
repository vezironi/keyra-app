import { useEffect, useMemo, useState } from "react";
import { Check, Folder, FolderPlus, Layers, Pencil, Plus, Star, Trash, Trash2, Vault, X } from "lucide-react";
import type { ItemType, TrashedItem, VaultItem } from "../../lib/types";
import { useVault } from "../../lib/store";
import { cn, maskCardNumber, relativeTime, searchKey, uid } from "../../lib/format";
import { moveToTrash, purge, restore, TRASH_DAYS } from "../../lib/trash";
import { newItem } from "../../lib/defaults";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button, ConfirmModal, EmptyState, IconButton, Input, SearchInput } from "@/components/kit";
import { ItemIcon, TYPE_ICON, typeLabel } from "../../components/visuals";
import { ItemDetail } from "./ItemDetail";
import { ItemEditor } from "./ItemEditor";
import { getLocale, t } from "@/i18n";

type Filter = { kind: "all" } | { kind: "favorites" } | { kind: "type"; type: ItemType } | { kind: "folder"; id: string | null } | { kind: "trash" };

const isTrashed = (i: VaultItem | TrashedItem): i is TrashedItem => "deletedAt" in i;

const TYPES: ItemType[] = ["login", "card", "identity", "note"];

function subtitle(item: VaultItem): string {
  switch (item.type) {
    case "login":
      return item.username || item.urls[0] || "";
    case "card":
      return [item.brand, maskCardNumber(item.number)].filter(Boolean).join(" ");
    case "identity":
      return [item.firstName, item.lastName].filter(Boolean).join(" ") || item.email;
    case "note":
      return item.notes.split("\n")[0].slice(0, 60);
  }
}

function matches(item: VaultItem, q: string): boolean {
  if (!q) return true;
  const hay = [item.name, item.notes, subtitle(item), ...(item.type === "login" ? item.urls : []), ...item.fields.map((f) => (f.hidden ? f.label : `${f.label} ${f.value}`))]
    .join(" ");
  const folded = searchKey(hay);
  return searchKey(q)
    .split(/\s+/)
    .every((w) => folded.includes(w));
}

export function VaultPage() {
  const { data, update, nav, copy, toast } = useVault();
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(nav.focusId ?? null);
  const [editing, setEditing] = useState<{ item: VaultItem; isNew: boolean } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<TrashedItem[] | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (nav.focusId) {
      setSelectedId(nav.focusId);
      setFilter({ kind: "all" });
      setEditing(null);
    }
  }, [nav]);

  const inTrash = filter.kind === "trash";
  const items = useMemo(() => {
    if (filter.kind === "trash") return data.trash.filter((i) => matches(i, query.trim())).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    const list = data.items.filter((i) => {
      if (filter.kind === "favorites" && !i.favorite) return false;
      if (filter.kind === "type" && i.type !== filter.type) return false;
      if (filter.kind === "folder" && i.folderId !== filter.id) return false;
      return matches(i, query.trim());
    });
    return list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, getLocale()));
  }, [data.items, data.trash, filter, query]);

  const selected = (inTrash ? data.trash : data.items).find((i) => i.id === selectedId) ?? null;

  const startNew = (type: ItemType) => {
    const item = newItem(type, filter.kind === "folder" ? filter.id : null);
    setEditing({ item, isNew: true });
  };

  const trashItem = (item: VaultItem) => {
    update((d) => moveToTrash(d, item));
    if (selectedId === item.id) setSelectedId(null);
    toast(t("vault.trashed", { days: TRASH_DAYS }));
  };

  const restoreItem = (item: TrashedItem) => {
    update((d) => restore(d, item.id));
    setSelectedId(null);
    toast(t("vault.restored"), "success");
  };

  const purgeItems = (list: TrashedItem[]) => {
    const ids = new Set(list.map((i) => i.id));
    update((d) => purge(d, ids));
    if (selectedId && ids.has(selectedId)) setSelectedId(null);
    toast(t("vault.deleted"));
  };

  const addFolder = () => {
    const name = newFolder?.trim();
    if (name) update((d) => ({ ...d, folders: [...d.folders, { id: uid(), name }] }));
    setNewFolder(null);
  };

  const renameFolder = () => {
    if (renaming?.name.trim()) update((d) => ({ ...d, folders: d.folders.map((f) => (f.id === renaming.id ? { ...f, name: renaming.name.trim() } : f)) }));
    setRenaming(null);
  };

  const deleteFolder = (id: string) => {
    update((d) => ({
      ...d,
      folders: d.folders.filter((f) => f.id !== id),
      items: d.items.map((i) => (i.folderId === id ? { ...i, folderId: null } : i)),
    }));
    if (filter.kind === "folder" && filter.id === id) setFilter({ kind: "all" });
  };

  const count = (pred: (i: VaultItem) => boolean) => data.items.filter(pred).length;
  const filterBtn = (active: boolean, onClick: () => void, Icon: typeof Vault, label: string, n: number) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full h-8 px-2 rounded-md text-[13px] font-medium cursor-pointer transition-colors",
        active ? "bg-hover text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
      )}
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate flex-1 text-left">{label}</span>
      <span className="text-[11px] text-fg-4 tabular-nums">{n}</span>
    </button>
  );

  const isActive = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);

  return (
    <div className="flex h-full min-h-0">
      {/* Filters */}
      <div className="w-52 shrink-0 border-r border-line flex flex-col min-h-0">
        <div className="px-3 pt-5 pb-3">
          <h1 className="text-xl font-bold text-fg tracking-tight px-1">{t("vault.title")}</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            {filterBtn(isActive({ kind: "all" }), () => setFilter({ kind: "all" }), Layers, t("nav.allItems"), data.items.length)}
            {filterBtn(isActive({ kind: "favorites" }), () => setFilter({ kind: "favorites" }), Star, t("vault.favorites"), count((i) => i.favorite))}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-fg-3 px-2 mb-1">{t("vault.types")}</span>
            {TYPES.map((type) => filterBtn(isActive({ kind: "type", type }), () => setFilter({ kind: "type", type }), TYPE_ICON[type], typeLabel(type), count((i) => i.type === type)))}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-medium text-fg-3">{t("vault.folders")}</span>
              <button type="button" onClick={() => setNewFolder("")} className="text-fg-3 hover:text-fg cursor-pointer" title={t("vault.addFolder")}>
                <FolderPlus size={14} />
              </button>
            </div>
            {data.folders.map((f) =>
              renaming?.id === f.id ? (
                <div key={f.id} className="flex items-center gap-1">
                  <Input value={renaming.name} autoFocus onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && renameFolder()} onBlur={renameFolder} className="h-8" />
                </div>
              ) : (
                <div key={f.id} className="group relative">
                  {filterBtn(isActive({ kind: "folder", id: f.id }), () => setFilter({ kind: "folder", id: f.id }), Folder, f.name, count((i) => i.folderId === f.id))}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex bg-surface rounded">
                    <IconButton icon={Pencil} label={t("vault.rename")} onClick={() => setRenaming({ id: f.id, name: f.name })} className="w-6 h-6" />
                    <IconButton icon={Trash2} label={t("vault.deleteFolder")} onClick={() => deleteFolder(f.id)} className="w-6 h-6 hover:text-red-600" />
                  </div>
                </div>
              ),
            )}
            {filterBtn(isActive({ kind: "folder", id: null }), () => setFilter({ kind: "folder", id: null }), Folder, t("vault.noFolder"), count((i) => !i.folderId))}
            {newFolder !== null && (
              <div className="flex items-center gap-1 mt-1">
                <Input value={newFolder} autoFocus placeholder={t("vault.folderName")} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? addFolder() : e.key === "Escape" && setNewFolder(null))} className="h-8" />
                <IconButton icon={Check} label={t("common.add")} onClick={addFolder} />
                <IconButton icon={X} label={t("common.cancel")} onClick={() => setNewFolder(null)} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 mt-auto">
            {filterBtn(inTrash, () => setFilter({ kind: "trash" }), Trash, t("vault.trash"), data.trash.length)}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="w-80 shrink-0 border-r border-line flex flex-col min-h-0">
        <div className="flex items-center gap-2 p-3 border-b border-line">
          <SearchInput value={query} onChange={setQuery} placeholder={t("vault.search")} />
          {inTrash ? (
            <Button variant="danger" icon={Trash2} disabled={!data.trash.length} onClick={() => setConfirmPurge(data.trash)}>
              {t("vault.emptyTrash")}
            </Button>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="primary" icon={Plus}>
                {t("common.add")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>{t("vault.newItem")}</DropdownMenuLabel>
              {TYPES.map((type) => {
                const Icon = TYPE_ICON[type];
                return (
                  <DropdownMenuItem key={type} onSelect={() => startNew(type)}>
                    <Icon /> {typeLabel(type)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
        {inTrash && <p className="px-4 py-2 border-b border-line text-xs font-medium text-fg-3">{t("vault.trashHint", { days: TRASH_DAYS })}</p>}
        <div className="flex-1 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            inTrash && !query ? (
              <EmptyState icon={Trash} title={t("vault.trashEmpty")} />
            ) : (
              <EmptyState icon={Vault} title={t(query ? "vault.noResults" : "vault.empty")} description={t(query ? "vault.tryOther" : "vault.emptyDesc")} />
            )
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedId(item.id);
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(item.id)}
                className={cn(
                  "group flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                  item.id === selectedId ? "bg-hover" : "hover:bg-hover/60",
                )}
              >
                <ItemIcon item={item} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-fg truncate">{item.name || t("common.unnamed")}</span>
                    {item.favorite && <Star size={11} className="text-amber-500 fill-current shrink-0" />}
                  </div>
                  <div className="text-xs font-medium text-fg-3 truncate">
                    {isTrashed(item) ? t("vault.deletedWhen", { when: relativeTime(item.deletedAt) }) : subtitle(item) || typeLabel(item.type)}
                  </div>
                </div>
                {!inTrash && item.type === "login" && item.password && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copy(item.password, t("common.password"));
                    }}
                    className="hidden group-hover:flex h-6 px-2 items-center rounded border border-line-strong bg-surface text-[11px] font-semibold text-fg-2 hover:text-fg cursor-pointer"
                  >
                    {t("common.password")}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail / editor */}
      <div className="flex-1 min-w-0 min-h-0">
        {editing ? (
          <ItemEditor
            key={editing.item.id}
            initial={editing.item}
            isNew={editing.isNew}
            onCancel={() => setEditing(null)}
            onSaved={(item) => {
              setEditing(null);
              setSelectedId(item.id);
            }}
          />
        ) : selected ? (
          isTrashed(selected) ? (
            <ItemDetail item={selected} trashed={{ onRestore: () => restoreItem(selected), onDelete: () => setConfirmPurge([selected]) }} />
          ) : (
            <ItemDetail item={selected} onEdit={() => setEditing({ item: selected, isNew: false })} onDelete={() => trashItem(selected)} />
          )
        ) : (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={Vault} title={t("vault.pick")} description={t("vault.pickDesc")} />
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmPurge}
        title={t("vault.deleteTitle")}
        message={
          confirmPurge?.length === 1 ? t("vault.deleteBody", { name: confirmPurge[0].name }) : t("vault.emptyTrashBody", { count: confirmPurge?.length ?? 0 })
        }
        confirmLabel={t("vault.deleteForever")}
        onConfirm={() => confirmPurge && purgeItems(confirmPurge)}
        onClose={() => setConfirmPurge(null)}
      />
    </div>
  );
}
