import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dateInZone, formatShortDate } from '../../shared/dates';
import { ConfirmDialog } from '../components/Dialog';
import { useApp } from '../lib/appContext';
import { useConnector, useDisconnectApp } from '../lib/queries';

/** Settings → Claude connector: URL, setup steps, connected apps (SPEC §9, §9.1). */
export function ConnectorSection() {
  const { canEdit, timeZone } = useApp();
  const { data: status } = useConnector();
  const disconnect = useDisconnectApp();
  const [copied, setCopied] = useState(false);
  const [toDisconnect, setToDisconnect] = useState<{ id: string; name: string } | null>(null);
  const url = `${window.location.origin}/mcp`;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: the URL is selectable text anyway.
    }
  };

  return (
    <section className="settings-section">
      <h2 className="section__title">Claude connector</h2>
      <p className="settings-section__text">
        Lets Claude read your tasks, lists and habits, and add or edit tasks. It can’t complete or
        delete anything.
      </p>

      {status && !status.configured ? (
        <p className="settings-section__text">
          Not set up on this server yet: it needs the <span className="mono">OAUTH_KV</span>{' '}
          namespace. See “Connect Claude” in the README.
        </p>
      ) : (
        <>
          <div className="connector-url">
            <code className="connector-url__text">{url}</code>
            <button type="button" className="button" onClick={copy}>
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ol className="connector-steps">
            <li>
              In Claude, open <strong>Settings → Connectors</strong> and choose{' '}
              <strong>Add custom connector</strong>.
            </li>
            <li>Paste the URL above, add it, then select Connect.</li>
            <li>Enter your Planner password on the page that opens.</li>
          </ol>
          <p className="settings-section__text">
            Once connected, it works in Claude on the web, desktop and phone.
          </p>

          <h3 className="connector-apps__title">Connected apps</h3>
          {status && status.apps.length === 0 && <p className="muted">Nothing connected yet.</p>}
          {status && status.apps.length > 0 && (
            <ul className="connector-apps">
              {status.apps.map((app) => (
                <li key={app.id} className="connector-apps__row">
                  <span className="connector-apps__name">{app.name}</span>
                  <span className="muted">
                    connected {formatShortDate(dateInZone(new Date(app.connectedAt), timeZone))}
                  </span>
                  <button
                    type="button"
                    className="button connector-apps__action"
                    disabled={!canEdit || disconnect.isPending}
                    onClick={() => setToDisconnect(app)}
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDisconnect !== null}
        title={`Disconnect ${toDisconnect?.name ?? 'this app'}?`}
        message="It loses access right away. To use it again, connect it from Claude and enter your password."
        confirmLabel="Disconnect"
        danger
        onClose={() => setToDisconnect(null)}
        onConfirm={() => toDisconnect && disconnect.mutate(toDisconnect.id)}
      />
    </section>
  );
}
