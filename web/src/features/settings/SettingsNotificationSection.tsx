/**
 * Phase 7: Notification settings section — browser notifications toggle, DND hours.
 */

import { useEffect, useState } from 'react';

type NotificationSettings = {
  browserNotifications: boolean;
  soundEnabled: boolean;
  dndStart: string; // "HH:mm"
  dndEnd: string;
};

type Props = {
  initial: NotificationSettings;
  onSave: (settings: NotificationSettings) => void;
};

export const SettingsNotificationSection = ({ initial, onSave }: Props) => {
  const [browserNotif, setBrowserNotif] = useState(initial.browserNotifications);
  const [sound, setSound] = useState(initial.soundEnabled);
  const [dndStart, setDndStart] = useState(initial.dndStart || '22:00');
  const [dndEnd, setDndEnd] = useState(initial.dndEnd || '08:00');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setBrowserNotif(initial.browserNotifications);
    setSound(initial.soundEnabled);
    setDndStart(initial.dndStart || '22:00');
    setDndEnd(initial.dndEnd || '08:00');
  }, [dirty, initial.browserNotifications, initial.dndEnd, initial.dndStart, initial.soundEnabled]);

  const handleSave = () => {
    onSave({ browserNotifications: browserNotif, soundEnabled: sound, dndStart, dndEnd });
    setDirty(false);
  };

  const handleToggleBrowser = async () => {
    if (!browserNotif && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    setBrowserNotif(!browserNotif);
    setDirty(true);
  };

  return (
    <section className="route-page__panel">
      <header className="route-page__panel-header">
        <div>
          <p className="page-eyebrow">Notifications</p>
          <h2>Notification Preferences</h2>
        </div>
        {dirty && (
          <button type="button" className="route-page__action" onClick={handleSave}>
            Save
          </button>
        )}
      </header>

      <div className="route-page__field-row route-page__field-row--inline">
        <label>
          <input type="checkbox" checked={browserNotif} onChange={handleToggleBrowser} />
          {' '}Browser notifications
        </label>
      </div>

      <div className="route-page__field-row route-page__field-row--inline">
        <label>
          <input type="checkbox" checked={sound} onChange={() => { setSound(!sound); setDirty(true); }} />
          {' '}Sound alerts
        </label>
      </div>

      <div className="route-page__field-row">
        <label>Do Not Disturb hours</label>
        <div className="route-page__field-row--inline">
          <input type="time" value={dndStart} onChange={(e) => { setDndStart(e.target.value); setDirty(true); }} />
          <span> to </span>
          <input type="time" value={dndEnd} onChange={(e) => { setDndEnd(e.target.value); setDirty(true); }} />
        </div>
      </div>
    </section>
  );
};
