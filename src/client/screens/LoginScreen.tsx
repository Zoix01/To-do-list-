import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../lib/api';
import { keys } from '../lib/queries';

export function LoginScreen() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setPending(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { password } });
      await queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        const seconds = Number(caught.data.retryAfterSeconds) || 60;
        setError(`Too many attempts. Try again in ${seconds} s.`);
      } else {
        setError(errorMessage(caught));
      }
      setPassword('');
      setPending(false);
    }
  };

  return (
    <main className="login">
      <form className="login__form" onSubmit={submit}>
        <h1 className="login__title">Planner</h1>
        <label className="login__label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary button--block" disabled={pending}>
          Log in
        </button>
      </form>
    </main>
  );
}
