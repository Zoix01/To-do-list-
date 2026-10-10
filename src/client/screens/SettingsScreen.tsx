import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScreenHeader } from '../components/AppShell';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useFeedback } from '../lib/feedback';
import { keys } from '../lib/queries';
import { forgetUserData } from '../lib/queryClient';

export function SettingsScreen() {
  const { canEdit, timeZone } = useApp();
  const queryClient = useQueryClient();
  const { showError } = useFeedback();
  const [pending, setPending] = useState(false);

  const logOut = async () => {
    setPending(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      await forgetUserData();
      await queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (error) {
      showError(errorMessage(error));
      setPending(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Settings" />
      <section className="settings-section">
        <h2 className="section__title">Session</h2>
        <p className="settings-section__text">
          You stay logged in on this device. Logging out ends only this device’s session and removes
          the data saved on it.
        </p>
        <button type="button" className="button" onClick={logOut} disabled={!canEdit || pending}>
          Log out
        </button>
      </section>
      <section className="settings-section">
        <h2 className="section__title">Appearance</h2>
        <p className="settings-section__text">Dark theme. It is the only theme for now.</p>
      </section>
      <section className="settings-section">
        <h2 className="section__title">Time zone</h2>
        <p className="settings-section__text">
          “Today” is calculated in <span className="mono">{timeZone}</span>. Change it with the{' '}
          <span className="mono">TIMEZONE</span> value in your Wrangler config.
        </p>
      </section>
    </>
  );
}
