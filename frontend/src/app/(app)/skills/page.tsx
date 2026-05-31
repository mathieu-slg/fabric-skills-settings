"use client";

import { useState } from "react";
import {
  useNodes,
  useNode,
  useTemplates,
  saveNode,
  removeNode,
  fetchTemplate,
  invalidateNodes,
} from "@/hooks/useNodes";
import { NodeList } from "@/components/nodes/NodeList";
import { NodeEditor } from "@/components/nodes/NodeEditor";
import { TemplatePicker } from "@/components/nodes/TemplatePicker";
import { logAudit } from "@/lib/audit";
import type { GraphNode } from "@/lib/types";

export default function SkillsPage() {
  const { data: nodesData, isLoading } = useNodes("skill");
  const { data: templatesData } = useTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newNode, setNewNode] = useState<GraphNode | null>(null);

  const { data: selectedNode, isLoading: nodeLoading } = useNode(selectedId);

  const skills = nodesData?.nodes ?? [];
  const templates = templatesData?.templates ?? [];

  async function handleTemplatePick(templateName: string) {
    setShowTemplatePicker(false);
    let body = "";
    let fm: Record<string, unknown> = {};
    if (templateName) {
      try {
        const tpl = await fetchTemplate(templateName);
        body = tpl.body;
        fm = tpl.frontmatter;
      } catch {
        body = "";
      }
    }
    setNewNode({
      id: "",
      title: "",
      description: "",
      kind: "skill",
      path: "",
      managed: true,
      body,
      frontmatter: fm,
      links: [],
      inbound_links: [],
    });
    setCreatingNew(true);
    setSelectedId(null);
  }

  async function handleSave(payload: {
    body: string;
    frontmatter: Record<string, unknown>;
  }) {
    setError(null);
    setSaving(true);
    try {
      if (creatingNew && newNode !== null) {
        const name = String(payload.frontmatter.name ?? "").trim();
        if (!name) {
          setError("Name is required");
          return;
        }
        const result = await saveNode(null, {
          newId: `skills/${name}`,
          body: payload.body,
          frontmatter: payload.frontmatter,
        });
        logAudit({ ts: Date.now(), action: "create", nodeId: result.id, nodeKind: "skill" });
        setCreatingNew(false);
        setNewNode(null);
        setSelectedId(result.id);
      } else if (selectedId) {
        await saveNode(selectedId, payload);
        await invalidateNodes(selectedId);
        logAudit({ ts: Date.now(), action: "update", nodeId: selectedId, nodeKind: "skill" });
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
      logAudit({ ts: Date.now(), action: "delete", nodeId: selectedId, nodeKind: "skill" });
      setSelectedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const editorNode = creatingNew && newNode ? newNode : selectedNode ?? null;

  return (
    <div className="flex gap-4 h-[calc(100vh-6.5rem)]">
      {/* Left panel */}
      <div className="w-64 shrink-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3 overflow-hidden">
        <div className="flex items-center justify-between gap-1">
          <h2 className="font-semibold text-sm text-slate-700">Skills</h2>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => setShowTemplatePicker(true)}
          >
            + New
          </button>
        </div>
        <input
          type="text"
          className="input input-bordered input-xs w-full"
          placeholder="Filter skills…"
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
              nodes={skills}
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
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-5 overflow-auto flex flex-col">
        {error && (
          <div role="alert" className="alert alert-error text-sm py-2 mb-3">
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
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">No skill selected</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose a skill from the list or create a new one
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowTemplatePicker(true)}
            >
              + New skill
            </button>
          </div>
        )}
      </div>

      {showTemplatePicker && (
        <TemplatePicker
          templates={templates}
          onSelect={handleTemplatePick}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}
