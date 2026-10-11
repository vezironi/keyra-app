import type { LoginItem } from "./types";
import type { AutotypeStep } from "./api";

/** username, Tab, password, Enter (or just password, Enter when there is no username). */
export function autotypeSteps(login: LoginItem): AutotypeStep[] {
  const steps: AutotypeStep[] = [];
  if (login.username) steps.push({ kind: "text", value: login.username }, { kind: "key", value: "tab" });
  steps.push({ kind: "text", value: login.password }, { kind: "key", value: "enter" });
  return steps;
}
