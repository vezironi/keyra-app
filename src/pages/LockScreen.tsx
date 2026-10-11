import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Fingerprint, FlaskConical, Loader2 } from "lucide-react";
import { Button, Field, SecretInput } from "@/components/kit";
import { api, errorMessage } from "../lib/api";
import { emptyVault } from "../lib/defaults";
import { passwordStrength, strengthColor, strengthLabel } from "../lib/password";
import { cn } from "../lib/format";
import { LogoMark } from "../components/Logo";
import { t } from "@/i18n";
import { DEMO_PASSWORD, TEST_PASSWORD, isDemo, testVault } from "../lib/demo";

interface Props {
  mode: "setup" | "unlock";
  onUnlocked: (json: string) => void;
  /** The vault on disk is the test account (mirrored before unlock), so its password can be shown. */
  testAccount?: boolean;
}

export function LockScreen({ mode, onUnlocked, testAccount }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hello, setHello] = useState(false);
  const strength = passwordStrength(password);

  useEffect(() => {
    if (mode === "unlock") api.helloStatus().then((s) => setHello(s.enabled)).catch(() => {});
  }, [mode]);

  const unlockWithHello = async () => {
    setError("");
    setBusy(true);
    try {
      onUnlocked(await api.helloUnlock(t("lock.helloPrompt")));
    } catch (err) {
      if (err === "hello_invalid") setHello(false);
      if (err !== "hello_cancelled") setError(errorMessage(err));
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "setup") {
      if (password.length < 8) return setError(t("lock.tooShort"));
      if (password !== confirm) return setError(t("lock.mismatch"));
    }
    setBusy(true);
    try {
      if (mode === "setup") {
        const json = JSON.stringify(emptyVault());
        await api.create(password, json);
        onUnlocked(json);
      } else {
        onUnlocked(await api.unlock(password));
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Creates (setup) or opens (unlock) the sample-data test account with its fixed password.
  const useTestAccount = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "setup") {
        const json = JSON.stringify(testVault());
        await api.create(TEST_PASSWORD, json);
        onUnlocked(json);
      } else {
        onUnlocked(await api.unlock(TEST_PASSWORD));
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const showTest = !isDemo && (mode === "setup" || testAccount);

  return (
    <div className="h-full flex items-center justify-center p-6 bg-canvas">
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col animate-pop-in">
        <div className="w-11 h-11 rounded-xl bg-primary text-primary-fg flex items-center justify-center mb-5">
          <LogoMark size={24} />
        </div>
        <h1 className="text-2xl font-bold text-fg tracking-tight">{t(mode === "setup" ? "lock.welcome" : "lock.locked")}</h1>
        <p className="text-sm font-medium text-fg-3 mt-1">
          {mode === "setup"
            ? t("lock.setupDesc")
            : t("lock.unlockDesc")}
        </p>

        <div className="flex flex-col gap-4 mt-6 rounded-xl border border-line bg-surface p-5">
          <Field label={t("lock.master")}>
            <SecretInput value={password} onChange={setPassword} autoFocus placeholder="••••••••••" />
          </Field>
          {mode === "setup" && (
            <>
              <div className="-mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={cn("h-1 flex-1 rounded-full", password && i < Math.max(1, strength.score) ? strengthColor[strength.score] : "bg-subtle")} />
                  ))}
                </div>
                <p className="text-xs text-fg-3 mt-1.5">{password ? t("strength.bits", { label: strengthLabel(strength), bits: strength.bits }) : t("lock.hint")}</p>
              </div>
              <Field label={t("lock.masterRepeat")}>
                <SecretInput value={confirm} onChange={setConfirm} placeholder="••••••••••" />
              </Field>
              <div className="flex gap-2.5 rounded-lg bg-amber-500/10 p-3 text-xs font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle size={15} className="shrink-0 mt-px" />
                <span>{t("lock.noRecovery")}</span>
              </div>
            </>
          )}
          {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy || !password} className="w-full">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t(mode === "setup" ? "lock.create" : busy ? "lock.opening" : "lock.unlock")}
          </Button>
          {hello && (
            <>
              <div className="flex items-center gap-3 -my-1 text-[11px] font-medium text-fg-4">
                <div className="h-px flex-1 bg-line" />
                {t("lock.or")}
                <div className="h-px flex-1 bg-line" />
              </div>
              <Button type="button" icon={Fingerprint} onClick={unlockWithHello} disabled={busy} className="w-full">
                {t("lock.helloUnlock")}
              </Button>
            </>
          )}
        </div>
        {showTest && (
          <div className="flex flex-col gap-2 mt-3 rounded-xl border border-dashed border-line-strong p-4">
            <Button type="button" icon={FlaskConical} onClick={useTestAccount} disabled={busy} className="w-full">
              {t(mode === "setup" ? "test.create" : "test.open")}
            </Button>
            <p className="text-xs font-medium text-fg-3 text-center">{t(mode === "setup" ? "test.createDesc" : "test.passwordHint", { password: TEST_PASSWORD })}</p>
          </div>
        )}
        <p className="text-[11px] font-medium text-fg-4 mt-4 text-center">{t("lock.footer")}</p>
        {isDemo && mode === "unlock" && <p className="text-xs font-medium text-fg-3 mt-2 text-center">{t("demo.passwordHint", { password: DEMO_PASSWORD })}</p>}
      </form>
    </div>
  );
}
