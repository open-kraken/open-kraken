import { useCallback, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useAppShell } from '@/state/app-shell-store';
import type { MembersPageModel } from '@/features/members/member-page-model';
import { HttpClientError } from '@/api/http-client';

const canManageRoster = (role: string | undefined) => role === 'owner' || role === 'supervisor';

export type MembersRosterAdminProps = {
  model: MembersPageModel;
  onReload: () => void | Promise<void>;
};

export const MembersRosterAdmin = ({ model, onReload }: MembersRosterAdminProps) => {
  const { t } = useI18n();
  const { account } = useAuth();
  const { apiClient, pushNotification } = useAppShell();
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleType, setRoleType] = useState('member');
  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [delMemberId, setDelMemberId] = useState('');
  const [delTeamId, setDelTeamId] = useState('');

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        await onReload();
      } catch (e) {
        const msg = e instanceof HttpClientError ? e.message : String(e);
        pushNotification({ tone: 'error', title: t('members.adminError'), detail: msg, tag: 'roster-admin' });
      } finally {
        setBusy(false);
      }
    },
    [onReload, pushNotification, t]
  );

  if (!canManageRoster(account?.role)) {
    return null;
  }

  return (
    <section className="members-roster-admin" aria-labelledby="members-roster-admin-title">
      <div className="members-roster-admin__head">
        <p className="page-eyebrow">{t('members.adminEyebrow')}</p>
        <h2 id="members-roster-admin-title" className="members-roster-admin__title">
          {t('members.adminTitle')}
        </h2>
        <p className="members-roster-admin__hint">{t('members.adminHint')}</p>
      </div>

      <div className="members-roster-admin__grid">
        <form
          className="members-roster-admin__card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiClient.createMember({
                memberId: memberId.trim(),
                displayName: displayName.trim() || undefined,
                roleType: roleType || 'member'
              });
              setMemberId('');
              setDisplayName('');
            });
          }}
        >
          <h3 className="members-roster-admin__card-title">{t('members.adminAddMember')}</h3>
          <label className="members-roster-admin__field">
            <span>{t('members.adminMemberId')}</span>
            <input value={memberId} onChange={(ev) => setMemberId(ev.target.value)} required disabled={busy} />
          </label>
          <label className="members-roster-admin__field">
            <span>{t('members.adminDisplayName')}</span>
            <input value={displayName} onChange={(ev) => setDisplayName(ev.target.value)} disabled={busy} />
          </label>
          <label className="members-roster-admin__field">
            <span>{t('members.adminRole')}</span>
            <select value={roleType} onChange={(ev) => setRoleType(ev.target.value)} disabled={busy}>
              <option value="owner">owner</option>
              <option value="supervisor">supervisor</option>
              <option value="assistant">assistant</option>
              <option value="member">member</option>
            </select>
          </label>
          <button type="submit" className="route-page__action" disabled={busy || !memberId.trim()}>
            {t('members.adminSubmit')}
          </button>
        </form>

        <form
          className="members-roster-admin__card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiClient.createTeam({
                teamId: teamId.trim(),
                name: teamName.trim() || undefined,
                memberIds: []
              });
              setTeamId('');
              setTeamName('');
            });
          }}
        >
          <h3 className="members-roster-admin__card-title">{t('members.adminAddTeam')}</h3>
          <label className="members-roster-admin__field">
            <span>{t('members.adminTeamId')}</span>
            <input value={teamId} onChange={(ev) => setTeamId(ev.target.value)} required disabled={busy} />
          </label>
          <label className="members-roster-admin__field">
            <span>{t('members.adminTeamName')}</span>
            <input value={teamName} onChange={(ev) => setTeamName(ev.target.value)} disabled={busy} />
          </label>
          <button type="submit" className="route-page__action" disabled={busy || !teamId.trim()}>
            {t('members.adminSubmitTeam')}
          </button>
        </form>

        <div className="members-roster-admin__card">
          <h3 className="members-roster-admin__card-title">{t('members.adminDeleteMember')}</h3>
          <label className="members-roster-admin__field">
            <span>{t('members.adminPickMember')}</span>
            <select value={delMemberId} onChange={(ev) => setDelMemberId(ev.target.value)} disabled={busy}>
              <option value="">{t('members.adminSelect')}</option>
              {model.members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.displayName} ({m.memberId})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="route-page__action route-page__action--danger"
            disabled={busy || !delMemberId}
            onClick={() =>
              void run(async () => {
                await apiClient.deleteMember(delMemberId);
                setDelMemberId('');
              })
            }
          >
            {t('members.adminRemove')}
          </button>
        </div>

        <div className="members-roster-admin__card">
          <h3 className="members-roster-admin__card-title">{t('members.adminDeleteTeam')}</h3>
          <label className="members-roster-admin__field">
            <span>{t('members.adminPickTeam')}</span>
            <select value={delTeamId} onChange={(ev) => setDelTeamId(ev.target.value)} disabled={busy}>
              <option value="">{t('members.adminSelect')}</option>
              {model.teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.name} ({team.teamId})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="route-page__action route-page__action--danger"
            disabled={busy || !delTeamId}
            onClick={() =>
              void run(async () => {
                await apiClient.deleteTeam(delTeamId);
                setDelTeamId('');
              })
            }
          >
            {t('members.adminRemoveTeam')}
          </button>
        </div>
      </div>
    </section>
  );
};
