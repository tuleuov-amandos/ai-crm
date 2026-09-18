"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverPortal({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Portal>) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  matchTriggerWidth = false,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Size the content to match the trigger's width (e.g. for combobox-style popovers). */
  matchTriggerWidth?: boolean
}) {
  return (
    <PopoverPortal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground shadow-md outline-none z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-white p-4 text-sm ring-1 ring-foreground/10 duration-100",
          // NB: Tailwind v4 needs `w-(--foo)` (parens) to emit `width: var(--foo)`;
          // the old v3 `w-[--foo]` bracket syntax compiles to invalid CSS and is
          // silently dropped, which is what caused the popover to render unconstrained.
          matchTriggerWidth && "w-(--radix-popover-trigger-width)",
          className
        )}
        {...props}
      />
    </PopoverPortal>
  )
}

export { Popover, PopoverTrigger, PopoverContent, PopoverPortal }
