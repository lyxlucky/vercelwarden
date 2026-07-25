"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { X, type LucideIcon } from "lucide-react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", icon: Icon, children, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes("vw-button", `vw-button--${variant}`, `vw-button--${size}`, className)}
      {...props}
    >
      {Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: LucideIcon;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, className, size = "md", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes("vw-icon-button", `vw-icon-button--${size}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={size === "sm" ? 16 : 18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
});

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={classes("vw-input", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="vw-field">
      <span className="vw-field__label">{label}</span>
      {children}
      {error ? <span className="vw-field__error">{error}</span> : hint ? <span className="vw-field__hint">{hint}</span> : null}
    </label>
  );
}

interface MenuContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  contentId: string;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const value = useContext(MenuContext);
  if (!value) throw new Error("Menu components must be rendered inside Menu.Root.");
  return value;
}

function MenuRoot({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <MenuContext.Provider value={{ open, setOpen, contentId }}>
      <div ref={ref} className="vw-menu" data-align={align}>{children}</div>
    </MenuContext.Provider>
  );
}

function MenuTrigger({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, contentId } = useMenuContext();
  return (
    <button
      type="button"
      className="vw-menu__trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={contentId}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </button>
  );
}

function MenuContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open, contentId } = useMenuContext();
  if (!open) return null;
  return <div id={contentId} role="menu" className={classes("vw-menu__content", className)} {...props}>{children}</div>;
}

function MenuItem({ children, onClick, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useMenuContext();
  return (
    <button
      type="button"
      role="menuitem"
      className={classes("vw-menu__item", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export const Menu = { Root: MenuRoot, Trigger: MenuTrigger, Content: MenuContent, Item: MenuItem };

interface TabsContextValue {
  value: string;
  setValue(value: string): void;
  id: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const value = useContext(TabsContext);
  if (!value) throw new Error("Tabs components must be rendered inside Tabs.Root.");
  return value;
}

function TabsRoot({ value, defaultValue, onValueChange, children }: {
  value?: string;
  defaultValue: string;
  onValueChange?(value: string): void;
  children: ReactNode;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const id = useId();
  const selected = value ?? internal;
  const setValue = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };
  return <TabsContext.Provider value={{ value: selected, setValue, id }}>{children}</TabsContext.Provider>;
}

function TabsList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={classes("vw-tabs", className)} {...props}>{children}</div>;
}

function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const tabs = useTabsContext();
  const selected = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.id}-${value}-tab`}
      aria-controls={`${tabs.id}-${value}-panel`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className="vw-tabs__trigger"
      onClick={() => tabs.setValue(value)}
    >
      {children}
    </button>
  );
}

function TabsPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const tabs = useTabsContext();
  if (tabs.value !== value) return null;
  return <div role="tabpanel" id={`${tabs.id}-${value}-panel`} aria-labelledby={`${tabs.id}-${value}-tab`} className={className}>{children}</div>;
}

export const Tabs = { Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Panel: TabsPanel };

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="vw-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => onOpenChange(false)}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
    >
      <header className="vw-dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <IconButton icon={X} label="关闭" onClick={() => onOpenChange(false)} />
      </header>
      <div className="vw-dialog__body">{children}</div>
      {footer ? <footer className="vw-dialog__footer">{footer}</footer> : null}
    </dialog>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="vw-tooltip" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className="vw-tooltip__content">{label}</span>
    </span>
  );
}

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "danger";
}

interface ToastContextValue {
  push(toast: Omit<ToastMessage, "id">): void;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((item) => item.id !== id)), []);
  const push = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = ++toastId;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ push, dismiss }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="vw-toasts" role="region" aria-label="通知" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="vw-toast" data-tone={toast.tone ?? "info"}>
            <div><strong>{toast.title}</strong>{toast.description ? <p>{toast.description}</p> : null}</div>
            <IconButton icon={X} label="关闭通知" size="sm" onClick={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}

