import * as React from "react";
import { Button } from "./button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, children, disabled, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        className={cn(loading && "opacity-80", className)}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </Button>
    );
  }
);

LoadingButton.displayName = "LoadingButton";
