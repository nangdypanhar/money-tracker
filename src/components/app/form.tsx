"use client";

import { useState } from "react";
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
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, type CurrencyCode } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Text input that only accepts a decimal amount; parsing to minor units happens on save. */
export function AmountInput({
  value,
  onChange,
  currency,
  large,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  currency: CurrencyCode;
  large?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground",
          large && "left-4 text-2xl",
        )}
      >
        {CURRENCIES[currency].symbol}
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className={cn("h-11 rounded-xl pl-7 tabular-nums", large && "h-16 rounded-2xl pl-10 text-3xl font-semibold md:text-3xl")}
        {...props}
      />
    </div>
  );
}

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md rounded-t-3xl border-x bg-card">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-lg font-medium">{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : "sr-only"}>{description ?? title}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

/** Confirmation for destructive actions. */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    description: string;
    action: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = (title: string, description: string, action = "Delete") =>
    new Promise<boolean>((resolve) => setState({ title, description, action, resolve }));

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription>{state?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => close(true)}>
            {state?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
