import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Puzzle } from "lucide-react";
import { useVault } from "@/lib/store";
import { api } from "@/lib/api";
import { handleBrowserRequest, type BrowserRequest } from "@/lib/browser";
import { t } from "@/i18n";
import { Button, Modal } from "./kit";

interface Envelope<T> {
  id: string;
  request: T;
}

interface PairRequest {
  name: string;
  code: string;
  /** Sent by the extension's "Connect in test mode". */
  test?: boolean;
}

/** Answers the browser extension (see src/lib/browser.ts) and asks the user to approve new browsers. */
export function BrowserBridge() {
  const { data, update, navigate, toast } = useVault();
  const dataRef = useRef(data);
  dataRef.current = data;
  const [pair, setPair] = useState<Envelope<PairRequest> | null>(null);

  useEffect(() => {
    const onRequest = async ({ id, request }: Envelope<BrowserRequest>) => {
      try {
        const out = await handleBrowserRequest(request, dataRef.current);
        if (out.change) update(out.change);
        if (out.notice) toast(t(out.notice.key === "saved" ? "browser.savedFrom" : "browser.updatedFrom", { name: out.notice.name }), "success");
        if (out.open !== undefined) navigate("vault", out.open || undefined);
        await api.browserReply(id, out.error ? { error: out.error } : { result: out.result });
      } catch {
        await api.browserReply(id, { error: "unknown" }).catch(() => {});
      }
    };
    // The test account holds only sample data, so a test-mode extension is let in without the prompt.
    // Any other pairing, or a test pairing against a real vault, still needs the user's approval.
    const onPair = (envelope: Envelope<PairRequest>) => {
      if (envelope.request.test && dataRef.current.test) {
        api.browserReply(envelope.id, { result: { approved: true } }).catch(() => {});
        toast(t("test.paired", { name: envelope.request.name }), "success");
        return;
      }
      setPair(envelope);
    };
    const off = [listen<Envelope<BrowserRequest>>("browser://request", (e) => void onRequest(e.payload)), listen<Envelope<PairRequest>>("browser://pair", (e) => onPair(e.payload))];
    return () => off.forEach((p) => p.then((f) => f()).catch(() => {}));
  }, [update, navigate, toast]);

  const answer = (approved: boolean) => {
    if (!pair) return;
    api.browserReply(pair.id, { result: { approved } }).catch(() => {});
    if (approved) toast(t("browser.paired", { name: pair.request.name }), "success");
    setPair(null);
  };

  return (
    <Modal
      open={!!pair}
      onClose={() => answer(false)}
      title={t("browser.pairTitle")}
      footer={
        <>
          <Button onClick={() => answer(false)}>{t("browser.deny")}</Button>
          <Button variant="primary" onClick={() => answer(true)}>
            {t("browser.approve")}
          </Button>
        </>
      }
    >
      {pair && (
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-11 h-11 rounded-xl bg-subtle flex items-center justify-center text-fg-2">
            <Puzzle size={20} />
          </div>
          <p className="text-sm font-medium text-fg-2">{t("browser.pairBody", { name: pair.request.name })}</p>
          <div className="font-mono text-2xl font-bold tracking-[0.2em] text-fg px-4 py-2 rounded-lg bg-subtle border border-line">{pair.request.code}</div>
          <p className="text-xs font-medium text-fg-3">{t("browser.pairHint")}</p>
        </div>
      )}
    </Modal>
  );
}
