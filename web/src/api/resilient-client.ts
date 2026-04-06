import type { LegacyApiClient } from './live-client';

/**
 * Wraps a primary (live) client with a fallback (mock) client.
 * Read-only methods fall back to the mock on error; write methods pass through.
 */
export const createResilientClient = (
  primary: LegacyApiClient,
  fallback: LegacyApiClient
): LegacyApiClient => {
  const withFallback = <T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> =>
    primaryFn().catch(() => fallbackFn());

  return {
    workspaceId: primary.workspaceId,

    // Read methods — fallback on error
    getConversations: () => withFallback(() => primary.getConversations(), () => fallback.getConversations()),
    getMessages: (id) => withFallback(() => primary.getMessages(id), () => fallback.getMessages(id)),
    getMembers: () => withFallback(() => primary.getMembers(), () => fallback.getMembers()),
    getRoadmap: () => withFallback(() => primary.getRoadmap(), () => fallback.getRoadmap()),
    getProjectData: () => withFallback(() => primary.getProjectData(), () => fallback.getProjectData()),
    attachTerminal: (id) => withFallback(() => primary.attachTerminal(id), () => fallback.attachTerminal(id)),

    // Write methods — no fallback, errors should surface
    sendMessage: (id, payload) => primary.sendMessage(id, payload),
    updateMemberStatus: (id, patch) => primary.updateMemberStatus(id, patch),
    updateRoadmap: (roadmap) => primary.updateRoadmap(roadmap),
    updateProjectData: (payload) => primary.updateProjectData(payload),

    // Realtime — prefer primary, fallback if primary doesn't support it
    subscribe: (listener) => {
      try {
        return primary.subscribe(listener);
      } catch {
        return fallback.subscribe(listener);
      }
    }
  };
};
