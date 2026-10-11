import { useState } from "react";
import { UserPlus } from "lucide-react";
import { TEST_PASSWORD } from "@/lib/demo";
import { useVault } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { t } from "@/i18n";
import { ConfirmModal } from "./kit";

/** Strip above the app while the test account is open: what it is, and the way to a real vault. */
export function TestBanner() {
  const { deleteAccount, toast } = useVault();
  const [confirm, setConfirm] = useState(false);

  // Deleting also forgets paired browsers, so a test-paired extension can't reach the real vault later.
  const finish = async () => {
    setConfirm(false);
    try {
      await deleteAccount(TEST_PASSWORD);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="shrink-0 flex items-center gap-3 h-10 px-4 bg-amber-500 text-amber-950 text-xs font-medium">
      <span className="px-1.5 py-0.5 rounded bg-amber-950/15 text-[10px] font-bold uppercase tracking-wider">{t("test.badge")}</span>
      <span className="truncate">{t("test.banner", { password: TEST_PASSWORD })}</span>
      <button type="button" onClick={() => setConfirm(true)} className="ml-auto shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-amber-950 text-amber-50 font-semibold hover:opacity-90 cursor-pointer">
        <UserPlus size={13} />
        {t("test.finish")}
      </button>
      <ConfirmModal open={confirm} title={t("test.finishTitle")} message={t("test.finishBody")} confirmLabel={t("test.finish")} onConfirm={finish} onClose={() => setConfirm(false)} />
    </div>
  );
}
