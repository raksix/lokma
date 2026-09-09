import * as React from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { emptyAcceptInviteForm, storeToken, validateAcceptInviteForm } from './auth';

/**
 * InvitePage (REQ-080) — `/invite?token=…` lands here, BEFORE the login
 * gate (an invited user has no password yet, so the gate would 401 them
 * forever). Name + password twice → `POST /api/auth/accept-invite` sets
 * the session cookie AND returns a bearer token; either one signs the
 * user in, then `onDone` re-runs the gate into the shell.
 */

const labelClass = 'mb-1 block text-[11px] font-medium text-zinc-500';
const inputClass =
  'h-8 rounded-md border border-line bg-white px-2.5 text-sm focus:outline-none dark:bg-[#1E1E21] w-full';

export function InvitePage({ token, onDone }: { token: string; onDone: () => void }) {
  const [form, setForm] = React.useState({ ...emptyAcceptInviteForm });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!token) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-[#FAF9F5] dark:bg-[#161618]">
        <div className="text-sm text-red-600">Invite link is missing its token — ask an admin for a fresh invite.</div>
      </div>
    );
  }

  const submit = async () => {
    const problem = validateAcceptInviteForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.acceptInvite({ token, name: form.name.trim(), password: form.password });
      if (res.token) storeToken(res.token);
      setForm({ ...emptyAcceptInviteForm });
      // Leave the invite URL behind with a full reload: the memoised
      // pathname would otherwise keep rendering this page after onDone.
      try {
        window.location.replace('/');
      } catch {
        onDone();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invite failed — the link may be used or expired');
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div className="grid h-screen w-screen place-items-center bg-[#FAF9F5] dark:bg-[#161618]">
      <div className="w-[320px] rounded-lg border border-line bg-white p-5 shadow-sm dark:bg-[#1E1E21]">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#C96442]" />
          <div className="text-sm font-semibold">You&apos;re invited to Lokma</div>
        </div>
        <div className="mt-1 text-xs text-zinc-500">Pick a display name and set your password to join.</div>
        <div className="mt-3 space-y-2.5">
          <div>
            <label htmlFor="invite-name" className={labelClass}>
              Display name
            </label>
            <Input
              id="invite-name"
              value={form.name}
              maxLength={40}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={submitOnEnter}
              placeholder="Your name"
              className={inputClass}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="invite-password" className={labelClass}>
              Password (min 8 chars)
            </label>
            <Input
              id="invite-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              onKeyDown={submitOnEnter}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="invite-confirm" className={labelClass}>
              Password again
            </label>
            <Input
              id="invite-confirm"
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              onKeyDown={submitOnEnter}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          <Button className="h-8 w-full text-sm" disabled={busy} onClick={() => void submit()}>
            <KeyRound className="h-3.5 w-3.5" /> {busy ? 'Joining…' : 'Set password & join'}
          </Button>
        </div>
      </div>
    </div>
  );
}
