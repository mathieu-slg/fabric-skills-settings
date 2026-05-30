"use client";

import { useEffect, useState, useCallback } from "react";
import { useStats } from "@/hooks/useNodes";
import { kindBadgeClass } from "@/lib/utils";

interface HealthCheck {
  status: "checking" | "ok" | "error";
  latencyMs?: number;
  error?: string;
  checkedAt?: number;
}

function LatencyBar({ ms }: { ms: number }) {
  const max = 800;
  const pct = Math.min((ms / max) * 100, 100);
  const color =
    ms < 200 ? "bg-success" : ms < 500 ? "bg-warning" : "bg-error";
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function HealthPage() {
  const { data: stats, error: statsError, isLoading: statsLoading } = useStats();
  const [health, setHealth] = useState<HealthCheck>({ status: "checking" });
  const [refreshing, setRefreshing] = useState(false);

  const checkHealth = useCallback(async () => {
    setRefreshing(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/proxy/stats");
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        setHealth({ status: "ok", latencyMs, checkedAt: Date.now() });
      } else {
        setHealth({
          status: "error",
          error: `HTTP ${res.status}`,
          latencyMs,
          checkedAt: Date.now(),
        });
      }
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      setHealth({
        status: "error",
        error: err instanceof Error ? err.message : "Connection failed",
        latencyMs,
        checkedAt: Date.now(),
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const t = setInterval(checkHealth, 30_000);
    return () => clearInterval(t);
  }, [checkHealth]);

  const latencyColor =
    health.latencyMs === undefined
      ? "text-slate-400"
      : health.latencyMs < 200
        ? "text-success"
        : health.latencyMs < 500
          ? "text-warning"
          : "text-error";

  const latencyLabel =
    health.latencyMs === undefined
      ? "Not measured"
      : health.latencyMs < 200
        ? "Excellent"
        : health.latencyMs < 500
          ? "Acceptable"
          : "Needs attention";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">System Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Server status, latency, and graph metrics
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost border border-slate-200 bg-white"
          onClick={checkHealth}
          disabled={refreshing}
        >
          {refreshing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Server status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Server Status
          </p>
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                health.status === "checking"
                  ? "bg-slate-300 animate-pulse"
                  : health.status === "ok"
                    ? "bg-success"
                    : "bg-error"
              }`}
            />
            <span className="text-sm font-semibold text-slate-800">
              {health.status === "checking"
                ? "Checking…"
                : health.status === "ok"
                  ? "Operational"
                  : "Degraded"}
            </span>
          </div>
          {health.error && (
            <p className="text-xs text-error mt-1">{health.error}</p>
          )}
          {health.checkedAt && (
            <p className="text-xs text-slate-400 mt-2">
              Checked at {new Date(health.checkedAt).toLocaleTimeString()}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-1">Auto-refreshes every 30s</p>
        </div>

        {/* Latency */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Response Latency
          </p>
          <p className={`text-3xl font-bold ${latencyColor}`}>
            {health.latencyMs !== undefined ? `${health.latencyMs}ms` : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-1">{latencyLabel}</p>
          {health.latencyMs !== undefined && (
            <LatencyBar ms={health.latencyMs} />
          )}
        </div>

        {/* Graph build */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Graph Build
          </p>
          {statsLoading ? (
            <span className="loading loading-spinner loading-sm text-slate-300" />
          ) : statsError ? (
            <p className="text-sm text-error">Failed to load</p>
          ) : stats ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-sm font-semibold text-slate-800">Built</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {stats.built_at
                  ? new Date(stats.built_at).toLocaleString()
                  : "Unknown build time"}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Graph metrics */}
      {stats && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Graph Metrics</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total nodes", value: stats.nodes, color: "text-blue-600" },
              { label: "Total edges", value: stats.edges, color: "text-violet-600" },
              {
                label: "Edges / node",
                value: stats.nodes > 0 ? (stats.edges / stats.nodes).toFixed(1) : "—",
                color: "text-slate-700",
              },
              {
                label: "Node kinds",
                value: Object.keys(stats.by_kind).length,
                color: "text-slate-700",
              },
            ].map((m) => (
              <div key={m.label} className="bg-slate-50 rounded-lg px-3 py-3">
                <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9" }} className="pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Node kind breakdown
            </p>
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-slate-50" style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Kind
                    </th>
                    <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Count
                    </th>
                    <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      % of total
                    </th>
                    <th className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">
                      Distribution
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.by_kind)
                    .sort(([, a], [, b]) => b - a)
                    .map(([kind, count]) => (
                      <tr
                        key={kind}
                        className="hover:bg-slate-50"
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        <td className="py-2.5">
                          <span className={`badge badge-xs ${kindBadgeClass(kind)}`}>
                            {kind}
                          </span>
                        </td>
                        <td className="text-sm font-mono font-semibold text-slate-700 py-2.5">
                          {count}
                        </td>
                        <td className="text-xs text-slate-500 py-2.5">
                          {((count / stats.nodes) * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary opacity-70"
                              style={{ width: `${(count / stats.nodes) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
