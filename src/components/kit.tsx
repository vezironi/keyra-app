/**
 * App-level building blocks on top of shadcn/ui (`components/ui/*`).
 * Pages import from here so the shadcn primitives are configured once.
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import { enUS, tr } from "react-day-picker/locale";
import { CalendarIcon, Copy, Eye, EyeOff, Search, type LucideIcon } from "lucide-react";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select as UISelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatDate, parseDateKey, toDateKey } from "@/lib/format";
import { useVault } from "@/lib/store";
import { getLanguage, t } from "@/i18n";

export { Input, Textarea };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive" } as const;

interface ButtonProps extends Omit<ComponentProps<typeof UIButton>, "variant" | "size"> {
  variant?: Variant;
  icon?: LucideIcon;
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", icon: Icon, size = "md", children, ...rest }: ButtonProps) {
  return (
    <UIButton variant={VARIANT[variant]} size={size === "sm" ? "sm" : "default"} {...rest}>
      {Icon && <Icon data-icon="inline-start" />}
      {children}
    </UIButton>
  );
}

interface IconButtonProps extends Omit<ComponentProps<typeof UIButton>, "variant" | "size"> {
  icon: LucideIcon;
  label: string;
  bordered?: boolean;
  active?: boolean;
}

/** Icon-only button; its label is shown as a tooltip and used as the accessible name. */
export function IconButton({ icon: Icon, label, bordered, active, className, ...rest }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <UIButton
          variant={bordered ? "outline" : "ghost"}
          size="icon-sm"
          aria-label={label}
          className={cn("text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground", className)}
          {...rest}
        >
          <Icon />
        </UIButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface SelectOption {
  value: string;
  label: ReactNode;
}

/** Radix forbids "" as an item value, so empty selections travel as this sentinel. */
const NONE = "__none__";

interface SelectProps {
  value: string | number;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
}

export function Select({ value, onValueChange, options, placeholder, className, size }: SelectProps) {
  return (
    <UISelect value={String(value) === "" ? NONE : String(value)} onValueChange={(v) => onValueChange(v === NONE ? "" : v)}>
      <SelectTrigger size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value === "" ? NONE : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UISelect>
  );
}

/** Date picker for YYYY-MM-DD strings, with a Turkish calendar. */
export function DatePicker({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateKey(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <UIButton variant="outline" className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
          {value ? formatDate(value) : (placeholder ?? t("common.pickDate"))}
        </UIButton>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={getLanguage() === "tr" ? tr : enUS}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(1940, 0)}
          endMonth={new Date(new Date().getFullYear() + 10, 11)}
          onSelect={(d) => {
            if (d) onChange(toDateKey(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs font-semibold text-fg-2">{label}</Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Password-style input with show/hide toggle. */
export function SecretInput({ value, onChange, placeholder, autoFocus, className }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn("pr-9 font-mono", className)}
        spellCheck={false}
        autoComplete="off"
      />
      <UIButton
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t(shown ? "common.hide" : "common.show")}
        onClick={() => setShown((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        {shown ? <EyeOff /> : <Eye />}
      </UIButton>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="flex flex-col">
        <span className="text-sm font-medium text-fg">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <UIBadge variant="secondary" className={cn("rounded-md font-semibold", className)}>
      {children}
    </UIBadge>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList className={cn(className && "w-full")}>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className="px-3">
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function Modal({ open, onClose, title, children, footer, width = "sm:max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("flex max-h-[calc(100vh-3rem)] flex-col gap-0 p-0", width)}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <DialogFooter className="m-0 rounded-b-xl border-t px-5 py-3">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {confirmLabel ?? t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="text-xs text-fg-3 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-fg tracking-tight">{title}</h1>
        {description && <p className="text-sm font-medium text-fg-3 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 px-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-subtle flex items-center justify-center text-fg-3">
        <Icon size={18} />
      </div>
      <p className="text-sm font-semibold text-fg mt-1">{title}</p>
      {description && <p className="text-xs font-medium text-fg-3 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Read-only labelled value row used in detail panes, with copy and optional reveal. */
export function DetailRow({ label, value, secret, mono, copyLabel, extra }: { label: string; value: string; secret?: boolean; mono?: boolean; copyLabel?: string; extra?: ReactNode }) {
  const { copy } = useVault();
  const [shown, setShown] = useState(false);
  if (!value) return null;
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-fg-3">{label}</div>
        <div className={cn("text-sm text-fg mt-0.5 break-all selectable", (mono || secret) && "font-mono")}>
          {secret && !shown ? "•".repeat(Math.min(value.length, 16)) : value}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
        {extra}
        {secret && <IconButton icon={shown ? EyeOff : Eye} label={t(shown ? "common.hide" : "common.show")} onClick={() => setShown((s) => !s)} />}
        <IconButton icon={Copy} label={t("common.copy")} onClick={() => copy(value, copyLabel ?? label)} />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}
