/**
 * Button codes ("btn_…") link a button to its connected step and must be unique
 * across automations. A duplicated flow or a template gets fresh ones, applied
 * consistently to the buttons and their connections.
 */
export function refreshButtonPayloads<N, E>(nodes: N, edges: E): { nodes: N; edges: E } {
  const map = new Map<string, string>();
  const swap = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value).replace(/btn_[A-Za-z0-9_]+/g, (code) => {
        if (!map.has(code)) map.set(code, `btn_${Math.random().toString(36).slice(2, 10)}`);
        return map.get(code)!;
      }),
    );
  return { nodes: swap(nodes), edges: swap(edges) };
}
