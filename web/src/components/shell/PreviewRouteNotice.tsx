import { Badge } from '@/components/ui/badge';

type PreviewRouteNoticeProps = {
  surface: string;
  dependency: string;
};

export const PreviewRouteNotice = ({ surface, dependency }: PreviewRouteNoticeProps) => (
  <div className="border-b app-border-subtle bg-yellow-50 px-6 py-2 text-xs text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="border-yellow-500/60 text-yellow-700 dark:text-yellow-300">
        Preview
      </Badge>
      <span>
        {surface} is using static preview data until {dependency} is wired to a backend contract.
      </span>
    </div>
  </div>
);
