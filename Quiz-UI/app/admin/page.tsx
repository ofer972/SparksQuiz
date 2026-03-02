"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Me {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
}

interface Host {
  id: number;
  email: string;
  name: string | null;
  is_active: boolean;
  is_admin: boolean;
  invited_at: string | null;
  last_login: string | null;
  invited_by: string | null;
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteAdmin, setInviteAdmin] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [inviteMsg, setInviteMsg] = useState("");

  async function load() {
    try {
      const [meData, hostsData] = await Promise.all([
        apiFetch<Me>("/auth/me"),
        apiFetch<Host[]>("/admin/hosts"),
      ]);
      setMe(meData);
      setHosts(hostsData);
      if (!meData.is_admin) {
        setError("You need admin rights to view this page.");
      }
    } catch {
      setError("Access denied or session expired. Please log in again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteStatus("loading");
    setInviteMsg("");
    try {
      const res = await apiFetch<{ ok: boolean; action: string }>("/admin/hosts/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName, is_admin: inviteAdmin }),
      });
      setInviteStatus("ok");
      setInviteMsg(
        res.action === "reinvited"
          ? `New login link sent to ${inviteEmail}.`
          : `${inviteName || inviteEmail} invited! Login link sent.`
      );
      setInviteEmail("");
      setInviteName("");
      setInviteAdmin(false);
      await load();
    } catch (err: unknown) {
      setInviteStatus("error");
      setInviteMsg(err instanceof Error ? err.message : "Invite failed.");
    }
  }

  async function handleRevoke(host: Host) {
    if (!confirm(`Revoke access for ${host.name || host.email}? They won't be able to log in.`)) return;
    try {
      await apiFetch(`/admin/hosts/${host.id}/revoke`, { method: "PUT" });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke.");
    }
  }

  async function handleDelete(host: Host) {
    if (!confirm(`Permanently delete ${host.name || host.email}? This cannot be undone.`)) return;
    try {
      await apiFetch(`/admin/hosts/${host.id}`, { method: "DELETE" });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function handleReinvite(host: Host) {
    try {
      await apiFetch<{ ok: boolean; action: string }>("/admin/hosts/invite", {
        method: "POST",
        body: JSON.stringify({ email: host.email, name: host.name ?? "", is_admin: host.is_admin }),
      });
      alert(`New login link sent to ${host.email}.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Re-invite failed.");
    }
  }

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.push("/host/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xl">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-red-400 text-lg">{error}</p>
        <button
          onClick={() => router.push("/host/login")}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
        >
          Go to login
        </button>
      </div>
    );
  }

  const activeHosts = hosts.filter((h) => h.is_active);
  const revokedHosts = hosts.filter((h) => !h.is_active);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold">Host Management</h1>
          <p className="text-slate-400 mt-1">Logged in as <span className="text-white font-semibold">{me?.name}</span> · {me?.email}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/host")}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
          >
            ← Dashboard
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Invite form */}
      <div className="bg-slate-800 rounded-2xl p-6 mb-8 shadow">
        <h2 className="text-xl font-bold mb-4">Invite a new host</h2>
        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-slate-400 text-xs block mb-1">Email *</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="host@example.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600
                         text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-slate-400 text-xs block mb-1">Name</label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Display name"
              className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600
                         text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              id="isAdmin"
              checked={inviteAdmin}
              onChange={(e) => setInviteAdmin(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            <label htmlFor="isAdmin" className="text-slate-300 text-sm whitespace-nowrap">Admin</label>
          </div>
          <button
            type="submit"
            disabled={inviteStatus === "loading"}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold
                       rounded-lg whitespace-nowrap transition disabled:opacity-50"
          >
            {inviteStatus === "loading" ? "Sending…" : "Send Invite"}
          </button>
        </form>
        {inviteMsg && (
          <p className={`mt-3 text-sm ${inviteStatus === "error" ? "text-red-400" : "text-green-400"}`}>
            {inviteMsg}
          </p>
        )}
      </div>

      {/* Active hosts */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Active hosts ({activeHosts.length})</h2>
        <div className="overflow-x-auto rounded-xl shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 text-slate-300">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Last login</th>
                <th className="text-left px-4 py-3">Invited by</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {activeHosts.map((h) => (
                <tr key={h.id} className="bg-slate-800 hover:bg-slate-750">
                  <td className="px-4 py-3 font-medium">
                    {h.name || "—"}
                    {String(h.id) === me?.id && (
                      <span className="ml-2 text-xs text-indigo-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{h.email}</td>
                  <td className="px-4 py-3">
                    {h.is_admin
                      ? <span className="text-yellow-400 font-semibold">Admin</span>
                      : <span className="text-slate-400">Host</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{fmt(h.last_login)}</td>
                  <td className="px-4 py-3 text-slate-400">{h.invited_by || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReinvite(h)}
                        className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs font-medium"
                      >
                        Re-invite
                      </button>
                      {String(h.id) !== me?.id && (
                        <button
                          onClick={() => handleRevoke(h)}
                          className="px-3 py-1 bg-orange-700 hover:bg-orange-600 rounded text-xs font-medium"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {activeHosts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 px-4 py-6">No active hosts</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Revoked hosts */}
      {revokedHosts.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3 text-slate-400">Revoked hosts ({revokedHosts.length})</h2>
          <div className="overflow-x-auto rounded-xl shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-700 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Last login</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {revokedHosts.map((h) => (
                  <tr key={h.id} className="bg-slate-800 opacity-60">
                    <td className="px-4 py-3 line-through text-slate-400">{h.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{h.email}</td>
                    <td className="px-4 py-3 text-slate-500">{fmt(h.last_login)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(h)}
                        className="px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs font-medium text-red-200"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
