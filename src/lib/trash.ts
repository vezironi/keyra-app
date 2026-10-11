import type { VaultData, VaultItem } from "./types";
import { api } from "./api";
import { nowIso } from "./format";

/** Days an item stays in the trash before it is deleted for good. */
export const TRASH_DAYS = 30;

/** Moves an item to the trash. Subscription links are kept so a restore brings them back. */
export function moveToTrash(d: VaultData, item: VaultItem): VaultData {
  return { ...d, items: d.items.filter((i) => i.id !== item.id), trash: [...d.trash, { ...item, deletedAt: nowIso() }] };
}

export function restore(d: VaultData, id: string): VaultData {
  const found = d.trash.find((i) => i.id === id);
  if (!found) return d;
  const { deletedAt: _deletedAt, ...item } = found;
  // The folder may have been deleted while the item sat in the trash.
  const folderId = item.folderId && d.folders.some((f) => f.id === item.folderId) ? item.folderId : null;
  return { ...d, trash: d.trash.filter((i) => i.id !== id), items: [...d.items, { ...item, folderId } as VaultItem] };
}

/** Deletes trashed items for good, along with their attachment files and subscription links. */
export function purge(d: VaultData, ids: Set<string>): VaultData {
  if (!ids.size) return d;
  for (const item of d.trash) if (ids.has(item.id)) for (const a of item.attachments) api.attachmentDelete(a.id).catch(() => {});
  return {
    ...d,
    trash: d.trash.filter((i) => !ids.has(i.id)),
    subscriptions: d.subscriptions.map((s) =>
      (s.cardId && ids.has(s.cardId)) || (s.loginId && ids.has(s.loginId))
        ? { ...s, cardId: s.cardId && ids.has(s.cardId) ? null : s.cardId, loginId: s.loginId && ids.has(s.loginId) ? null : s.loginId }
        : s,
    ),
  };
}

/** Ids of trashed items older than TRASH_DAYS. */
export function expiredTrash(d: VaultData): Set<string> {
  const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
  return new Set(d.trash.filter((i) => new Date(i.deletedAt).getTime() < cutoff).map((i) => i.id));
}
