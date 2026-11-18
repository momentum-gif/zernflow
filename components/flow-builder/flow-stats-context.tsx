"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { FlowStats } from "@/lib/automation-stats";

const FlowStatsContext = createContext<FlowStats | null>(null);

/** Loads per-step stats once for the builder (see /api/v1/flows/:id/stats). */
export function FlowStatsProvider({ flowId, children }: { flowId: string; children: ReactNode }) {
  const [stats, setStats] = useState<FlowStats | null>(null);
  useEffect(() => {
    fetch(`/api/v1/flows/${flowId}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStats(s))
      .catch(() => {});
  }, [flowId]);
  return <FlowStatsContext.Provider value={stats}>{children}</FlowStatsContext.Provider>;
}

export function useFlowStats() {
  return useContext(FlowStatsContext);
}
