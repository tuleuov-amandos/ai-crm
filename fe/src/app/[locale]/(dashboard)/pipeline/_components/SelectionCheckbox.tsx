"use client";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectAllState } from "@/lib/dealBulk";

// "Select all" checkbox state: a part selected shows the dash
export function selectAllChecked(state: SelectAllState): boolean | "indeterminate" {
  if (state === "all") return true;
  return state === "some" ? "indeterminate" : false;
}

// Checkbox of the selection mode (cards, list rows, "select all"). Unlike
// ui/checkbox it shows a dash for "indeterminate" and follows the theme. The
// click does not reach the card / row, whose own click toggles the same deal.
export function SelectionCheckbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: () => void;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
  title?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-muted-foreground/40 bg-background cursor-pointer transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-primary-foreground">
        {checked === "indeterminate" ? (
          <MinusIcon className="size-3 stroke-[3px]" />
        ) : (
          <CheckIcon className="size-3 stroke-[3px]" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
