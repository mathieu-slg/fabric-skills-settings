"use client";

import { useEffect, useState, useCallback } from "react";

interface ApiKeyEntry {
  id: string | null;
  email: string;
  masked_key: string;
  readonly?: boolean;
}

interface KeysData {
  entries: ApiKeyEntry[];
  writable: boolean;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function generateKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ApiKeysPage() {
  const [data, setData] = useState<KeysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/apikeys");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleAdd() {
    if (!addEmail.trim() || !addKey.trim()) {
      setAddError("Email and key are required");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("/api/proxy/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), key: addKey.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setNewEntryId(body.id);
      setShowAddModal(false);
      setAddEmail("");
      setAddKey("");
      await fetchKeys();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add key");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(entry: ApiKeyEntry) {
    if (!entry.id) return;
    if (!confirm(`Remove API key for ${entry.email}?\n\nThis is immediate and cannot be undone.`)) return;
    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/proxy/apikeys/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? `Failed: HTTP ${res.status}`);
        return;
      }
      if (newEntryId === entry.id) setNewEntryId(null);
      await fetchKeys();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopy(text: string, entryId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(entryId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // clipboard not available
    }
  }

  function openAddModal() {
    setAddEmail("");
    setAddKey(generateKey());
    setAddError(null);
    setShowAddModal(true);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">API Keys</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage MCP server access keys
          </p>
        </div>
        {data?.writable && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: "#2563eb", color: "white", border: "none" }}
            onClick={openAddModal}
          >
            <PlusIcon />
            Add key
          </button>
        )}
      </div>

      {/* Info banner when not writable */}
      {data && !data.writable && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm flex items-start gap-2"
          style={{ background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            Key management is read-only — <code className="font-mono text-xs">FABRIC_MCP_API_KEYS_FILE</code> is not
            configured. Set it in the server environment to enable add / delete.
          </span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-md text-slate-300" />
        </div>
      )}

      {error && !loading && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {data.entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No API keys configured.
              {data.writable && (
                <button
                  type="button"
                  className="ml-1 text-blue-600 hover:underline"
                  onClick={openAddModal}
                >
                  Add the first key.
                </button>
              )}
            </div>
          ) : (
            <table className="table table-sm w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Email</th>
                  <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Key (masked)</th>
                  <th className="w-16 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry, i) => {
                  const isNew = entry.id === newEntryId;
                  return (
                    <tr
                      key={entry.id ?? `env-${i}`}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: isNew ? "#eff6ff" : undefined,
                      }}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-800">{entry.email}</span>
                          {entry.readonly && (
                            <span className="badge badge-xs" style={{ background: "#e2e8f0", color: "#64748b" }}>
                              env
                            </span>
                          )}
                          {isNew && (
                            <span className="badge badge-xs" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                              new
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-slate-600">{entry.masked_key}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!entry.readonly && entry.id && (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost text-error hover:bg-red-50"
                            onClick={() => handleDelete(entry)}
                            disabled={deletingId === entry.id}
                            title="Delete key"
                          >
                            {deletingId === entry.id ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <TrashIcon />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div
            className="px-5 py-2.5 flex items-center justify-between"
            style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}
          >
            <span className="text-xs text-slate-400">
              {data.entries.filter((e) => !e.readonly).length} managed key(s)
            </span>
            <button
              type="button"
              className="btn btn-xs btn-ghost text-slate-400 text-xs"
              onClick={fetchKeys}
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Add key modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(15,23,42,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Add API Key</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                  Email / label
                </label>
                <input
                  type="email"
                  className="input input-bordered w-full input-sm"
                  placeholder="user@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block">
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input input-bordered flex-1 input-sm font-mono text-xs"
                    value={addKey}
                    onChange={(e) => setAddKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost border border-slate-200"
                    onClick={() => handleCopy(addKey, "modal")}
                    title="Copy key"
                  >
                    {copiedKey === "modal" ? (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost border border-slate-200 text-xs"
                    onClick={() => setAddKey(generateKey())}
                    title="Regenerate"
                  >
                    ↻
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Copy this key now — it cannot be retrieved after saving.
                </p>
              </div>

              {addError && (
                <p className="text-xs text-error">{addError}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                className="btn btn-sm btn-ghost border border-slate-200"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: "#2563eb", color: "white", border: "none" }}
                onClick={handleAdd}
                disabled={addLoading}
              >
                {addLoading ? <span className="loading loading-spinner loading-xs" /> : null}
                Save key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
