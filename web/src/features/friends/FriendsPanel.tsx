/**
 * Phase 5: Friends panel — displays member presence with status indicators.
 * Migrated from golutra's FriendsView.vue.
 */

import { useState } from 'react';

export type FriendEntry = {
  id: string;
  name: string;
  avatar: string;
  roleType: string;
  status: 'online' | 'working' | 'dnd' | 'offline';
  terminalStatus?: string;
  terminalType?: string;
  scope: 'project' | 'global';
};

type FriendsPanelProps = {
  friends: FriendEntry[];
  onSetStatus: (memberId: string, status: string) => void;
  onOpenChat: (memberId: string) => void;
  onOpenTerminal?: (memberId: string) => void;
};

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online', color: '#22c55e' },
  { value: 'working', label: 'Working', color: '#eab308' },
  { value: 'dnd', label: 'Do Not Disturb', color: '#ef4444' },
  { value: 'offline', label: 'Offline', color: '#6b7280' },
];

export const FriendsPanel = ({
  friends,
  onSetStatus,
  onOpenChat,
  onOpenTerminal,
}: FriendsPanelProps) => {
  const projectFriends = friends.filter((f) => f.scope === 'project');
  const globalFriends = friends.filter((f) => f.scope === 'global');

  return (
    <div className="friends-panel">
      <FriendSection title="Project Members" friends={projectFriends} onSetStatus={onSetStatus} onOpenChat={onOpenChat} onOpenTerminal={onOpenTerminal} />
      {globalFriends.length > 0 && (
        <FriendSection title="Global Contacts" friends={globalFriends} onSetStatus={onSetStatus} onOpenChat={onOpenChat} onOpenTerminal={onOpenTerminal} />
      )}
    </div>
  );
};

type FriendSectionProps = {
  title: string;
  friends: FriendEntry[];
} & Pick<FriendsPanelProps, 'onSetStatus' | 'onOpenChat' | 'onOpenTerminal'>;

const FriendSection = ({ title, friends, onSetStatus, onOpenChat, onOpenTerminal }: FriendSectionProps) => (
  <section className="friends-section">
    <h3 className="friends-section__title">{title} ({friends.length})</h3>
    <ul className="friends-section__list">
      {friends.map((friend) => (
        <FriendCard
          key={friend.id}
          friend={friend}
          onSetStatus={onSetStatus}
          onOpenChat={onOpenChat}
          onOpenTerminal={onOpenTerminal}
        />
      ))}
    </ul>
  </section>
);

type FriendCardProps = {
  friend: FriendEntry;
} & Pick<FriendsPanelProps, 'onSetStatus' | 'onOpenChat' | 'onOpenTerminal'>;

const FriendCard = ({ friend, onSetStatus, onOpenChat, onOpenTerminal }: FriendCardProps) => {
  const [showStatus, setShowStatus] = useState(false);
  const statusColor = STATUS_OPTIONS.find((s) => s.value === friend.status)?.color ?? '#6b7280';

  return (
    <li className="friend-card" data-status={friend.status}>
      <div className="friend-card__avatar" onClick={() => onOpenTerminal?.(friend.id)} title="Open terminal">
        <span>{friend.avatar || friend.name.charAt(0).toUpperCase()}</span>
        <span className="friend-card__status-dot" style={{ backgroundColor: statusColor }} />
        {friend.terminalStatus && (
          <span className="friend-card__terminal-dot" data-terminal={friend.terminalStatus} />
        )}
      </div>
      <div className="friend-card__info">
        <span className="friend-card__name">{friend.name}</span>
        <span className="friend-card__role">{friend.roleType}</span>
      </div>
      <div className="friend-card__actions">
        <button type="button" className="friend-card__btn" onClick={() => onOpenChat(friend.id)} title="Send message">
          Chat
        </button>
        <button type="button" className="friend-card__btn" onClick={() => setShowStatus(!showStatus)} title="Set status">
          Status
        </button>
      </div>
      {showStatus && (
        <div className="friend-card__status-dropdown">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`friend-card__status-option ${friend.status === opt.value ? 'friend-card__status-option--active' : ''}`}
              onClick={() => { onSetStatus(friend.id, opt.value); setShowStatus(false); }}
            >
              <span className="friend-card__status-color" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
};
