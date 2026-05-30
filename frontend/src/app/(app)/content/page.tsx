"use client";

import { useState } from "react";
import {
  useNodes,
  useNode,
  saveNode,
  removeNode,
  invalidateNodes,
} from "@/hooks/useNodes";
import { NodeList } from "@/components/nodes/NodeList";
import { NodeEditor } from "@/components/nodes/NodeEditor";
import { logAudit } from "@/lib/audit";
import type { GraphNode, NodeKind } from "@/lib/types";

const CONTENT_KINDS: NodeKind[] = ["content", "rule", "memory", "skill-fix"];

export default function ContentPage() {
  const [kindFilter, setKindFilter] = useState<NodeKind | "">("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newNodeId, setNewNodeId] = useState("");
  const [newKind, setNewKind] = useState<NodeKind>("content");
  const [newBody, setNewBody] = useState("");

  const { data: nodesData, isLoading } = useNodes(kindFilter || undefined);
  const { data: selectedNode, isLoading: nodeLoading } = useNode(selectedId);

  const nodes = (nodesData?.nodes ?? []).filter(
    (n) => !["skill", "entry"].includes(n.kind),
  );

  async function handleSave(payload: {
    body: string;
    frontmatter: Record<string, unknown>;
  }) {
    setError(null);
    setSaving(true);
    try {
      if (creatingNew) {
        const id = newNodeId.trim();
        if (!id) {
          setError("Node ID is required");
          return;
        }
        const result = await saveNode(null, {
          newId: id,
          body: payload.body,
          frontmatter: { ...payload.frontmatter, kind: newKind },
          kind: newKind,
        });
        logAudit({ ts: Date.now(), action: "create", nodeId: result.id, nodeKind: newKind });
        setCreatingNew(false);
        setSelectedId(result.id);
      } else if (selectedId) {
        await saveNode(selectedId, payload);
        await invalidateNodes(selectedId);
        logAudit({
          ts: Date.now(),
          action: "update",
          nodeId: selectedId,
          nodeKind: selectedNode?.kind,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await removeNode(selectedId);
      logAudit({
        ts: Date.now(),
        action: "delete",
        nodeId: selectedId,
        nodeKind: selectedNode?.kind,
      });
      setSelectedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const newNodeAsGraphNode: GraphNode | null = creatingNew
    ? {
        id: newNodeId || "(new)",
        title: newNodeId || "(new)",
        description: "",
        kind: newKind,
        path: "",
        managed: true,
        body: newBody,
        frontmatter: { kind: newKind },
        links: [],
        inbound_links: [],
      }
    : null;

  const editorNode = creatingNew ? newNodeAsGraphNode : selectedNode ?? null;

  return (
    <div className="flex gap-4 h-[calc(100vh-6.5rem)]">
      {/* Left panel */}
      <div className="w-64 shrink-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3 overflow-hidden">
        <div className="flex items-center justify-between gap-1">
          <h2 className="font-semibold text-sm text-slate-700">Content</h2>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              setCreatingNew(true);
              setSelectedId(null);
              setNewNodeId("");
              setNewBody("");
            }}
          >
            + New
          </button>
        </div>

        <select
          className="select select-bordered select-xs w-full"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as NodeKind | "")}
        >
          <option value="">All kinds</option>
          {CONTENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <input
          type="text"
          className="input input-bordered input-xs w-full"
          placeholder="Filter content…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner loading-sm text-primary" />
            </div>
          ) : (
            <NodeList
              nodes={nodes}
              selectedId={selectedId ?? undefined}
              onSelect={(n) => {
                setSelectedId(n.id);
                setCreatingNew(false);
              }}
              searchQuery={search}
            />
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-5 overflow-auto flex flex-col gap-3">
        {error && (
          <div role="alert" className="alert alert-error text-sm py-2">
            <span>{error}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setError(null)}
            >
              ✕
            </button>
          </div>
        )}

        {creatingNew && (
          <div className="flex gap-2 items-end flex-wrap bg-slate-50 rounded-lg border border-slate-200 p-3">
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text text-xs font-medium text-slate-600">Kind</span>
              </div>
              <select
                className="select select-bordered select-sm"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as NodeKind)}
              >
                {CONTENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control flex-1 min-w-48">
              <div className="label py-0">
                <span className="label-text text-xs font-medium text-slate-600">Node ID</span>
              </div>
              <input
                type="text"
                className="input input-bordered input-sm w-full font-mono"
                placeholder="rules/my-rule or content/my-page"
                value={newNodeId}
                onChange={(e) => setNewNodeId(e.target.value)}
              />
            </label>
          </div>
        )}

        {nodeLoading && !creatingNew ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        ) : editorNode ? (
          <NodeEditor
            node={editorNode}
            onSave={handleSave}
            onDelete={handleDelete}
            saving={saving}
            deleting={deleting}
          />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">No content selected</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose a node from the list or create a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
