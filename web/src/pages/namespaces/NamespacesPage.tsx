import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle,
  Edit,
  ExternalLink,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type {
  CreateNamespaceInput,
  NamespaceDTO,
  NamespaceListStatus,
  UpdateNamespaceInput,
} from '@/api/namespaces';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  deriveNamespaceSlugPreview,
  isNamespaceConflictError,
  isNamespaceNotFoundError,
  namespaceErrorMessage,
  namespacePermissionsForRole,
  validateNamespaceForm,
} from '@/features/namespaces/namespace-model';
import { useAppShell } from '@/state/app-shell-store';
import { useNamespacesStore, type NamespaceFilters } from '@/state/namespaces-store';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatDate = (value: string) => {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : dateFormatter.format(date);
};

const statusLabel = (status: NamespaceDTO['status']) => (status === 'active' ? 'Active' : 'Archived');

const NamespaceStatusBadge = ({ status }: { status: NamespaceDTO['status'] }) => {
  if (status === 'active') {
    return (
      <Badge
        variant="outline"
        className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
      >
        <CheckCircle size={10} className="mr-1" />
        Active
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs">
      <Archive size={10} className="mr-1" />
      Archived
    </Badge>
  );
};

const LoadingGrid = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" role="status" aria-label="Loading namespaces">
    {Array.from({ length: 6 }, (_, index) => (
      <Card key={index} className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <Skeleton width="2.5rem" height="2.5rem" radius="8px" />
          <div className="flex-1 space-y-2">
            <Skeleton width="45%" height="0.8rem" />
            <Skeleton width="75%" height="0.65rem" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Skeleton height="3.5rem" />
          <Skeleton height="3.5rem" />
          <Skeleton height="3.5rem" />
        </div>
        <Skeleton width="100%" height="2rem" />
      </Card>
    ))}
  </div>
);

const NamespaceFormFields = ({
  values,
  onChange,
  nameError,
  descriptionError,
  disabled,
  slug,
}: {
  values: { name: string; description: string };
  onChange: (values: { name: string; description: string }) => void;
  nameError?: string;
  descriptionError?: string;
  disabled?: boolean;
  slug: string;
}) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="namespace-name">Name</Label>
        <span className={`text-[11px] ${values.name.length > 64 ? 'text-red-600' : 'app-text-faint'}`}>
          {values.name.length}/64
        </span>
      </div>
      <Input
        id="namespace-name"
        value={values.name}
        disabled={disabled}
        aria-invalid={Boolean(nameError)}
        onChange={(event) => onChange({ ...values, name: event.target.value })}
        placeholder="Open Kraken"
      />
      <div className="text-xs app-text-muted">
        Identifier:{' '}
        <span className="font-mono app-text-strong">
          {slug || 'generated after create'}
        </span>
      </div>
      {nameError && <p className="text-xs text-red-600">{nameError}</p>}
    </div>

    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="namespace-description">Description</Label>
        <span className={`text-[11px] ${values.description.length > 256 ? 'text-red-600' : 'app-text-faint'}`}>
          {values.description.length}/256
        </span>
      </div>
      <Textarea
        id="namespace-description"
        value={values.description}
        disabled={disabled}
        aria-invalid={Boolean(descriptionError)}
        onChange={(event) => onChange({ ...values, description: event.target.value })}
        placeholder="Describe what this namespace is for..."
      />
      {descriptionError && <p className="text-xs text-red-600">{descriptionError}</p>}
    </div>
  </div>
);

