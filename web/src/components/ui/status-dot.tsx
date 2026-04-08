import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusDotVariants = cva(
  "inline-block size-2 shrink-0 rounded-full",
  {
    variants: {
      status: {
        online: "bg-emerald-500",
        running: "bg-emerald-500 animate-pulse",
        working: "bg-blue-500 animate-pulse",
        idle: "bg-amber-400",
        dnd: "bg-rose-500",
        offline: "bg-zinc-400",
        error: "bg-red-500",
        warning: "bg-amber-500 animate-pulse",
        success: "bg-emerald-500",
        todo: "bg-zinc-400",
        in_progress: "bg-blue-500",
        done: "bg-emerald-500",
      },
    },
    defaultVariants: {
      status: "offline",
    },
  },
);

function StatusDot({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants>) {
  return (
    <span
      data-slot="status-dot"
      data-status={status}
      className={cn(statusDotVariants({ status }), className)}
      {...props}
    />
  );
}

export { StatusDot, statusDotVariants };
