"use client";

import { useState, useMemo } from "react";

interface User {
  uuid: string;
  email: string;
  name: string;
  createdAt: string;
  enabled: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

type Filter = "all" | "active" | "disabled" | "2fa";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  const authHeader = `Basic ${btoa(`admin:${password}`)}`;

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) {
        setError("Invalid password");
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setUsers(data.data || []);
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(u: User) {
    setBusyUuid(u.uuid);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: u.uuid, enabled: !u.enabled }),
      });
      await fetchUsers();
    } finally {
      setBusyUuid(null);
    }
  }

  async function deleteUser(u: User) {
    if (!confirm(`Delete account ${u.email}? This permanently removes their vault.`)) return;
    setBusyUuid(u.uuid);
    try {
      await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: u.uuid }),
      });
      await fetchUsers();
    } finally {
      setBusyUuid(null);
    }
  }

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.enabled).length;
    const verified = users.filter((u) => u.emailVerified).length;
    const twoFA = users.filter((u) => u.twoFactorEnabled).length;
    return { total, active, verified, twoFA };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "active" && !u.enabled) return false;
      if (filter === "disabled" && u.enabled) return false;
      if (filter === "2fa" && !u.twoFactorEnabled) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.uuid.toLowerCase().includes(q)
      );
    });
  }, [users, query, filter]);

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1e293b,_#020617)] p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 mb-4">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Vercelwarden</h1>
            <p className="text-sm text-slate-400 mt-1">Administration Console</p>
          </div>
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <label className="block text-sm font-medium text-slate-300 mb-2">Admin password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
              className="w-full px-4 py-2.5 bg-slate-800/80 text-white rounded-lg border border-slate-700 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition mb-4"
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            <button
              onClick={() => fetchUsers()}
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition shadow-lg shadow-indigo-500/20"
            >
              {loading ? "Authenticating…" : "Sign in"}
            </button>
          </div>
          <p className="text-center text-xs text-slate-500 mt-6">
            Set <code className="text-slate-400">ADMIN_PASSWORD</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Vercelwarden Admin</h1>
              <p className="text-xs text-slate-500">User management</p>
            </div>
          </div>
          <button
            onClick={() => {
              setAuthenticated(false);
              setPassword("");
              setUsers([]);
            }}
            className="text-sm text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total users" value={stats.total} accent="from-indigo-500 to-purple-600" />
          <StatCard label="Active" value={stats.active} accent="from-emerald-500 to-teal-600" />
          <StatCard label="Email verified" value={stats.verified} accent="from-sky-500 to-cyan-600" />
          <StatCard label="2FA enabled" value={stats.twoFA} accent="from-amber-500 to-orange-600" />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by email, name, or UUID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
            />
          </div>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {(["all", "active", "disabled", "2fa"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-md transition capitalize ${
                  filter === f
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f === "2fa" ? "2FA" : f}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchUsers()}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* User list */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-slate-700 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              <p className="text-slate-400">
                {users.length === 0 ? "No users registered yet." : "No users match the current filter."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {filtered.map((u) => (
                <li
                  key={u.uuid}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition"
                >
                  <Avatar email={u.email} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-white truncate">{u.email}</p>
                      {!u.enabled && <Badge color="red">Disabled</Badge>}
                      {u.emailVerified && <Badge color="emerald">Verified</Badge>}
                      {u.twoFactorEnabled && <Badge color="amber">2FA</Badge>}
                    </div>
                    <p className="text-sm text-slate-400 truncate">
                      {u.name || <span className="italic text-slate-600">no name</span>}
                      <span className="mx-2 text-slate-700">·</span>
                      Joined {new Date(u.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEnabled(u)}
                      disabled={busyUuid === u.uuid}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition disabled:opacity-50 ${
                        u.enabled
                          ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {u.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => deleteUser(u)}
                      disabled={busyUuid === u.uuid}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 transition disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          {filtered.length} of {users.length} user{users.length === 1 ? "" : "s"}
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className={`absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br ${accent} opacity-10 blur-2xl rounded-full`} />
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "emerald" | "amber" | "red";
  children: React.ReactNode;
}) {
  const palette = {
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    red: "bg-red-500/10 text-red-300 border-red-500/20",
  } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${palette[color]}`}>
      {children}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  const initial = (email || "?").slice(0, 1).toUpperCase();
  // Stable hue from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 shadow-sm"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 40) % 360},70%,45%))`,
      }}
    >
      {initial}
    </div>
  );
}
