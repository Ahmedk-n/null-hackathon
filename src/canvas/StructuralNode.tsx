"use client";
import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import type { NodeType } from "@/engine";

export interface StructuralNodeData {
  label: string;
  type: NodeType;
  confidence: number;
  isKeystone: boolean;
  isFailed: boolean;
  [key: string]: unknown;
}

const BORDER: Record<NodeType, string> = { thesis: "#3b82f6", claim: "#14b8a6", assumption: "#4b5563" };

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const border = data.isKeystone ? "#ef4444" : BORDER[data.type];
  const fill = data.isKeystone ? "#2a1416" : data.type === "thesis" ? "#12233b" : data.type === "claim" ? "#0f2528" : "#1a2130";
  return (
    <motion.div
      animate={data.isFailed ? { opacity: 0.4, rotate: -4, y: 8 } : { opacity: 1, rotate: 0, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        width: 200,
        height: 72,
        borderRadius: 10,
        border: `2px solid ${border}`,
        background: fill,
        boxShadow: data.isKeystone ? "0 0 14px rgba(239,68,68,0.6)" : "none",
        padding: 8,
        boxSizing: "border-box",
        color: "#e6edf3",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: data.isKeystone ? "#f87171" : "#8b98a5" }}>
        {(data.isKeystone ? "KEYSTONE" : data.type.toUpperCase())} · {data.confidence.toFixed(2)}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}
