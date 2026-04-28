import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAttachment, ChatConversation, ChatMessagePageResponse } from '@/api/api-client';
import { fileToPendingAttachment, pendingToPayload, type PendingChatAttachment } from '@/features/chat/chat-attachments';
import type { MemberFixture, TeamGroupFixture } from '@/features/members/member-page-model';
import { normalizeTeamsAndMembers } from '@/features/members/member-page-model';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppShell, type RealtimeStatus } from '@/state/app-shell-store';
import {
  filterMentionCandidates,
  parseActiveMention
} from '@/pages/chat/chat-mentions';
import { AuthContext } from '@/auth/AuthProvider';
import { MessageMarkdown } from '@/features/chat/MessageMarkdown';
import { TypingIndicator } from '@/features/chat/TypingIndicator';
import { StatusDot } from '@/components/ui/status-dot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Paperclip,
  Send,
  Plus,
  Hash,
  Users,
  MessageSquare,
  Search,
  MoreVertical,
  Pin,
  Check,
  Clock,
  X,
  Zap,
  BarChart3,
  Image as ImageIcon,
  File as FileIcon,
  Slash,
} from 'lucide-react';

type ChatPageRealtimeState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'degraded';
type ComposerStatus = 'idle' | 'sending' | 'failed';

export type ChatPageFeedbackOverride = {
  composerErrorMessage?: string | null;
  composerStatus?: ComposerStatus;
  isSwitchingConversation?: boolean;
};

type ConversationRouteItem = {
  id: string;
  preview: string;
  title: string;
  unreadCount: number;
  convType: string;
};

type MessageRouteItem = {
  content: string;
  id: string;
  senderId: string;
  status: string;
  createdAt?: number;
  attachments?: ChatAttachment[];
};

type ChatPageRouteModel = {
  activeConversationId: string | null;
  composer: {
    disabled: boolean;
    status: ComposerStatus;
  };
  conversations: ConversationRouteItem[];
  messages: MessageRouteItem[];
  pageNotice: {
    code: 'switching' | 'composer-failed' | 'idle' | 'connecting' | 'reconnecting' | 'degraded' | 'live';
    tone: 'live' | 'muted' | 'pending' | 'warning' | 'danger';
  };
  realtime: {
    detail: string;
    state: ChatPageRealtimeState;
  };
  workspaceId: string;
};

type ChatRouteData = {
  conversationItems: ChatConversation[];
  messagePage: ChatMessagePageResponse;
};

type ChatRealtimeEvent = {
  body?: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  status?: string;
};

type ChatCommandDefinition = {
  id: string;
  trigger: string;
  title: string;
  description: string;
  template: string;
  sendAs?: string;
};

const chatCommands: ChatCommandDefinition[] = [
  {
    id: 'help',
    trigger: '/help',
    title: 'Help',
    description: 'Show the available chat commands.',
    template: '/help',
    sendAs: 'List the available workspace chat commands and briefly explain when to use each one.'
  },
  {
    id: 'status',
    trigger: '/status',
    title: 'Workspace Status',
    description: 'Ask agents for current tasks, blockers, nodes, and terminals.',
    template: '/status',
    sendAs: 'Summarize current workspace status: active agents, running tasks, terminal sessions, nodes, blockers, and next actions.'
  },
  {
    id: 'terminal',
    trigger: '/terminal',
    title: 'Terminal Command',
    description: 'Route a shell command to an agent terminal.',
    template: '/terminal @agent <command>'
  },
  {
    id: 'assign',
    trigger: '/assign',
    title: 'Assign Task',
    description: 'Assign work to an agent or team member.',
    template: '/assign @agent <task>'
  },
  {
    id: 'roadmap',
    trigger: '/roadmap',
    title: 'Roadmap',
    description: 'Create or update a roadmap item.',
    template: '/roadmap add <title>'
  },
  {
    id: 'task',
    trigger: '/task',
    title: 'Queue Task',
    description: 'Create a queue-backed task.',
    template: '/task create <title>'
  },
  {
    id: 'summarize',
    trigger: '/summarize',
    title: 'Summarize Thread',
    description: 'Ask for a concise summary of the current conversation.',
    template: '/summarize',
    sendAs: 'Summarize this conversation with decisions, open questions, blockers, and next actions.'
  }
];

const parseActiveCommand = (draft: string, caretPos: number) => {
  const beforeCaret = draft.slice(0, caretPos);
  if (!beforeCaret.startsWith('/')) return null;
  if (beforeCaret.includes('\n')) return null;
  const match = beforeCaret.match(/^\/([^\s]*)$/);
  if (!match) return null;
  return {
    query: match[1]?.toLowerCase() ?? '',
    start: 0,
    end: caretPos
  };
};

const resolveCommandSendText = (draft: string) => {
  const trimmed = draft.trim();
  const command = chatCommands.find((item) => item.trigger === trimmed);
  return command?.sendAs ?? trimmed;
};

const mapShellRealtimeState = (status: RealtimeStatus): ChatPageRealtimeState => {
  switch (status) {
    case 'connected':
      return 'live';
    case 'connecting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    case 'idle':
      return 'idle';
    case 'stale':
    case 'disconnected':
    default:
      return 'degraded';
  }
};

const buildPageNotice = ({
  composerStatus,
  isSwitchingConversation,
  realtimeState
}: {
  composerStatus: ComposerStatus;
  isSwitchingConversation: boolean;
  realtimeState: ChatPageRealtimeState;
}): ChatPageRouteModel['pageNotice'] => {
  if (isSwitchingConversation) {
    return {
      code: 'switching',
      tone: 'pending'
    };
  }

  if (composerStatus === 'failed') {
    return {
      code: 'composer-failed',
      tone: 'danger'
    };
  }

  switch (realtimeState) {
    case 'idle':
      return {
        code: 'idle',
        tone: 'muted'
      };
    case 'connecting':
      return {
        code: 'connecting',
        tone: 'pending'
      };
    case 'reconnecting':
      return {
        code: 'reconnecting',
        tone: 'warning'
      };
    case 'degraded':
      return {
        code: 'live',
        tone: 'live'
      };
    case 'live':
    default:
      return {
        code: 'live',
        tone: 'live'
      };
  }
};

