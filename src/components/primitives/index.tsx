"use client";

import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import {
  Button as MuiButton,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  IconButton as MuiIconButton,
  Menu as MuiMenu,
  MenuItem as MuiMenuItem,
  OutlinedInput,
  Tab,
  Tabs as MuiTabs,
  Tooltip as MuiTooltip,
} from "@mui/material";
import type { LucideIcon } from "lucide-react";
export { ToastProvider, useToast, type ToastMessage } from "@/components/ui/ToastProvider";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, children, type = "button", ...props }, ref
) {
  return (
    <MuiButton
      ref={ref}
      type={type}
      variant={variant === "primary" || variant === "danger" ? "contained" : variant === "ghost" ? "text" : "outlined"}
      color={variant === "danger" ? "error" : "primary"}
      size={size === "sm" ? "small" : "medium"}
      startIcon={Icon ? <Icon size={16} aria-hidden="true" /> : undefined}
      {...props}
    >
      {children}
    </MuiButton>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  label: string;
  icon: LucideIcon;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, size = "md", type = "button", ...props }, ref
) {
  return (
    <MuiTooltip title={label}>
      <span>
        <MuiIconButton ref={ref} type={type} aria-label={label} size={size === "sm" ? "small" : "medium"} {...props}>
          <Icon size={size === "sm" ? 16 : 18} aria-hidden="true" />
        </MuiIconButton>
      </span>
    </MuiTooltip>
  );
});

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "color"> { invalid?: boolean }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, ...props }, ref) {
  return <OutlinedInput inputRef={ref} error={invalid} fullWidth {...props} />;
});

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId();
  const helperId = `${id}-helper`;
  const control = isValidElement(children)
    ? (() => {
        const element = children as ReactElement<{
          id?: string;
          className?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>;
        const intrinsicControl = typeof element.type === "string" && ["input", "select", "textarea"].includes(element.type);
        return cloneElement(element, {
          id,
          "aria-describedby": hint || error ? helperId : undefined,
          ...(intrinsicControl ? {
            className: ["vw-input", element.props.className].filter(Boolean).join(" "),
            "aria-invalid": Boolean(error),
          } : {}),
        });
      })()
    : children;
  return (
    <FormControl error={Boolean(error)}>
      <FormLabel htmlFor={id} sx={{ mb: 0.75 }}>{label}</FormLabel>
      {control}
      {error || hint ? <FormHelperText id={helperId}>{error ?? hint}</FormHelperText> : null}
    </FormControl>
  );
}

interface MenuContextValue { anchor: HTMLElement | null; setAnchor(anchor: HTMLElement | null): void; contentId: string }
const MenuContext = createContext<MenuContextValue | null>(null);
function useMenuContext() { const value = useContext(MenuContext); if (!value) throw new Error("Menu components must be inside Menu.Root."); return value; }
function MenuRoot({ children }: { children: ReactNode; align?: "start" | "end" }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <MenuContext.Provider value={{ anchor, setAnchor, contentId: useId() }}>{children}</MenuContext.Provider>;
}
function MenuTrigger({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const menu = useMenuContext();
  return <MuiButton variant="text" aria-haspopup="menu" aria-expanded={Boolean(menu.anchor)} onClick={(event) => { onClick?.(event); menu.setAnchor(event.currentTarget); }} disabled={props.disabled} className={props.className}>{children}</MuiButton>;
}
function MenuContent({ children, className }: HTMLAttributes<HTMLDivElement>) {
  const menu = useMenuContext();
  return <MuiMenu id={menu.contentId} anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={() => menu.setAnchor(null)} className={className}>{children}</MuiMenu>;
}
function MenuItem({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const menu = useMenuContext();
  return <MuiMenuItem onClick={(event) => { onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>); if (!event.defaultPrevented) menu.setAnchor(null); }} disabled={props.disabled} className={props.className}>{children}</MuiMenuItem>;
}
export const Menu = { Root: MenuRoot, Trigger: MenuTrigger, Content: MenuContent, Item: MenuItem };

interface TabsContextValue { value: string; setValue(value: string): void; id: string }
const TabsContext = createContext<TabsContextValue | null>(null);
function useTabsContext() { const value = useContext(TabsContext); if (!value) throw new Error("Tabs components must be inside Tabs.Root."); return value; }
function TabsRoot({ value, defaultValue, onValueChange, children }: { value?: string; defaultValue: string; onValueChange?(value: string): void; children: ReactNode }) {
  const [internal, setInternal] = useState(defaultValue);
  const selected = value ?? internal;
  return <TabsContext.Provider value={{ value: selected, setValue(next) { if (value === undefined) setInternal(next); onValueChange?.(next); }, id: useId() }}>{children}</TabsContext.Provider>;
}
function TabsList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const tabs = useTabsContext();
  return <MuiTabs value={tabs.value} onChange={(_, value: string) => tabs.setValue(value)} className={className} aria-label={props["aria-label"]}>{children}</MuiTabs>;
}
function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const tabs = useTabsContext();
  return <Tab value={value} label={children} id={`${tabs.id}-${value}-tab`} aria-controls={`${tabs.id}-${value}-panel`} />;
}
function TabsPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const tabs = useTabsContext();
  if (tabs.value !== value) return null;
  return <div role="tabpanel" id={`${tabs.id}-${value}-panel`} aria-labelledby={`${tabs.id}-${value}-tab`} className={className}>{children}</div>;
}
export const Tabs = { Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Panel: TabsPanel };

export function Dialog({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <MuiDialog open={open} onClose={() => onOpenChange(false)}>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
        {title}
        <MuiIconButton aria-label="关闭" onClick={() => onOpenChange(false)}><CloseOutlined /></MuiIconButton>
      </DialogTitle>
      <DialogContent>
        {description ? <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText> : null}
        {children}
      </DialogContent>
      {footer ? <DialogActions>{footer}</DialogActions> : null}
    </MuiDialog>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <MuiTooltip title={label}><span>{children}</span></MuiTooltip>;
}
