"use client";

import { useState } from "react";
import { useSearch, useNode, useStats } from "@/hooks/useNodes";
import { addEdge, removeEdge } from "@/lib/api";
import { kindBadgeClass, managedBadge } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { NodeGraph } from "@/components/graph/NodeGraph";

export default function GraphPage() {
  const { data: stats } = useStats();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removedLinks, setRemovedLinks] = useState<ReadonlySet<string>>(new Set());
  const [removedForNode, setRemovedForNode] = useState<string | null>(null);
  const [edgeSrc, setEdgeSrc] = useState("");
  const [edgeDst, setEdgeDst] = useState("");
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [edgeSaving, setEdgeSaving] = useState(false);

  const { data: searchData, isLoading: searchLoading } = useSearch(debouncedQuery);
  const { data: nodeDetail } = useNode(selectedId);

  const nodeId = nodeDetail?.id ?? null;
  const localLinks = (nodeDetail?.links ?? []).filter(
    (link) => !(removedForNode === nodeId && removedLinks.has(link)),
  );

  async function handleRemoveLink(link: string) {
    if (!nodeId) return;
    setRemovedForNode(nodeId);
    setRemovedLinks((prev) => {
      const next = new Set(prev);
      next.add(link);
      return next;
    });
    try {
      await removeEdge(nodeId, link);
      logAudit({
        ts: Date.now(),
        action: "edge_remove",
        nodeId,
        nodeKind: nodeDetail?.kind,
        detail: `→ ${link}`,
      });
    } catch {
      // Revert optimistic removal on error
      setRemovedLinks((prev) => {
        const next = new Set(prev);
        next.delete(link);
        return next;
      });
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setDebouncedQuery(query.trim());
  }

  async function handleAddEdge() {
    setEdgeError(null);
    if (!edgeSrc.trim() || !edgeDst.trim()) {
      setEdgeError("Both source and destination are required");
      return;
    }
    setEdgeSaving(true);
    try {
      await addEdge(edgeSrc.trim(), edgeDst.trim());
      logAudit({
        ts: Date.now(),
        action: "edge_add",
        nodeId: edgeSrc.trim(),
        detail: `→ ${edgeDst.trim()}`,
      });
      setEdgeSrc("");
      setEdgeDst("");
    } catch (err: unknown) {
      setEdgeError(err instanceof Error ? err.message : "Failed to add edge");
    } finally {
      setEdgeSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Graph Explorer</h1>
          <p className="text-sm text-slate-500 mt-0.5">Search, inspect, and manage node relationships</p>
        </div>
        {stats && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{stats.nodes}</p>
              <p className="text-xs text-slate-400">nodes</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-right">
              <p className="text-2xl font-bold text-violet-600">{stats.edges}</p>
              <p className="text-xs text-slate-400">edges</p>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Search Nodes</h2>
        <form className="flex gap-2" onSubmit={handleSearch}>
          <input
            type="text"
            className="input input-bordered input-sm flex-1"
            placeholder="Search by title or content…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm px-5">
            Search
          </button>
        </form>

        {searchLoading && (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        )}

        {searchData && searchData.hits.length === 0 && (
          <p className="text-sm text-slate-400 mt-3 italic">
            No results for &ldquo;{searchData.query}&rdquo;
          </p>
        )}

        {searchData && searchData.hits.length > 0 && (
          <div className="flex flex-col gap-1 mt-3">
            {searchData.hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                className={`text-left rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors border ${
                  selectedId === hit.id
                    ? "border-primary bg-blue-50"
                    : "border-transparent"
                }`}
                onClick={() => setSelectedId(hit.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-slate-800">{hit.title}</span>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {hit.score.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{hit.id}</div>
                {hit.why_matched && (
                  <div className="text-xs text-slate-400 mt-0.5 italic">{hit.why_matched}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Node detail */}
      {nodeDetail && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{nodeDetail.title}</h2>
              <span className="font-mono text-xs text-slate-400">{nodeDetail.id}</span>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <span className={`badge badge-sm ${kindBadgeClass(nodeDetail.kind)}`}>
                {nodeDetail.kind}
              </span>
              <span className={`badge badge-sm ${managedBadge(nodeDetail.managed)}`}>
                {nodeDetail.managed ? "managed" : "bundled"}
              </span>
            </div>
          </div>

          {nodeDetail.description && (
            <p className="text-sm text-slate-600 -mt-2">{nodeDetail.description}</p>
          )}

          {/* Graph visualization */}
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <NodeGraph
              key={nodeDetail.id}
              node={nodeDetail}
              onSelectNode={setSelectedId}
            />
          </div>

          {/* Links */}
          <div className="grid md:grid-cols-2 gap-4">
            {localLinks.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  Outbound ({localLinks.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {localLinks.map((link) => (
                    <div key={link} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="badge badge-outline badge-sm font-mono hover:badge-primary transition-colors"
                        onClick={() => setSelectedId(link)}
                      >
                        {link}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error px-1 h-5 min-h-5"
                        title="Remove edge"
                        onClick={() => handleRemoveLink(link)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nodeDetail.inbound_links && nodeDetail.inbound_links.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  Inbound ({nodeDetail.inbound_links.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {nodeDetail.inbound_links.map((link) => (
                    <button
                      key={link}
                      type="button"
                      className="badge badge-outline badge-sm font-mono hover:badge-secondary transition-colors"
                      onClick={() => setSelectedId(link)}
                    >
                      {link}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add edge */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add Edge</h2>
        {edgeError && (
          <div role="alert" className="alert alert-error text-sm py-2 mb-3">
            <span>{edgeError}</span>
          </div>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <label className="form-control flex-1 min-w-40">
            <div className="label py-0">
              <span className="label-text text-xs text-slate-500">Source node ID</span>
            </div>
            <input
              type="text"
              className="input input-bordered input-sm font-mono"
              placeholder="skills/git-commit"
              value={edgeSrc}
              onChange={(e) => setEdgeSrc(e.target.value)}
            />
          </label>
          <div className="pb-1 text-slate-400 font-bold">→</div>
          <label className="form-control flex-1 min-w-40">
            <div className="label py-0">
              <span className="label-text text-xs text-slate-500">Destination node ID</span>
            </div>
            <input
              type="text"
              className="input input-bordered input-sm font-mono"
              placeholder="rules/security"
              value={edgeDst}
              onChange={(e) => setEdgeDst(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAddEdge}
            disabled={edgeSaving}
          >
            {edgeSaving ? (
              <span className="loading loading-spinner loading-xs" />
            ) : null}
            Add edge
          </button>
        </div>
      </div>
    </div>
  );
}
