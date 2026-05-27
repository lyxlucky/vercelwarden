"use client";

import { useState, useEffect } from "react";

interface InvitationCode {
  code: string;
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
}

interface User {
  uuid: string;
  email: string;
  name: string;
  createdAt: string;
  enabled: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newCode, setNewCode] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");
  const [error, setError] = useState("");

  const authHeader = `Basic ${btoa(`admin:${password}`)}`;

  async function fetchData() {
    try {
      const [codesRes, usersRes] = await Promise.all([
        fetch("/api/admin/invitations", { headers: { Authorization: authHeader } }),
        fetch("/api/admin/users", { headers: { Authorization: authHeader } }),
      ]);

      if (codesRes.status === 401 || usersRes.status === 401) {
        setError("Invalid password");
        setAuthenticated(false);
        return;
      }

      const codesData = await codesRes.json();
      const usersData = await usersRes.json();

      setCodes(codesData.data || []);
      setUsers(usersData.data || []);
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Failed to connect to server");
    }
  }

  async function createCode() {
    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(newCode ? { code: newCode } : {}),
    });
    if (res.ok) {
      setNewCode("");
      fetchData();
    }
  }

  async function deleteCode(code: string) {
    await fetch("/api/admin/invitations", {
      method: "DELETE",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    fetchData();
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">Vercelwarden Admin</h1>
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchData()}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
          />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={fetchData}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Vercelwarden Admin</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-t ${activeTab === "users" ? "bg-gray-700 text-blue-400" : "text-gray-400 hover:text-white"}`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("invitations")}
            className={`px-4 py-2 rounded-t ${activeTab === "invitations" ? "bg-gray-700 text-blue-400" : "text-gray-400 hover:text-white"}`}
          >
            Invitation Codes ({codes.length})
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-2">
            {users.length === 0 ? (
              <p className="text-gray-400">No users registered yet.</p>
            ) : (
              users.map((u) => (
                <div key={u.uuid} className="bg-gray-800 p-4 rounded flex justify-between items-center">
                  <div>
                    <p className="font-medium">{u.email}</p>
                    <p className="text-sm text-gray-400">
                      {u.name || "(no name)"} · Created {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    {u.emailVerified && <span className="bg-green-900 text-green-300 px-2 py-1 rounded">Verified</span>}
                    {u.twoFactorEnabled && <span className="bg-yellow-900 text-yellow-300 px-2 py-1 rounded">2FA</span>}
                    <span className={`px-2 py-1 rounded ${u.enabled ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                      {u.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Invitations Tab */}
        {activeTab === "invitations" && (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Custom code (or leave blank for random)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={createCode}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-medium"
              >
                Generate
              </button>
            </div>
            <div className="space-y-2">
              {codes.length === 0 ? (
                <p className="text-gray-400">No invitation codes yet. Generate one above.</p>
              ) : (
                codes.map((c) => (
                  <div key={c.code} className="bg-gray-800 p-4 rounded flex justify-between items-center">
                    <div>
                      <code className="text-lg font-mono text-blue-400">{c.code}</code>
                      <p className="text-sm text-gray-400 mt-1">
                        Created {new Date(c.createdAt).toLocaleDateString()}
                        {c.usedAt && ` · Used by ${c.usedBy} on ${new Date(c.usedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {!c.usedAt && (
                      <button
                        onClick={() => deleteCode(c.code)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
