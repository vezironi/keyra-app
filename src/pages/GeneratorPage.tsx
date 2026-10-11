import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useVault } from "../lib/store";
import { cn } from "../lib/format";
import { defaultGeneratorOptions, generatePassword, generatePin, passwordStrength, strengthColor, strengthLabel, type GeneratorOptions } from "../lib/password";
import { Slider } from "@/components/ui/slider";
import { Button, Card, IconButton, PageHeader, Segmented, Toggle } from "@/components/kit";
import { t } from "@/i18n";

type Mode = "password" | "pin";

/** Generated values are kept only in memory for this session — never written to the vault. */
const sessionHistory: string[] = [];

export function GeneratorPage() {
  const { copy } = useVault();
  const [mode, setMode] = useState<Mode>("password");
  const [opts, setOpts] = useState<GeneratorOptions>(defaultGeneratorOptions);
  const [pinLength, setPinLength] = useState(6);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>(sessionHistory);

  const regenerate = useCallback(() => {
    const v = mode === "pin" ? generatePin(pinLength) : generatePassword(opts);
    setValue(v);
  }, [mode, opts, pinLength]);

  useEffect(regenerate, [regenerate]);

  const strength = passwordStrength(value);
  const set = (p: Partial<GeneratorOptions>) => {
    const next = { ...opts, ...p };
    if (!next.upper && !next.lower && !next.digits && !next.symbols) return;
    setOpts(next);
  };

  const copyValue = () => {
    copy(value, t(mode === "pin" ? "gen.pin" : "gen.password"));
    if (sessionHistory[0] !== value) {
      sessionHistory.unshift(value);
      sessionHistory.splice(20);
      setHistory([...sessionHistory]);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title={t("gen.title")} description={t("gen.description")} />
      <div className="px-6 pb-8 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 max-w-5xl">
        <div className="flex flex-col gap-4">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "password", label: t("gen.password") },
              { value: "pin", label: t("gen.pin") },
            ]}
          />
          <Card className="p-5">
            <div className="font-mono text-2xl text-fg break-all leading-relaxed min-h-16 selectable">
              {[...value].map((ch, i) => (
                <span key={i} className={/\d/.test(ch) ? "text-blue-600 dark:text-blue-400" : /[^a-zA-Z0-9]/.test(ch) ? "text-red-600 dark:text-red-400" : undefined}>
                  {ch}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className="flex gap-1 w-40">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < Math.max(1, strength.score) ? strengthColor[strength.score] : "bg-subtle")} />
                ))}
              </div>
              <span className="text-xs font-medium text-fg-3">
                {t("strength.bits", { label: strengthLabel(strength), bits: strength.bits })}
              </span>
              <div className="ml-auto flex gap-2">
                <Button icon={RefreshCw} onClick={regenerate}>
                  {t("gen.refresh")}
                </Button>
                <Button variant="primary" icon={Copy} onClick={copyValue}>
                  {t("common.copy")}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 flex flex-col gap-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-fg">{t("gen.length")}</span>
                <span className="text-sm font-semibold text-fg tabular-nums">{mode === "pin" ? pinLength : opts.length}</span>
              </div>
              <Slider
                min={mode === "pin" ? 4 : 8}
                max={mode === "pin" ? 12 : 64}
                step={1}
                value={[mode === "pin" ? pinLength : opts.length]}
                onValueChange={([v]) => (mode === "pin" ? setPinLength(v) : set({ length: v }))}
              />
            </div>
            {mode === "password" && (
              <div className="flex flex-col gap-4">
                <Toggle checked={opts.upper} onChange={(upper) => set({ upper })} label={t("gen.upper")} />
                <Toggle checked={opts.lower} onChange={(lower) => set({ lower })} label={t("gen.lower")} />
                <Toggle checked={opts.digits} onChange={(digits) => set({ digits })} label={t("gen.digits")} />
                <Toggle checked={opts.symbols} onChange={(symbols) => set({ symbols })} label={t("gen.symbols")} />
                <Toggle checked={opts.avoidAmbiguous} onChange={(avoidAmbiguous) => set({ avoidAmbiguous })} label={t("gen.ambiguous")} description={t("gen.ambiguousDesc")} />
              </div>
            )}
          </Card>
        </div>

        <Card className="self-start">
          <div className="px-4 pt-4 pb-3">
            <h3 className="text-sm font-semibold text-fg">{t("gen.history")}</h3>
            <p className="text-xs text-fg-3 mt-0.5">{t("gen.historyDesc")}</p>
          </div>
          {history.length === 0 ? (
            <p className="px-4 pb-4 text-xs font-medium text-fg-4">{t("gen.historyEmpty")}</p>
          ) : (
            <div className="border-t border-line">
              {history.map((h, i) => (
                <div key={i} className="group flex items-center gap-2 px-4 h-10 border-b border-line last:border-b-0">
                  <span className="font-mono text-xs text-fg-2 truncate flex-1">{h}</span>
                  <IconButton icon={Copy} label={t("common.copy")} onClick={() => copy(h, t("gen.password"))} className="opacity-0 group-hover:opacity-100" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function clearGeneratorHistory() {
  sessionHistory.length = 0;
}
