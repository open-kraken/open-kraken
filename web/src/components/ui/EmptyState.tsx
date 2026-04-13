import type { LucideIcon } from "lucide-react";
import { Button } from "./button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-4">
      <Icon className="size-8 app-text-muted" />
    </div>
    <h3 className="text-base font-semibold app-text-strong mb-2">{title}</h3>
    {description && (
      <p className="text-sm app-text-muted max-w-sm mb-6">{description}</p>
    )}
    {actionLabel && onAction && (
      <Button onClick={onAction} size="sm">
        {actionLabel}
      </Button>
    )}
  </div>
);