const CreateNamespaceDialog = ({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateNamespaceInput) => Promise<void>;
}) => {
  const [values, setValues] = useState({ name: '', description: '' });
  const [serverErrors, setServerErrors] = useState<{ name?: string; banner?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const clientErrors = useMemo(() => validateNamespaceForm(values), [values]);
  const slug = useMemo(() => deriveNamespaceSlugPreview(values.name), [values.name]);
  const hasClientErrors = Boolean(clientErrors.name || clientErrors.description);

  useEffect(() => {
    if (open) {
      setValues({ name: '', description: '' });
      setServerErrors({});
      setSubmitting(false);
    }
  }, [open]);

  const handleValuesChange = (next: { name: string; description: string }) => {
    setValues(next);
    setServerErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (hasClientErrors || submitting) {
      return;
    }
    setSubmitting(true);
    setServerErrors({});
    try {
      await onCreate({
        name: values.name.trim(),
        description: values.description.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      if (isNamespaceConflictError(error)) {
        setServerErrors({ name: 'A namespace with this name already exists' });
      } else {
        setServerErrors({ banner: namespaceErrorMessage(error, 'Something went wrong - please try again') });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create namespace</DialogTitle>
            <DialogDescription>
              Add a persisted namespace to the server registry.
            </DialogDescription>
          </DialogHeader>
          {serverErrors.banner && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {serverErrors.banner}
            </div>
          )}
          <NamespaceFormFields
            values={values}
            onChange={handleValuesChange}
            nameError={serverErrors.name ?? clientErrors.name}
            descriptionError={clientErrors.description}
            disabled={submitting}
            slug={slug}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={hasClientErrors || submitting}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Create Namespace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const NamespaceDetailDrawer = ({
  open,
  namespace,
  loading,
  errorMessage,
  canEdit,
  canArchive,
  onClose,
  onRetry,
  onSave,
  onArchive,
  onRestore,
  editTargetId,
}: {
  open: boolean;
  namespace: NamespaceDTO | null;
  loading: boolean;
  errorMessage: string | null;
  canEdit: boolean;
  canArchive: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSave: (namespaceId: string, input: UpdateNamespaceInput) => Promise<void>;
  onArchive: (namespace: NamespaceDTO) => void;
  onRestore: (namespace: NamespaceDTO) => Promise<void>;
  editTargetId: string | null;
}) => {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: '', description: '' });
  const [serverError, setServerError] = useState<string | null>(null);
  const [nameServerError, setNameServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const clientErrors = useMemo(() => validateNamespaceForm(values), [values]);
  const hasClientErrors = Boolean(clientErrors.name || clientErrors.description);

  useEffect(() => {
    if (namespace) {
      setValues({ name: namespace.name, description: namespace.description });
      setEditing(editTargetId === namespace.id);
      setServerError(null);
      setNameServerError(null);
      setSaving(false);
      setRestoring(false);
    }
  }, [editTargetId, namespace?.id, namespace]);

  if (!open) {
    return null;
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!namespace || hasClientErrors || saving) {
      return;
    }
    setSaving(true);
    setServerError(null);
    setNameServerError(null);
    try {
      await onSave(namespace.id, {
        name: values.name.trim(),
        description: values.description.trim(),
      });
      setEditing(false);
    } catch (error) {
      if (isNamespaceConflictError(error)) {
        setNameServerError('This name is already taken by another namespace.');
      } else {
        setServerError(namespaceErrorMessage(error, 'Save failed - please try again'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!namespace || restoring) {
      return;
    }
    setRestoring(true);
    try {
      await onRestore(namespace);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close namespace details"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Namespace details"
        className="absolute right-0 top-0 h-full w-full max-w-xl app-surface-strong border-l app-border-subtle shadow-xl flex flex-col"
      >
        <div className="border-b app-border-subtle px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="app-text-muted" />
              <span className="text-xs font-semibold uppercase app-text-faint">Namespace</span>
            </div>
            <h2 className="text-lg font-semibold app-text-strong truncate">
              {namespace?.name ?? (loading ? 'Loading namespace' : 'Namespace details')}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
            <X size={16} />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-5">
          {loading && (
            <div className="space-y-4" role="status" aria-label="Loading namespace details">
              <Skeleton width="45%" height="1.1rem" />
              <Skeleton width="70%" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton height="5rem" />
                <Skeleton height="5rem" />
              </div>
              <Skeleton height="10rem" />
            </div>
          )}

          {!loading && errorMessage && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <div className="font-semibold mb-1">Failed to load namespace</div>
              <p className="mb-3">{errorMessage}</p>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw size={14} />
                Retry
              </Button>
            </div>
          )}

          {!loading && !errorMessage && namespace && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <NamespaceStatusBadge status={namespace.status} />
                  <span className="font-mono text-xs app-text-muted">{namespace.slug}</span>
                </div>
                <p className="text-sm app-text-muted">
                  {namespace.description || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border app-border-subtle app-surface px-3 py-3">
                  <div className="flex items-center gap-2 text-xs app-text-muted mb-1">
                    <Briefcase size={13} />
                    Teams
                  </div>
                  <div className="text-2xl font-semibold app-text-strong">{namespace.team_count}</div>
                </div>
                <div className="rounded border app-border-subtle app-surface px-3 py-3">
                  <div className="flex items-center gap-2 text-xs app-text-muted mb-1">
                    <Users size={13} />
                    Members
                  </div>
                  <div className="text-2xl font-semibold app-text-strong">{namespace.member_count}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs app-text-faint uppercase font-semibold mb-1">Created</div>
                  <div className="app-text-strong">{formatDate(namespace.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs app-text-faint uppercase font-semibold mb-1">Updated</div>
                  <div className="app-text-strong">{formatDate(namespace.updated_at)}</div>
                </div>
              </div>

              {editing ? (
                <form onSubmit={handleSave} className="rounded border app-border-subtle app-surface p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold app-text-strong">Edit details</h3>
                    <p className="text-xs app-text-muted mt-1">Identifier remains {namespace.slug}.</p>
                  </div>
                  {serverError && (
                    <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                      {serverError}
                    </div>
                  )}
                  <NamespaceFormFields
                    values={values}
                    onChange={(next) => {
                      setValues(next);
                      setServerError(null);
                      setNameServerError(null);
                    }}
                    nameError={nameServerError ?? clientErrors.name}
                    descriptionError={clientErrors.description}
                    disabled={saving}
                    slug={namespace.slug}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={hasClientErrors || saving}>
                      {saving && <Loader2 size={14} className="animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Edit size={14} />
                      Edit
                    </Button>
                  )}
                  {canArchive && namespace.status === 'active' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => onArchive(namespace)}>
                      <Archive size={14} />
                      Archive
                    </Button>
                  )}
                  {canArchive && namespace.status === 'archived' && (
                    <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
                      {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Restore
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </aside>
    </div>
  );
};

export const NamespacesPage = () => {
  const { account } = useAuth();
  const { pushNotification } = useAppShell();
  const permissions = useMemo(() => namespacePermissionsForRole(account?.role), [account?.role]);
  const store = useNamespacesStore();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<NamespaceListStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [detailEditTargetId, setDetailEditTargetId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<NamespaceDTO | null>(null);
  const [actionNamespaceId, setActionNamespaceId] = useState<string | null>(null);

  const filters = useMemo<NamespaceFilters>(
    () => ({ status: statusFilter, query: debouncedSearch.trim() }),
    [debouncedSearch, statusFilter]
  );
  const hasFilters = statusFilter !== 'all' || searchInput.trim().length > 0;
  const initialLoading = store.loadState === 'loading' && store.namespaces.length === 0;
  const refreshing = store.loadState === 'loading' && store.namespaces.length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void store.loadNamespaces(filters);
  }, [filters, store.loadNamespaces]);

  useEffect(() => {
    if (store.loadState === 'error' && store.errorMessage) {
      pushNotification({
        tone: 'error',
        title: 'Namespaces failed to load',
        detail: store.errorMessage,
        tag: 'namespaces-load',
      });
    }
  }, [store.errorMessage, store.loadState, pushNotification]);

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('all');
  };

  const openDetail = async (namespaceId: string, edit = false) => {
    setDetailTargetId(namespaceId);
    setDetailEditTargetId(edit ? namespaceId : null);
    setDrawerOpen(true);
    try {
      await store.loadNamespaceDetail(namespaceId);
    } catch (error) {
      if (isNamespaceNotFoundError(error)) {
        setDrawerOpen(false);
        pushNotification({
          tone: 'warning',
          title: 'Namespace not found',
          detail: 'Namespace no longer exists.',
        });
      } else {
        pushNotification({
          tone: 'error',
          title: 'Namespace detail failed',
          detail: namespaceErrorMessage(error, 'Failed to load namespace detail'),
        });
      }
    }
  };

  const handleCreate = async (input: CreateNamespaceInput) => {
    const nextFilters: NamespaceFilters = { status: 'all', query: '' };
    await store.createNamespace(input, nextFilters);
    setStatusFilter('all');
    setSearchInput('');
    setDebouncedSearch('');
    pushNotification({
      tone: 'info',
      title: 'Namespace created',
      detail: `${input.name.trim()} was added.`,
    });
  };

  const handleUpdate = async (namespaceId: string, input: UpdateNamespaceInput) => {
    await store.updateNamespace(namespaceId, input, filters);
    pushNotification({
      tone: 'info',
      title: 'Changes saved',
      detail: `${input.name.trim()} was updated.`,
    });
  };

  const handleArchiveConfirmed = async () => {
    if (!archiveTarget) {
      return;
    }
    setActionNamespaceId(archiveTarget.id);
    try {
      await store.archiveNamespace(archiveTarget.id, filters);
      pushNotification({
        tone: 'info',
        title: 'Namespace archived',
        detail: `${archiveTarget.name} is now archived.`,
      });
    } catch (error) {
      if (isNamespaceConflictError(error)) {
        await store.loadNamespaces(filters);
        pushNotification({
          tone: 'warning',
          title: 'Namespace already archived',
          detail: 'The namespace state was refreshed.',
        });
      } else {
        pushNotification({
          tone: 'error',
          title: 'Archive failed',
          detail: namespaceErrorMessage(error, 'Archive failed - please try again'),
        });
      }
    } finally {
      setActionNamespaceId(null);
      setArchiveTarget(null);
    }
  };

  const handleRestore = async (namespace: NamespaceDTO) => {
    setActionNamespaceId(namespace.id);
    try {
      await store.restoreNamespace(namespace.id, filters);
      pushNotification({
        tone: 'info',
        title: 'Namespace restored',
        detail: `${namespace.name} is active again.`,
      });
    } catch (error) {
      if (isNamespaceConflictError(error)) {
        await store.loadNamespaces(filters);
        pushNotification({
          tone: 'warning',
          title: 'Namespace already active',
          detail: 'The namespace state was refreshed.',
        });
      } else {
        pushNotification({
          tone: 'error',
          title: 'Restore failed',
          detail: namespaceErrorMessage(error, 'Restore failed - please try again'),
        });
      }
    } finally {
      setActionNamespaceId(null);
    }
  };

  const retryDetail = () => {
    if (detailTargetId) {
      void openDetail(detailTargetId);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="app-surface-strong border-b app-border-subtle px-6 py-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold app-text-strong">Namespaces</h1>
            <p className="text-sm app-text-muted mt-1">
              Manage namespace inventory, status, and ownership boundaries.
            </p>
          </div>
          {permissions.canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              New Namespace
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 app-text-faint" />
            <Input
              placeholder="Search namespaces..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {([
              ['all', 'All'],
              ['active', 'Active'],
              ['archived', 'Archived'],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                variant={statusFilter === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {refreshing && (
          <div className="mb-3 flex items-center gap-2 text-xs app-text-muted" role="status">
            <Loader2 size={12} className="animate-spin" />
            Refreshing namespaces
          </div>
        )}

        {store.loadState === 'error' ? (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <div className="font-semibold mb-1">Failed to load namespaces</div>
            <p className="mb-3">{store.errorMessage}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void store.loadNamespaces(filters)}>
              <RefreshCw size={14} />
              Retry
            </Button>
          </div>
        ) : initialLoading ? (
          <LoadingGrid />
        ) : store.namespaces.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={hasFilters ? 'No namespaces match' : 'No namespaces yet'}
            description={
              hasFilters
                ? 'Try different keywords or status filters.'
                : 'Create your first namespace to start managing tenancy boundaries.'
            }
            actionLabel={hasFilters ? 'Clear filters' : permissions.canCreate ? 'Create your first namespace' : undefined}
            onAction={hasFilters ? handleClearFilters : permissions.canCreate ? () => setCreateOpen(true) : undefined}
          />
        ) : (
          <>
            <div className="mb-4 text-xs app-text-muted">
              Showing {store.namespaces.length} of {store.total} namespaces
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {store.namespaces.map((namespace) => {
                const busy = actionNamespaceId === namespace.id;
                return (
                  <Card key={namespace.id} className="p-5 hover:app-surface-hover transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-cyan-700 flex items-center justify-center text-white font-bold flex-shrink-0">
                          {namespace.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              type="button"
                              className="font-semibold app-text-strong truncate text-left hover:underline"
                              onClick={() => void openDetail(namespace.id)}
                            >
                              {namespace.name}
                            </button>
                            <NamespaceStatusBadge status={namespace.status} />
                          </div>
                          <p className="text-xs font-mono app-text-faint mb-1">{namespace.slug}</p>
                          <p className="text-xs app-text-muted line-clamp-2">
                            {namespace.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label={`Actions for ${namespace.name}`}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={14} />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void openDetail(namespace.id)}>
                            <ExternalLink size={14} className="mr-2" />
                            Open Namespace
                          </DropdownMenuItem>
                          {permissions.canEdit && (
                            <DropdownMenuItem
                              onSelect={() => {
                                void openDetail(namespace.id, true);
                              }}
                            >
                              <Edit size={14} className="mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                          )}
                          {permissions.canArchive && (
                            <>
                              <DropdownMenuSeparator />
                              {namespace.status === 'active' ? (
                                <DropdownMenuItem onSelect={() => setArchiveTarget(namespace)}>
                                  <Archive size={14} className="mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void handleRestore(namespace)}>
                                  <RotateCcw size={14} className="mr-2" />
                                  Restore
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2 rounded app-surface-strong">
                        <Briefcase size={12} className="app-text-muted mx-auto mb-1" />
                        <div className="text-lg font-bold app-text-strong">{namespace.team_count}</div>
                        <div className="text-[10px] app-text-faint">Teams</div>
                      </div>
                      <div className="text-center p-2 rounded app-surface-strong">
                        <Users size={12} className="app-text-muted mx-auto mb-1" />
                        <div className="text-lg font-bold app-text-strong">{namespace.member_count}</div>
                        <div className="text-[10px] app-text-faint">Members</div>
                      </div>
                      <div className="text-center p-2 rounded app-surface-strong">
                        <Calendar size={12} className="app-text-muted mx-auto mb-1" />
                        <div className="text-[10px] font-mono app-text-strong">
                          {formatDate(namespace.created_at)}
                        </div>
                        <div className="text-[10px] app-text-faint">Created</div>
                      </div>
                    </div>

                    <div className="pt-3 border-t app-border-subtle flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => void openDetail(namespace.id)}>
                        <ExternalLink size={12} />
                        Open
                      </Button>
                      {permissions.canEdit && (
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => void openDetail(namespace.id, true)}>
                          <Edit size={12} />
                          Edit
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </ScrollArea>

      <CreateNamespaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />

      <NamespaceDetailDrawer
        open={drawerOpen}
        namespace={store.selectedNamespace}
        loading={store.detailLoadState === 'loading'}
        errorMessage={store.detailErrorMessage}
        canEdit={permissions.canEdit}
        canArchive={permissions.canArchive}
        onClose={() => {
          setDrawerOpen(false);
          setDetailTargetId(null);
          setDetailEditTargetId(null);
          store.clearSelectedNamespace();
        }}
        onRetry={retryDetail}
        onSave={handleUpdate}
        onArchive={setArchiveTarget}
        onRestore={handleRestore}
        editTargetId={detailEditTargetId}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
        title="Archive this namespace?"
        description="It will become read-only but can be restored."
        variant="destructive"
        confirmLabel="Archive"
        cancelLabel="Cancel"
        onConfirm={() => {
          void handleArchiveConfirmed();
        }}
      />
    </div>
  );
};