export const buildChatPageRouteModel = ({
  composerErrorMessage = null,
  composerStatus = 'idle',
  conversationItems,
  isSwitchingConversation = false,
  messagePage,
  realtimeDetail,
  realtimeStatus,
  workspaceId,
  activeConversationIdOverride
}: {
  composerErrorMessage?: string | null;
  composerStatus?: ComposerStatus;
  conversationItems: ChatConversation[];
  isSwitchingConversation?: boolean;
  messagePage: ChatMessagePageResponse;
  realtimeDetail: string;
  realtimeStatus: RealtimeStatus;
  workspaceId: string;
  activeConversationIdOverride?: string | null;
}): ChatPageRouteModel => {
  const conversations = conversationItems.map((conversation) => ({
    id: conversation.id,
    preview: conversation.lastMessagePreview ?? '',
    title: conversation.customName ?? conversation.id,
    unreadCount: conversation.unreadCount ?? 0,
    convType: conversation.type ?? 'channel'
  }));
  const activeConversationId = activeConversationIdOverride ?? conversations[0]?.id ?? null;
  const messages = (messagePage.items ?? []).map((message) => ({
    content: message.content?.text ?? '',
    id: message.id,
    senderId: message.senderId ?? 'unknown',
    status: message.status ?? 'sent',
    createdAt: message.createdAt,
    attachments: message.attachments
  }));
  const realtimeState = mapShellRealtimeState(realtimeStatus);
  const composerDisabled =
    activeConversationId === null ||
    isSwitchingConversation ||
    composerStatus === 'sending';

  return {
    activeConversationId,
    composer: {
      disabled: composerDisabled,
      status: composerStatus
    },
    conversations,
    messages,
    pageNotice: buildPageNotice({
      composerStatus,
      isSwitchingConversation,
      realtimeState
    }),
    realtime: {
      detail: realtimeDetail,
      state: realtimeState
    },
    workspaceId
  };
};

export const loadChatRouteData = async (apiClient: {
  getConversations: () => Promise<{ conversations: ChatConversation[] }>;
  getMessages: (conversationId: string) => Promise<ChatMessagePageResponse>;
}): Promise<ChatRouteData> => {
  const conversationsResponse = await apiClient.getConversations();
  const conversationItems = conversationsResponse.conversations;
  const activeConversationId = conversationItems[0]?.id ?? null;
  const messagePage =
    activeConversationId === null ? { items: [], nextBeforeId: null } : await apiClient.getMessages(activeConversationId);

  return {
    conversationItems,
    messagePage
  };
};

const chatNoticeCopy = (
  code: ChatPageRouteModel['pageNotice']['code'],
  t: (k: string) => string,
  composerError: string | null
) => {
  if (code === 'composer-failed') {
    return composerError ?? t('chat.composerFailedDefault');
  }
  switch (code) {
    case 'switching':
      return t('chat.notice.switching');
    case 'idle':
      return t('chat.notice.idle');
    case 'connecting':
      return t('chat.notice.connecting');
    case 'reconnecting':
      return t('chat.notice.reconnecting');
    case 'degraded':
      return t('chat.notice.degraded');
    case 'live':
    default:
      return t('chat.notice.live');
  }
};

/** Format a unix-ms timestamp to a short time string. */
const formatTime = (ts?: number) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const groupConversations = (items: ChatConversation[]) => {
  const channels: ChatConversation[] = [];
  const dms: ChatConversation[] = [];
  const teams: ChatConversation[] = [];
  for (const c of items) {
    const typ = (c.type ?? 'channel').toLowerCase();
    if (typ === 'direct') {
      dms.push(c);
    } else if (typ === 'team') {
      teams.push(c);
    } else {
      channels.push(c);
    }
  }
  return { channels, dms, teams };
};

const buildDisplayMaps = (members: MemberFixture[], teamGroups: TeamGroupFixture[]) => {
  const memberById = new Map<string, string>();
  for (const m of members) {
    memberById.set(m.memberId, m.displayName ?? m.memberId);
  }
  const teamById = new Map<string, string>();
  for (const t of teamGroups) {
    teamById.set(t.teamId, t.name ?? t.teamId);
  }
  return { memberById, teamById };
};

const isAssistantRuntimeMember = (member: MemberFixture) =>
  Boolean(member.agentInstanceId || member.agentRuntimeState || member.runtimeReady || member.terminalId);

const conversationTitle = (
  c: ChatConversation,
  memberById: Map<string, string>,
  teamById: Map<string, string>,
  currentMemberId?: string
): string => {
  if (c.customName) return c.customName;
  if (c.type === 'direct' && c.memberIds?.length) {
    const other = c.memberIds.find((id) => id !== (currentMemberId ?? '')) ?? c.memberIds[0];
    return memberById.get(other ?? '') ?? other ?? c.id;
  }
  if (c.type === 'team' && c.teamId) {
    return teamById.get(c.teamId) ?? c.teamId;
  }
  return c.id;
};

const conversationTimestamp = (conversation: ChatConversation) => {
  const candidate = (conversation as ChatConversation & { lastMessageAt?: number }).lastMessageAt;
  return typeof candidate === 'number' ? candidate : 0;
};

const conversationParticipantCount = (conversation: ChatConversation) => {
  if (conversation.type === 'team') return undefined;
  return conversation.memberIds?.length;
};

const teamVisual = (teamName?: string | null) => {
  const label = (teamName ?? '').toLowerCase();
  if (!label || label === 'all') return { icon: '🏢', tone: 'all' };
  if (label.includes('backend')) return { icon: '⚙️', tone: 'backend' };
  if (label.includes('frontend')) return { icon: '🎨', tone: 'frontend' };
  if (label.includes('qa')) return { icon: '🧪', tone: 'qa' };
  if (label.includes('ops') || label.includes('infra')) return { icon: '🚀', tone: 'devops' };
  return { icon: '🏷', tone: 'default' };
};

const getConvTypeIcon = (type: string) => {
  switch (type) {
    case 'direct':
      return <MessageSquare size={14} />;
    case 'group':
      return <Users size={14} />;
    case 'team':
      return <Zap size={14} />;
    default:
      return <Hash size={14} />;
  }
};

