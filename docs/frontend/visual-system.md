# Visual System Baseline

## Scope

- `web/src/main.tsx` is the formal app entry and now imports `theme.css`, `layout.css`, and `global.css` together.
- `CollaborationOverviewPage` remains the isolated visual-baseline page.
- `ChatPage`, `TerminalPage`, and `MembersPage` are now real route-level consumers inside the shared `AppShell`.
- `theme.css` owns the global tokens for surface, text, role, status, radius, spacing, shadow, and z-index.
- `layout.css` owns shared page shell spacing and responsive grid behavior.
- `RoleCard` and `RoleCard.css` own role/status feedback inside the card while staying on the token system.

## Contract

- Page entry: `/Users/claire/IdeaProjects/open-kraken/web/src/pages/collaboration/CollaborationOverviewPage.tsx`
- App entry: `/Users/claire/IdeaProjects/open-kraken/web/src/main.tsx`
- Token source: `/Users/claire/IdeaProjects/open-kraken/web/src/styles/theme.css`
- Layout source: `/Users/claire/IdeaProjects/open-kraken/web/src/styles/layout.css`
- Shared app/page styles: `/Users/claire/IdeaProjects/open-kraken/web/src/styles/global.css`
- Card source: `/Users/claire/IdeaProjects/open-kraken/web/src/components/agent/RoleCard.tsx`
- Browser entry: `/Users/claire/IdeaProjects/open-kraken/web/src/pages/collaboration/entry.tsx`
- Real route consumers: `/Users/claire/IdeaProjects/open-kraken/web/src/pages/chat/ChatPage.tsx`; `/Users/claire/IdeaProjects/open-kraken/web/src/pages/terminal/TerminalPage.tsx`; `/Users/claire/IdeaProjects/open-kraken/web/src/pages/members/MembersPage.tsx`

## Role And Status Semantics

- `data-role="owner" | "supervisor" | "assistant" | "member"` is mandatory on each role card root.
- `data-status="idle" | "running" | "success" | "error" | "offline"` is mandatory on each role card root.
- Role feedback is visible through at least avatar border plus role pill color.
- Status feedback is visible through status badge color plus card border/background emphasis.

## Responsive Layout Contract

- mobile < 640px: 1 column grid, shell padding `1.25rem`, page padding `1rem`.
- tablet 640-1023px: 2 columns, shell padding `1.5rem`, grid gap `1rem`.
- desktop >= 1024px: 4 columns, shell padding `2rem`, grid gap `1.25rem`.

## Notes

- The app entry must import `theme.css` and `layout.css`; route pages may not bypass them with isolated inline-only styles.
- `CollaborationOverviewPage` must render `RoleCard` instances so the token and breakpoint systems are exercised together rather than tested in isolation.
- `ChatPage` and `TerminalPage` must keep using shared `route-page__*` sections and token-backed surfaces when richer feature wiring lands.
- `MembersPage` must keep using shared `route-page__*` sections and token-backed `member-card` styles, and it must surface at least one `RoleCard` inside the formal runtime route.
