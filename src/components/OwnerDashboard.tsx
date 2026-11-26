import React, { useState } from 'react';
import { Megaphone, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatBangladeshDateTime, type BotSystemState } from '../lib/botEngine';

interface OwnerDashboardProps {
  state: BotSystemState;
  onOwnerAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  state,
  onOwnerAction,
  busy,
}) => {
  const [broadcastText, setBroadcastText] = useState('');

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = broadcastText.trim();
    if (!trimmed) return;
    setBroadcastText('');
    await onOwnerAction('broadcast', { message: trimmed });
  };

  const metrics = [
    { label: 'Total Users', value: state.stats.totalUsers.toLocaleString() },
    { label: 'Connected Groups', value: state.stats.totalGroups.toLocaleString() },
    { label: 'Total Music Played', value: state.stats.totalMusicPlayed.toLocaleString() },
    { label: 'Active Live Sessions', value: state.liveSession.active ? '1' : '0' },
    { label: 'Connected Accounts', value: state.account.status === 'connected' ? '1' : '0' },
    { label: 'Server CPU / RAM', value: `${state.stats.cpuPercent}% / ${state.stats.ramPercent}%` },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Metrics Row */}
      <section aria-label="Owner System Metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 bg-[#111827] p-4">
            <p className="text-xs text-slate-400 truncate">{m.label}</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-100 tabular-nums">
              {m.value}
            </p>
          </div>
        ))}
      </section>

      {/* Owner Actions + Broadcast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-label="System Controls" className="rounded-xl border border-white/10 bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">System & Maintenance Controls</h2>
              <p className="text-xs text-slate-400">
                Audio Backend: {state.stats.backendOnline ? `Online (${state.stats.backendLatencyMs}ms)` : 'Offline'} · MySQL: {state.stats.databaseOnline ? 'Connected' : 'Offline'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOwnerAction('toggle_maintenance')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                state.maintenanceMode
                  ? 'bg-amber-600 text-white hover:bg-amber-500'
                  : 'border border-white/10 bg-[#161F33] text-slate-200 hover:bg-white/10'
              }`}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {state.maintenanceMode ? 'Bot OFF (Maintenance ON) — Turn Bot ON' : 'Bot ON — Turn Bot OFF (Maintenance)'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => onOwnerAction('restart_backend')}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#161F33] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Restart Audio Worker
            </button>
          </div>
        </section>

        <section aria-label="Broadcast Announcement" className="rounded-xl border border-white/10 bg-[#111827] p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-100">Broadcast Message</h2>
          <p className="text-xs text-slate-400">
            Dispatches an announcement to all active users and groups via Telegram Bot API.
          </p>
          <form onSubmit={handleBroadcast} className="flex gap-2">
            <label htmlFor="broadcast-input" className="sr-only">
              Broadcast message text
            </label>
            <input
              id="broadcast-input"
              type="text"
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              placeholder="Write broadcast announcement..."
              className="flex-1 rounded-lg border border-white/10 bg-[#0B1120] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={busy || !broadcastText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
              Send Broadcast
            </button>
          </form>
        </section>
      </div>

      {/* Groups & Users Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-label="Group Management" className="rounded-xl border border-white/10 bg-[#111827] overflow-hidden">
          <div className="border-b border-white/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-100">Managed Voice Chat Groups</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Group</th>
                  <th className="px-4 py-3 font-medium text-right">Volume</th>
                  <th className="px-5 py-3 font-medium text-right">Auto Join</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {state.groups.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-200">{g.title}</p>
                      <p className="font-mono text-[11px] text-slate-500">{g.identifier}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300 tabular-nums">
                      {g.volume}%
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onOwnerAction('toggle_group_autojoin', { groupId: g.id })}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                          g.autoJoin
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {g.autoJoin ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="User Management" className="rounded-xl border border-white/10 bg-[#111827] overflow-hidden">
          <div className="border-b border-white/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-100">Users & Access Roles</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Joined (BD 12h)</th>
                  <th className="px-4 py-3 font-medium text-right">Plays</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {state.users.map((u) => {
                  const bd = formatBangladeshDateTime(u.joinedAt);
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-200">{u.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {u.username} · ID {u.chatId}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                        <div>{bd.dateStr}</div>
                        <div className="text-sky-300">{bd.timeStr}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300 tabular-nums">
                        {u.requestsCount}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.role === 'owner' ? (
                          <span className="text-amber-300 font-medium">Admin</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onOwnerAction('toggle_user_ban', { userId: u.id })}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                              u.banned
                                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300'
                            }`}
                          >
                            {u.banned ? 'Blocked (Unblock)' : 'Active (Block)'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Error Logs */}
      <section aria-label="System Error Logs" className="rounded-xl border border-white/10 bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">Recent System & Streaming Logs</h2>
        <div className="space-y-2">
          {state.errorLogs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-sky-400 shrink-0">[{log.component}]</span>
                <span className="text-slate-300 truncate">{log.message}</span>
              </div>
              <span className="font-mono text-slate-500 tabular-nums shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