const noticeToneBg: Record<string, string> = {
  live: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  muted: 'bg-zinc-200/60 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  warning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const ChatPage = ({ feedbackOverride }: { feedbackOverride?: ChatPageFeedbackOverride }) => {
  const { t } = useI18n();
  const { apiClient, realtime, realtimeClient, workspace } = useAppShell();
  const { account } = useContext(AuthContext) ?? { account: null };
  const SESSION_SENDER_ID = account?.memberId ?? 'owner_1';
  const [conversationItems, setConversationItems] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messagePage, setMessagePage] = useState<ChatMessagePageResponse>({ items: [], nextBeforeId: null });
  const [composerState, setComposerState] = useState<{
    errorMessage: string | null;
    status: ComposerStatus;
  }>({
    errorMessage: feedbackOverride?.composerErrorMessage ?? null,
    status: feedbackOverride?.composerStatus ?? 'idle'
  });
  const [composerText, setComposerText] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [rosterMembers, setRosterMembers] = useState<MemberFixture[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroupFixture[]>([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [threadQuery, setThreadQuery] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [commandIndex, setCommandIndex] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const { memberById, teamById } = useMemo(
    () => buildDisplayMaps(rosterMembers, teamGroups),
    [rosterMembers, teamGroups]
  );

  const mentionActive = useMemo(() => parseActiveMention(composerText, caretPos), [composerText, caretPos]);
  const commandActive = useMemo(() => parseActiveCommand(composerText, caretPos), [composerText, caretPos]);

  const commandCandidates = useMemo(() => {
    if (!commandActive) return [];
    return chatCommands.filter((command) => {
      const query = commandActive.query;
      return (
        query.length === 0 ||
        command.trigger.slice(1).includes(query) ||
        command.title.toLowerCase().includes(query) ||
        command.description.toLowerCase().includes(query)
      );
    });
  }, [commandActive]);

  const mentionCandidates = useMemo(() => {
    if (!mentionActive || commandActive) return [];
    return filterMentionCandidates(rosterMembers, teamGroups, mentionActive.query);
  }, [mentionActive, commandActive, rosterMembers, teamGroups]);

  const mentionMenuOpen = Boolean(mentionActive && mentionCandidates.length > 0);
  const commandMenuOpen = Boolean(commandActive && commandCandidates.length > 0);

  useEffect(() => {
    if (mentionIndex >= mentionCandidates.length) {
      setMentionIndex(0);
    }
  }, [mentionCandidates.length, mentionIndex]);

  useEffect(() => {
    if (commandIndex >= commandCandidates.length) {
      setCommandIndex(0);
    }
  }, [commandCandidates.length, commandIndex]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagePage.items.length]);

  // Initial data load
  useEffect(() => {
    let cancelled = false;

    void Promise.all([loadChatRouteData(apiClient), apiClient.getMembers()])
      .then(([data, membersPayload]) => {
        if (cancelled) return;
        setConversationItems(data.conversationItems);
        const firstId = data.conversationItems[0]?.id ?? null;
        setActiveConvId(firstId);
        setMessagePage(data.messagePage);
        const normalized = normalizeTeamsAndMembers(membersPayload as Record<string, unknown>);
        setRosterMembers(normalized.members);
        setTeamGroups(normalized.teamGroups);
      });

    return () => { cancelled = true; };
  }, [apiClient]);

  // Sync feedbackOverride
  useEffect(() => {
    setComposerState({
      errorMessage: feedbackOverride?.composerErrorMessage ?? null,
      status: feedbackOverride?.composerStatus ?? 'idle'
    });
  }, [feedbackOverride?.composerErrorMessage, feedbackOverride?.composerStatus]);

  // Realtime events
  useEffect(() => {
    const subscription = realtimeClient.subscribe<ChatRealtimeEvent>('chat', (event) => {
      if (event.type === 'chat.delta' && event.payload?.messageId) {
        if (event.payload.conversationId && event.payload.conversationId !== activeConvId) {
          void apiClient.getConversations().then((response) => setConversationItems(response.conversations)).catch(() => undefined);
          return;
        }
        setMessagePage((current) => ({
          ...current,
          items: current.items.some((item) => item.id === event.payload?.messageId)
            ? current.items
            : [
              ...current.items,
              {
                id: event.payload.messageId ?? `msg_${Date.now()}`,
                senderId: event.payload.senderId ?? 'unknown',
              content: { type: 'text', text: event.payload.body ?? '' },
              createdAt: Date.now(),
              status: 'sent'
              }
            ]
        }));
      }

      if (event.type === 'chat.status' && event.payload?.messageId && event.payload?.status) {
        setMessagePage((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === event.payload?.messageId ? { ...item, status: event.payload.status } : item
          )
        }));
        if (event.payload.status === 'failed') {
          setComposerState({
            errorMessage: 'Message delivery failed. Retry after connection recovery.',
            status: 'failed'
          });
        }
      }
    });

    return () => { subscription.unsubscribe(); };
    const updatedSubscription = realtimeClient.subscribe<ChatRealtimeEvent>('chat.updated', () => {
      void apiClient.getConversations().then((response) => setConversationItems(response.conversations)).catch(() => undefined);
    });

    return () => {
      subscription.unsubscribe();
      updatedSubscription.unsubscribe();
    };
  }, [activeConvId, apiClient, realtimeClient]);

  /** Switch to a different conversation. */
  const switchConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConvId) return;
    setIsSwitching(true);
    setActiveConvId(conversationId);
    try {
      const page = await apiClient.getMessages(conversationId);
      setMessagePage(page);
    } finally {
      setIsSwitching(false);
    }
  }, [activeConvId, apiClient]);

  const openDmForMember = useCallback(
    async (memberId: string) => {
      setCreateError(null);
      try {
        const { conversation } = await apiClient.createConversation({ type: 'direct', memberId });
        setConversationItems((prev) => {
          const i = prev.findIndex((c) => c.id === conversation.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { ...next[i], ...conversation };
            return next;
          }
          return [conversation, ...prev];
        });
        setNewChatOpen(false);
        await switchConversation(conversation.id);
      } catch (e) {
        setCreateError(t('chat.createError', { message: e instanceof Error ? e.message : String(e) }));
      }
    },
    [apiClient, switchConversation, t]
  );

  const openTeamChannel = useCallback(
    async (teamId: string) => {
      setCreateError(null);
      try {
        const { conversation } = await apiClient.createConversation({ type: 'team', teamId });
        setConversationItems((prev) => {
          const i = prev.findIndex((c) => c.id === conversation.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { ...next[i], ...conversation };
            return next;
          }
          return [conversation, ...prev];
        });
        setNewChatOpen(false);
        await switchConversation(conversation.id);
      } catch (e) {
        setCreateError(t('chat.createError', { message: e instanceof Error ? e.message : String(e) }));
      }
    },
    [apiClient, switchConversation, t]
  );

  const addPendingFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setAttachError(null);
      const next: PendingChatAttachment[] = [];
      for (let i = 0; i < list.length; i++) {
        try {
          next.push(await fileToPendingAttachment(list[i]));
        } catch (e) {
          if (e instanceof Error && e.message === 'file_too_large') {
            setAttachError(t('chat.fileTooLarge'));
          } else {
            setAttachError(e instanceof Error ? e.message : String(e));
          }
        }
      }
      if (next.length) {
        setPendingAttachments((prev) => [...prev, ...next]);
      }
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [t]
  );

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Send a message via the API. */
  const sendMessage = useCallback(async () => {
    const text = resolveCommandSendText(composerText);
    const payloads = pendingAttachments.map(pendingToPayload);
    if ((!text && payloads.length === 0) || !activeConvId) return;

    setComposerState({ errorMessage: null, status: 'sending' });

    // Optimistic: append the message locally before the API responds
    const optimisticId = `local_${Date.now()}`;
    const optimisticAttachments: ChatAttachment[] = payloads.map((p) => ({
      kind: p.kind,
      name: p.name,
      mimeType: p.mimeType,
      size: p.size,
      dataUrl: p.dataUrl
    }));
    setMessagePage((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: optimisticId,
          senderId: SESSION_SENDER_ID,
          content: { type: 'text', text },
          createdAt: Date.now(),
          status: 'sending',
          attachments: optimisticAttachments.length ? optimisticAttachments : undefined
        }
      ]
    }));
    setComposerText('');
    setPendingAttachments([]);

    try {
      const response = await apiClient.sendMessage(activeConvId, {
        senderId: SESSION_SENDER_ID,
        content: { type: 'text', text },
        isAI: false,
        attachments: payloads.length ? payloads : undefined
      });
      const saved = response.message;
      setMessagePage((current) => ({
        ...current,
        items: saved
          ? [
              ...current.items.filter((m) => m.id !== optimisticId && m.id !== saved.id),
              saved
            ]
          : current.items.map((m) => (m.id === optimisticId ? { ...m, status: 'sent' } : m))
      }));
      if (saved) {
        setConversationItems((current) => current.map((conversation) =>
          conversation.id === activeConvId
            ? {
                ...conversation,
                lastMessagePreview: saved.content?.text ?? conversation.lastMessagePreview,
                lastMessageAt: saved.createdAt
              } as ChatConversation
            : conversation
        ));
      }
      setComposerState({ errorMessage: null, status: 'idle' });
    } catch (err) {
      // Mark message as failed and show error
      setMessagePage((current) => ({
        ...current,
        items: current.items.map((m) =>
          m.id === optimisticId ? { ...m, status: 'failed' } : m
        )
      }));
      setComposerState({
        errorMessage: err instanceof Error ? err.message : 'Send failed',
        status: 'failed'
      });
    }
  }, [composerText, pendingAttachments, activeConvId, apiClient, SESSION_SENDER_ID]);

  const applyCommand = useCallback(
    (command: ChatCommandDefinition) => {
      const ta = textareaRef.current;
      const active = parseActiveCommand(composerText, caretPos);
      const before = active ? composerText.slice(0, active.start) : '';
      const after = active ? composerText.slice(active.end) : composerText;
      const next = `${before}${command.template}${command.template.endsWith(' ') ? '' : ' '}${after}`;
      const pos = before.length + command.template.length + (command.template.endsWith(' ') ? 0 : 1);
      setComposerText(next);
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(pos, pos);
        setCaretPos(pos);
      });
      setCommandIndex(0);
    },
    [composerText, caretPos]
  );

  const insertCommandSlash = useCallback(() => {
    if (!activeConvId || composerState.status === 'sending') return;
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? composerText.length;
    const end = ta?.selectionEnd ?? start;
    const prefix = start === 0 ? '' : composerText[start - 1] === '\n' ? '' : '\n';
    const next = `${composerText.slice(0, start)}${prefix}/${composerText.slice(end)}`;
    const pos = start + prefix.length + 1;
    setComposerText(next);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
      setCaretPos(pos);
    });
  }, [activeConvId, composerState.status, composerText]);

  const applyMention = useCallback(
    (insertText: string) => {
      const ta = textareaRef.current;
      const active = parseActiveMention(composerText, caretPos);
      if (!active) return;
      const end = ta?.selectionStart ?? caretPos;
      const before = composerText.slice(0, active.start);
      const after = composerText.slice(end);
      const next = `${before}@${insertText} ${after}`;
      setComposerText(next);
      const pos = before.length + insertText.length + 2;
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(pos, pos);
        setCaretPos(pos);
      });
      setMentionIndex(0);
    },
    [composerText, caretPos]
  );

  const cancelMention = useCallback(() => {
    const ta = textareaRef.current;
    const active = parseActiveMention(composerText, caretPos);
    if (!active) return;
    const end = ta?.selectionStart ?? caretPos;
    const before = composerText.slice(0, active.start);
    const after = composerText.slice(end);
    setComposerText(before + after);
    const pos = active.start;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
      setCaretPos(pos);
    });
  }, [composerText, caretPos]);

  /** Handle Enter key in composer (Shift+Enter for newline). */
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) {
        return;
      }

      if (commandMenuOpen && commandCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandIndex((i) => (i + 1) % commandCandidates.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandIndex((i) => (i - 1 + commandCandidates.length) % commandCandidates.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const pick = commandCandidates[commandIndex];
          if (pick) applyCommand(pick);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setCommandIndex(0);
          return;
        }
      }

      if (mentionMenuOpen && mentionCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % mentionCandidates.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const pick = mentionCandidates[mentionIndex];
          if (pick) applyMention(pick.insertText);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelMention();
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void sendMessage();
      }
    },
    [
      commandMenuOpen,
      commandCandidates,
      commandIndex,
      applyCommand,
      mentionMenuOpen,
      mentionCandidates,
      mentionIndex,
      applyMention,
      cancelMention,
      sendMessage
    ]
  );

  /** Retry sending after a failure -- reset composer state. */
  const handleRetry = useCallback(() => {
    setComposerState({ errorMessage: null, status: 'idle' });
  }, []);

  const model = buildChatPageRouteModel({
    composerErrorMessage: composerState.errorMessage,
    composerStatus: composerState.status,
    conversationItems,
    isSwitchingConversation: isSwitching || feedbackOverride?.isSwitchingConversation,
    messagePage,
    realtimeDetail: realtime.detail,
    realtimeStatus: realtime.status,
    workspaceId: workspace.workspaceId,
    activeConversationIdOverride: activeConvId
  });

  const noticeMessage = useMemo(
    () => chatNoticeCopy(model.pageNotice.code, t, composerState.errorMessage),
    [model.pageNotice.code, t, composerState.errorMessage]
  );

  const filteredConversations = useMemo(() => {
    const query = threadQuery.trim().toLowerCase();
    return conversationItems
      .filter((conversation) => {
        const title = conversationTitle(conversation, memberById, teamById, SESSION_SENDER_ID).toLowerCase();
        const preview = (conversation.lastMessagePreview ?? '').toLowerCase();
        const teamMatches =
          teamFilter === 'all' ||
          conversation.teamId === teamFilter ||
          (teamFilter === 'direct' && conversation.type === 'direct') ||
          (teamFilter === 'channel' && conversation.type === 'channel');
        const queryMatches = query.length === 0 || title.includes(query) || preview.includes(query);
        return teamMatches && queryMatches;
      })
      .sort((left, right) => {
        const leftPinned = Number(Boolean((left as ChatConversation & { pinned?: boolean }).pinned || left.isDefault));
        const rightPinned = Number(Boolean((right as ChatConversation & { pinned?: boolean }).pinned || right.isDefault));
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const unreadDelta = (right.unreadCount ?? 0) - (left.unreadCount ?? 0);
        if (unreadDelta !== 0) return unreadDelta;
        const timeDelta = conversationTimestamp(right) - conversationTimestamp(left);
        if (timeDelta !== 0) return timeDelta;
        return conversationTitle(left, memberById, teamById, SESSION_SENDER_ID).localeCompare(
          conversationTitle(right, memberById, teamById, SESSION_SENDER_ID)
        );
      });
  }, [conversationItems, memberById, teamById, SESSION_SENDER_ID, teamFilter, threadQuery]);

  const pinnedConversations = useMemo(
    () => filteredConversations.filter((conversation) => (conversation as ChatConversation & { pinned?: boolean }).pinned || conversation.isDefault || (conversation.unreadCount ?? 0) > 0),
    [filteredConversations]
  );
  const nonPinnedConversations = useMemo(
    () => filteredConversations.filter((conversation) => !pinnedConversations.some((item) => item.id === conversation.id)),
    [filteredConversations, pinnedConversations]
  );

  const activeConversation = useMemo(
    () => conversationItems.find((c) => c.id === activeConvId) ?? null,
    [conversationItems, activeConvId]
  );

  const activeHeaderTitle = activeConversation
    ? conversationTitle(activeConversation, memberById, teamById, SESSION_SENDER_ID)
    : model.activeConversationId ?? t('chat.noConversation');

  const activeParticipants = useMemo(() => {
    if (!activeConversation) return [];

    if (activeConversation.type === 'team' && activeConversation.teamId) {
      const team = teamGroups.find((group) => group.teamId === activeConversation.teamId);
      return team?.members ?? [];
    }

    if (activeConversation.memberIds?.length) {
      return rosterMembers.filter((member) => activeConversation.memberIds?.includes(member.memberId));
    }

    return [];
  }, [activeConversation, rosterMembers, teamGroups]);

  const participantMessageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of model.messages) {
      counts.set(message.senderId, (counts.get(message.senderId) ?? 0) + 1);
    }
    return activeParticipants
      .map((member) => ({
        member,
        count: counts.get(member.memberId) ?? 0
      }))
      .sort((a, b) => b.count - a.count || (a.member.displayName ?? a.member.memberId).localeCompare(b.member.displayName ?? b.member.memberId));
  }, [activeParticipants, model.messages]);

  const activeConversationStats = useMemo(() => {
    const imageCount = model.messages.reduce((sum, message) => sum + (message.attachments?.length ?? 0), 0);
    const agentCount = activeParticipants.filter(isAssistantRuntimeMember).length;
    const humanCount = Math.max(activeParticipants.length - agentCount, 0);
    return {
      participantCount: activeParticipants.length,
      messageCount: model.messages.length,
      attachmentCount: imageCount,
      agentCount,
      humanCount
    };
  }, [activeParticipants, model.messages]);

  const activeAssistantTargets = useMemo(
    () => activeParticipants.filter(isAssistantRuntimeMember),
    [activeParticipants]
  );

  const selectedTeamMeta = useMemo(() => {
    if (teamFilter === 'all') return { icon: '🏢', label: 'All Teams' };
    if (teamFilter === 'direct') return { icon: '💬', label: 'Direct Messages' };
    if (teamFilter === 'channel') return { icon: '#', label: 'Channels' };
    const visual = teamVisual(teamById.get(teamFilter) ?? teamFilter);
    return { icon: visual.icon, label: teamById.get(teamFilter) ?? teamFilter };
  }, [teamById, teamFilter]);

  const renderConversationButton = (c: ChatConversation) => {
    const title = conversationTitle(c, memberById, teamById, SESSION_SENDER_ID);
    const active = c.id === model.activeConversationId;
    const pinned = Boolean((c as ChatConversation & { pinned?: boolean }).pinned || c.isDefault);
    const convType = c.type ?? 'channel';

    return (
      <button
        key={c.id}
        type="button"
        className={`w-full text-left px-3 py-2 rounded-lg transition-all mb-1 ${
          active
            ? 'app-bg-surface shadow-sm'
            : 'hover:app-bg-hover'
        }`}
        onClick={() => void switchConversation(c.id)}
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-lg ${pinned ? 'bg-gradient-to-br from-cyan-500 to-teal-600' : 'app-bg-surface-subtle'} flex items-center justify-center ${pinned ? 'text-white' : 'app-text-muted'} flex-shrink-0 mt-0.5`}>
            {getConvTypeIcon(convType)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="font-semibold text-sm app-text-strong truncate">
                  {title}
                </span>
                {pinned && <Pin size={10} className="text-yellow-600 flex-shrink-0" />}
              </div>
              {(c.unreadCount ?? 0) > 0 && (
                <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 h-4 ml-1.5">
                  {c.unreadCount}
                </Badge>
              )}
            </div>
            <div className="text-xs app-text-muted truncate">{c.lastMessagePreview ?? ''}</div>
            <div className="text-[10px] app-text-faint mt-0.5">{formatTime(conversationTimestamp(c)) || ''}</div>
          </div>
        </div>
      </button>
    );
  };

  const renderMessageStatus = (status: string) => {
    switch (status) {
      case 'sending':
        return (
          <div className="flex items-center gap-1 text-[10px] app-text-faint">
            <Clock className="size-3" />
            Sending...
          </div>
        );
      case 'queued':
        return (
          <div className="flex items-center gap-1 text-[10px] text-amber-600">
            <Clock className="size-3" />
            Queued to assistant
          </div>
        );
      case 'delivered':
        return (
          <div className="flex items-center gap-1 text-[10px] text-green-600">
            <Check className="size-3" />
            Delivered
          </div>
        );
      case 'sent':
        return (
          <div className="flex items-center gap-1 text-[10px] text-green-600">
            <Check className="size-3" />
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1 text-[10px] text-red-600">
            <X className="size-3" />
            Failed
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col" data-route-page="chat" data-page-notice={model.pageNotice.code}>
      {/* Page-level notice banner */}
      {model.pageNotice.code !== 'live' && (
        <div className={`shrink-0 px-4 py-1.5 text-xs text-center ${noticeToneBg[model.pageNotice.tone] ?? ''}`}>
          {noticeMessage}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
      {/* Left Sidebar: Conversations */}
      <div className="w-72 border-r app-border-subtle flex flex-col app-bg-canvas min-h-0">
        {/* Team Switcher */}
        <div className="p-3 border-b app-border-subtle app-surface-strong">
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-9">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <span>{selectedTeamMeta.icon}</span>
                  <span className="font-medium text-sm">{selectedTeamMeta.label}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <span>🏢</span>
                  <span>All Teams</span>
                </div>
              </SelectItem>
              <SelectItem value="channel">
                <div className="flex items-center gap-2">
                  <span>#</span>
                  <span>Channels</span>
                </div>
              </SelectItem>
              <SelectItem value="direct">
                <div className="flex items-center gap-2">
                  <span>💬</span>
                  <span>Direct Messages</span>
                </div>
              </SelectItem>
              {teamGroups.map((group) => (
                <SelectItem key={group.teamId} value={group.teamId}>
                  <div className="flex items-center gap-2">
                    <span>{teamVisual(group.name ?? group.teamId).icon}</span>
                    <span>{group.name ?? group.teamId}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="w-full mt-2 app-accent-bg hover:opacity-90 text-white h-8"
            size="sm"
            onClick={() => {
              setNewChatOpen((o) => !o);
              setCreateError(null);
            }}
          >
            <Plus size={14} className="mr-1.5" />
            New Chat
          </Button>
        </div>

        {/* New Chat Panel */}
        {newChatOpen && (
          <div className="p-3 border-b app-border-subtle app-surface-strong space-y-2">
            <p className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">{t('chat.startDmTitle')}</p>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {rosterMembers
                .filter((m) => m.memberId !== SESSION_SENDER_ID)
                .map((m) => (
                  <button
                    key={m.memberId}
                    type="button"
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:app-bg-hover app-text-strong transition-colors"
                    onClick={() => void openDmForMember(m.memberId)}
                  >
                    {m.displayName ?? m.memberId}
                  </button>
                ))}
            </div>
            <p className="text-[10px] font-semibold app-text-faint uppercase tracking-wider">{t('chat.startTeamTitle')}</p>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {teamGroups.map((g) => (
                <button
                  key={g.teamId}
                  type="button"
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:app-bg-hover app-text-strong transition-colors"
                  onClick={() => void openTeamChannel(g.teamId)}
                >
                  {g.name ?? g.teamId}
                </button>
              ))}
            </div>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2 border-b app-border-subtle app-surface-strong">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 app-text-faint" />
            <Input
              placeholder="Search..."
              className="h-8 pl-8 text-sm"
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredConversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs app-text-faint">{t('chat.noConversations')}</p>
            ) : (
              <>
                {/* Pinned */}
                {pinnedConversations.length > 0 && (
                  <div className="mb-3">
                    <div className="px-2 py-1.5 text-[10px] font-semibold app-text-faint uppercase tracking-wider">
                      Pinned
                    </div>
                    {pinnedConversations.map(renderConversationButton)}
                  </div>
                )}

                {/* All Conversations */}
                {nonPinnedConversations.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-[10px] font-semibold app-text-faint uppercase tracking-wider">
                      All Conversations
                    </div>
                    {nonPinnedConversations.map(renderConversationButton)}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Chat Header */}
        <div className="h-14 border-b app-border-subtle px-5 flex items-center justify-between app-surface-strong">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {activeConversation && getConvTypeIcon(activeConversation.type ?? 'channel')}
              <h2 className="font-semibold app-text-strong">{activeHeaderTitle}</h2>
            </div>
            <Badge variant="outline" className="text-xs">
              {activeConversationStats.participantCount} members
            </Badge>
            {activeAssistantTargets.length > 0 && (
              <div className="hidden lg:flex items-center gap-1.5 min-w-0">
                {activeAssistantTargets.slice(0, 2).map((member) => (
                  <Badge key={member.memberId} variant="secondary" className="max-w-48 h-6 px-2 text-[11px] font-normal">
                    <Zap size={12} className="mr-1 shrink-0" />
                    <span className="truncate">
                      {member.displayName ?? member.memberId}
                      {member.nodeHostname || member.nodeId
                        ? ` -> ${member.nodeHostname ?? member.nodeId}`
                        : member.agentPlacementState === 'pending'
                          ? ' -> pending node'
                          : ''}
                    </span>
                  </Badge>
                ))}
                {activeAssistantTargets.length > 2 && (
                  <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                    +{activeAssistantTargets.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowStats(!showStats)}
            >
              <BarChart3 size={16} className="mr-1.5" />
              Stats
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowStats(true)}>View Members</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (activeConvId) void switchConversation(activeConvId);
                  }}
                >
                  Refresh Messages
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-5 py-4" data-chat-slot="messages">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="sr-only">
              Loaded conversations: {conversationItems.length} | Loaded messages: {model.messages.length}
            </div>
            {isSwitching ? (
              <p className="text-center text-sm app-text-faint py-12">{t('chat.loadingMessages')}</p>
            ) : model.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full app-bg-surface-subtle flex items-center justify-center mb-4">
                  <MessageSquare size={28} className="app-text-faint" />
                </div>
                <h3 className="font-semibold app-text-strong mb-1">{t('chat.emptyTitle')}</h3>
                <p className="text-sm app-text-muted">{t('chat.emptySubtitle')}</p>
              </div>
            ) : (
              model.messages.map((message, mi) => {
                const label = memberById.get(message.senderId) ?? message.senderId;
                const mine = message.senderId === SESSION_SENDER_ID;
                const sender = activeParticipants.find((member) => member.memberId === message.senderId);
                const senderIsAgent = sender?.roleType === 'assistant';
                const prev = mi > 0 ? model.messages[mi - 1] : null;
                const sameSenderAsPrev = prev?.senderId === message.senderId;
                const showDateSep = prev && message.createdAt && prev.createdAt
                  ? new Date(message.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
                  : false;

                return (
                  <div key={message.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px app-bg-surface-subtle" />
                        <span className="text-[10px] app-text-faint font-medium">
                          {new Date(message.createdAt!).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1 h-px app-bg-surface-subtle" />
                      </div>
                    )}
                    <div className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                      <div className="w-8 h-8 flex-shrink-0">
                        {!sameSenderAsPrev && (
                          <div className="relative">
                            <div className={`w-8 h-8 rounded-full ${senderIsAgent ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'} flex items-center justify-center text-white text-xs font-semibold`}>
                              {initialsFromName(label)}
                            </div>
                            {senderIsAgent && (
                              <div className="absolute -bottom-0.5 -right-0.5">
                                <StatusDot status={(sender?.manualStatus ?? sender?.status ?? 'online').toLowerCase() as 'online' | 'working' | 'offline'} className="size-2" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`flex-1 ${mine ? 'flex flex-col items-end' : ''}`}>
                        {!sameSenderAsPrev && (
                          <div className={`flex items-center gap-2 mb-1 ${mine ? 'flex-row-reverse' : ''}`}>
                            <span className="font-semibold text-sm app-text-strong">
                              {label}
                            </span>
                            {senderIsAgent && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                AI
                              </Badge>
                            )}
                            {message.createdAt && (
                              <span className="text-xs app-text-faint">{formatTime(message.createdAt)}</span>
                            )}
                          </div>
                        )}

                        {/* Attachments */}
                        {message.attachments?.map((att, idx) =>
                          (att.kind === 'image' || att.mimeType?.startsWith('image/')) && att.dataUrl ? (
                            <a
                              key={`${message.id}-img-${idx}`}
                              className="block max-w-xs mb-1 rounded-lg overflow-hidden"
                              href={att.dataUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={att.dataUrl}
                                alt={att.name ?? 'attachment'}
                                className="max-w-full rounded-lg"
                              />
                            </a>
                          ) : (
                            <a
                              key={`${message.id}-file-${idx}`}
                              className="inline-flex items-center gap-1.5 text-xs app-accent-text hover:underline mb-1"
                              href={att.dataUrl}
                              download={att.name ?? 'file'}
                            >
                              <FileIcon size={12} />
                              <span>{att.name ?? 'file'}</span>
                            </a>
                          )
                        )}

                        {message.content.trim() && (
                          <div
                            className={`message-bubble max-w-[75%] ${
                              mine ? 'message-bubble-mine' : 'message-bubble-theirs'
                            }`}
                          >
                            <MessageMarkdown text={message.content} />
                          </div>
                        )}

                        {mine && message.status && (
                          <div className="mt-1">{renderMessageStatus(message.status)}</div>
                        )}
                        {message.status === 'failed' && !mine && (
                          <span className="text-[10px] text-red-600 mt-0.5">{t('chat.messageFailed')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing Indicator */}
            <TypingIndicator typingMembers={[]} />

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message Composer */}
        <div className="border-t app-border-subtle px-5 py-4 app-surface-strong">
          <div className="max-w-4xl mx-auto">
            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingAttachments.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md app-bg-surface-subtle text-xs">
                    {p.kind === 'image' ? (
                      <img src={p.dataUrl} alt="" className="w-6 h-6 rounded object-cover" />
                    ) : (
                      <FileIcon size={12} className="app-text-faint" />
                    )}
                    <span className="app-text-muted max-w-[120px] truncate">{p.name}</span>
                    <button
                      type="button"
                      className="ml-1 app-text-faint hover:text-red-500 transition-colors"
                      onClick={() => removePendingAttachment(p.id)}
                      aria-label={t('chat.removeAttachment')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachError && <p className="text-xs text-red-600 mb-2">{attachError}</p>}

            {/* Command menu */}
            {commandMenuOpen && (
              <div className="relative mb-1">
                <div className="absolute bottom-full left-0 w-[420px] max-h-72 overflow-y-auto rounded-xl border app-border-subtle app-surface-strong shadow-2xl py-1 z-20">
                  <div className="px-3 py-2.5 border-b app-border-subtle">
                    <div className="text-xs font-semibold app-text-strong">Command set</div>
                    <div className="text-[10px] app-text-faint">Type / to search commands. Enter inserts the selected command.</div>
                  </div>
                  {commandCandidates.map((command, idx) => (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      className={`w-full text-left px-3 py-2.5 transition-colors ${idx === commandIndex ? 'bg-cyan-50 text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100' : 'app-text-muted hover:app-bg-hover'}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyCommand(command);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs app-accent-text w-24">{command.trigger}</span>
                        <span className="text-sm font-medium">{command.title}</span>
                      </div>
                      <div className="text-[11px] app-text-faint mt-0.5 pl-[6.5rem]">{command.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mention menu */}
            {mentionMenuOpen && (
              <div className="relative mb-1">
                <div className="absolute bottom-full left-0 w-72 max-h-56 overflow-y-auto rounded-xl border app-border-subtle app-surface-strong shadow-2xl py-1 z-20">
                  {mentionCandidates.map((c, idx) => (
                    <button
                      key={`${c.kind}-${c.id}`}
                      type="button"
                      role="option"
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${idx === mentionIndex ? 'bg-cyan-50 text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100' : 'app-text-muted hover:app-bg-hover'}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMention(c.insertText);
                      }}
                    >
                      <span className="mr-1.5 app-text-faint">{c.kind === 'member' ? '@' : '#'}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              tabIndex={-1}
              onChange={(e) => void addPendingFiles(e.target.files)}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              tabIndex={-1}
              onChange={(e) => void addPendingFiles(e.target.files)}
            />
            <div className="rounded-2xl border app-border-subtle app-bg-canvas shadow-lg shadow-black/5 overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-500/60 transition-all">
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b app-border-subtle bg-white/60 dark:bg-white/[0.03]">
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 rounded-lg app-text-muted"
                    onClick={insertCommandSlash}
                    disabled={model.composer.disabled}
                    aria-label="Open command set"
                  >
                    <Slash size={14} className="mr-1" />
                    <span className="text-xs">Commands</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 rounded-lg app-text-muted">
                        <Paperclip size={14} className="mr-1" />
                        <span className="text-xs">Attach</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                        <ImageIcon size={14} className="mr-2" />
                        Attach Image
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <FileIcon size={14} className="mr-2" />
                        Attach File
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[10px] app-text-faint">
                  <span>Enter to send</span>
                  <span>·</span>
                  <span>Shift+Enter for newline</span>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={composerText}
                onChange={(e) => {
                  setComposerText(e.target.value);
                  setCaretPos(e.target.selectionStart);
                }}
                onSelect={(e) => setCaretPos(e.currentTarget.selectionStart)}
                onClick={(e) => setCaretPos(e.currentTarget.selectionStart)}
                onKeyUp={(e) => setCaretPos(e.currentTarget.selectionStart)}
                onKeyDown={handleComposerKeyDown}
                placeholder={t('chat.placeholder')}
                disabled={model.composer.disabled}
                rows={3}
                className="block w-full min-h-[84px] max-h-40 px-4 py-3 text-sm bg-transparent app-text-strong placeholder:app-text-faint focus:outline-none resize-none leading-relaxed"
                aria-label={t('chat.composerAria')}
              />
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-t app-border-subtle bg-white/50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2 min-w-0 text-[11px] app-text-faint">
                  <span className={`inline-flex h-2 w-2 rounded-full ${realtime.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="truncate">{realtime.detail}</span>
                </div>
                <Button
                  size="sm"
                  className="app-accent-bg hover:opacity-90 text-white h-8 px-3 rounded-lg"
                  onClick={() => void sendMessage()}
                  disabled={
                    model.composer.disabled ||
                    (composerText.trim().length === 0 && pendingAttachments.length === 0)
                  }
                >
                  {model.composer.status === 'sending' ? (
                    <Clock size={15} className="animate-spin mr-1.5" />
                  ) : (
                    <Send size={15} className="mr-1.5" />
                  )}
                  Send
                </Button>
              </div>
            </div>
            {composerState.errorMessage && (
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-red-600 flex-1">{composerState.errorMessage}</p>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleRetry}>
                  {t('chat.retry')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Participants & Stats */}
      {showStats && (
        <div className="w-64 border-l app-border-subtle app-bg-canvas flex flex-col">
          {/* Header */}
          <div className="p-4 border-b app-border-subtle app-surface-strong">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold app-text-strong text-sm">Conversation Stats</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowStats(false)}>
                <X size={14} />
              </Button>
            </div>
            <p className="text-xs app-text-muted">
              {activeConversationStats.participantCount} participants
            </p>
          </div>

          {/* Message Count Leaderboard */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider mb-2">
                  Message Activity
                </div>
                {participantMessageCounts.map(({ member, count }, idx) => (
                  <div
                    key={member.memberId}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:app-bg-hover transition-all mb-1"
                  >
                    <div className="text-xs font-mono app-text-faint w-5">
                      #{idx + 1}
                    </div>
                    <div className="relative flex-shrink-0">
                      <div className={`w-7 h-7 rounded-full ${member.roleType === 'assistant' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'} flex items-center justify-center text-white text-[10px] font-semibold`}>
                        {initialsFromName(member.displayName ?? member.memberId)}
                      </div>
                      {member.roleType === 'assistant' && (
                        <StatusDot status={(member.manualStatus ?? member.status ?? 'online').toLowerCase() as 'online' | 'working' | 'offline'} className="absolute -bottom-0.5 -right-0.5 size-2" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm app-text-strong truncate">
                        {member.displayName ?? member.memberId}
                      </div>
                      <div className="text-xs app-text-faint">
                        {count} messages
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Participants List */}
              <div className="pt-3 border-t app-border-subtle">
                <div className="text-[10px] font-semibold app-text-faint uppercase tracking-wider mb-2">
                  All Participants
                </div>
                <div className="space-y-1">
                  {activeParticipants.map((member) => (
                    <div
                      key={member.memberId}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:app-bg-hover transition-all"
                    >
                      <div className="relative flex-shrink-0">
                        <div className={`w-7 h-7 rounded-full ${member.roleType === 'assistant' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'} flex items-center justify-center text-white text-[10px] font-semibold`}>
                          {initialsFromName(member.displayName ?? member.memberId)}
                        </div>
                        <StatusDot status={(member.manualStatus ?? member.status ?? 'online').toLowerCase() as 'online' | 'working' | 'offline'} className="absolute -bottom-0.5 -right-0.5 size-2" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm app-text-strong truncate">
                            {member.displayName ?? member.memberId}
                          </span>
                          {member.roleType === 'assistant' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                              AI
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs app-text-faint capitalize">{member.roleType ?? 'member'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      </div>
    </div>
  );
};
