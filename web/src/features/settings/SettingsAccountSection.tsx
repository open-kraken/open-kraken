/**
 * Phase 7: Account settings section — display name, avatar, timezone.
 * Extends the existing SettingsPage with golutra-equivalent account management.
 */

import { useEffect, useMemo, useState } from 'react';

const PRESET_AVATARS = [
  'CO', 'PL', 'RN', 'DV', 'QA', 'PM', 'DS', 'OP',
  'AI', 'ML', 'FE', 'BE', 'DB', 'SRE', 'SEC', 'UX',
];

const TIMEZONES = [
  'browser', 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland',
];

type AccountSettings = {
  displayName: string;
  avatar: string;
  timezone: string;
};

type SettingsAccountSectionProps = {
  initial: AccountSettings;
  onSave: (settings: AccountSettings) => void;
};

export const SettingsAccountSection = ({ initial, onSave }: SettingsAccountSectionProps) => {
  const [name, setName] = useState(initial.displayName);
  const [avatar, setAvatar] = useState(initial.avatar);
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const [timezone, setTimezone] = useState(initial.timezone || 'browser');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setName(initial.displayName);
    setAvatar(initial.avatar);
    setTimezone(initial.timezone || 'browser');
  }, [dirty, initial.avatar, initial.displayName, initial.timezone]);

  const handleSave = () => {
    onSave({ displayName: name, avatar, timezone: timezone === 'browser' ? browserTimezone : timezone });
    setDirty(false);
  };

  return (
    <section className="route-page__panel">
      <header className="route-page__panel-header">
        <div>
          <p className="page-eyebrow">Account</p>
          <h2>Profile Settings</h2>
        </div>
        {dirty && (
          <button type="button" className="route-page__action" onClick={handleSave}>
            Save Changes
          </button>
        )}
      </header>

      <div className="route-page__field-row">
        <label htmlFor="settings-display-name">Display Name</label>
        <input
          id="settings-display-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="route-page__input"
        />
      </div>

      <div className="route-page__field-row">
        <label>Avatar</label>
        <div className="settings-avatar-grid">
          {PRESET_AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              className={`settings-avatar-chip ${avatar === a ? 'settings-avatar-chip--active' : ''}`}
              onClick={() => { setAvatar(a); setDirty(true); }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="route-page__field-row">
        <label htmlFor="settings-timezone">Timezone</label>
        <select
          id="settings-timezone"
          value={timezone}
          onChange={(e) => { setTimezone(e.target.value); setDirty(true); }}
          className="route-page__action"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz === 'browser' ? `Follow browser (${browserTimezone})` : tz}
            </option>
          ))}
        </select>
        <p className="text-xs app-text-faint mt-1">
          Saved value: {timezone === 'browser' ? browserTimezone : timezone}
        </p>
      </div>
    </section>
  );
};
