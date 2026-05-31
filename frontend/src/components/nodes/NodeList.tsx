"use client";

import { kindBadgeClass } from "@/lib/utils";
import type { GraphNode } from "@/lib/types";

interface NodeListProps {
  nodes: GraphNode[];
  selectedId?: string;
  onSelect: (node: GraphNode) => void;
  searchQuery?: string;
}

export function NodeList({
  nodes,
  selectedId,
  onSelect,
  searchQuery = "",
}: NodeListProps) {
  const filtered = searchQuery
    ? nodes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : nodes;

  if (filtered.length === 0) {
    return (
      <div className="text-slate-400 text-xs p-4 text-center italic">
        No nodes found
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-0 w-full">
      {filtered.map((node) => {
        const isSelected = selectedId === node.id;
        return (
          <li key={node.id}>
            <button
              type="button"
              className="flex flex-col items-start gap-1 text-left w-full rounded-lg px-2.5 py-2 transition-colors"
              style={{
                background: isSelected ? "#eff6ff" : "transparent",
                borderLeft: isSelected ? "2px solid #2563eb" : "2px solid transparent",
              }}
              onClick={() => onSelect(node)}
            >
              <span
                className="font-medium text-sm truncate w-full"
                style={{ color: isSelected ? "#1d4ed8" : "#1e293b" }}
              >
                {node.title}
              </span>
              {node.description && (
                <span className="text-xs text-slate-400 truncate w-full leading-tight">
                  {node.description}
                </span>
              )}
              <div className="flex gap-1 mt-0.5">
                <span className={`badge badge-xs ${kindBadgeClass(node.kind)}`}>
                  {node.kind}
                </span>
                {node.managed && (
                  <span className="badge badge-xs badge-ghost text-slate-400">
                    managed
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
