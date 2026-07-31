/** Types mirroring backend app/schemas/graph.py. */

export type NodeType = "Strategy" | "Regime" | "Performance" | "Failure" | "ResearchNote" | "Researcher";
export type EdgeType =
  | "VALID_IN"
  | "FAILED_IN"
  | "MUTATED_FROM"
  | "INSPIRED_BY"
  | "ADAPTED_FROM"
  | "EVALUATED_BY"
  | "CAUSED_BY"
  | "AUTHORED_BY";

export const NODE_TYPES: NodeType[] = ["Strategy", "Regime", "Performance", "Failure", "ResearchNote", "Researcher"];
export const EDGE_TYPES: EdgeType[] = [
  "VALID_IN", "FAILED_IN", "MUTATED_FROM", "INSPIRED_BY", "ADAPTED_FROM", "EVALUATED_BY", "CAUSED_BY", "AUTHORED_BY",
];

export const NODE_COLORS: Record<NodeType, string> = {
  Strategy: "#3b82f6",
  Regime: "#f59e0b",
  Performance: "#10b981",
  Failure: "#dc2626",
  ResearchNote: "#8b5cf6",
  Researcher: "#64748b",
};

export interface GraphNodeProps {
  [key: string]: unknown;
}

export interface FailedStrategyByRegimeItem {
  strategy_id: string;
  name: string | null;
  status: string | null;
  failure_id: string | null;
  trigger_condition: string | null;
  llm_explanation: string | null;
  failure_timestamp: string;
}

export interface FailedStrategiesByRegimeResponse {
  regime: string;
  since: string;
  items: FailedStrategyByRegimeItem[];
}

export interface LineageEdge {
  from_id: string;
  edge_type: string;
  to_id: string;
}

export interface LineageResponse {
  strategy_id: string;
  found: boolean;
  target: GraphNodeProps | null;
  ancestors: GraphNodeProps[];
  descendants: GraphNodeProps[];
  edges: LineageEdge[];
}

export interface RobustAcrossRegimesItem {
  strategy_id: string;
  name: string | null;
  robustness_score: number | null;
  regime_count: number;
}

export interface RobustAcrossRegimesResponse {
  min_regimes: number;
  items: RobustAcrossRegimesItem[];
}

export interface RecurringFailureModeItem {
  regime_label: string | null;
  trigger_condition: string | null;
  occurrence_count: number;
  strategy_count: number;
  strategy_ids: string[];
}

export interface RecurringFailureModesResponse {
  min_occurrences: number;
  items: RecurringFailureModeItem[];
}

export interface ActiveStrategyRef {
  strategy_id: string;
  name: string | null;
}

export interface HypothesisLeadingToActiveItem {
  note_id: string;
  hypothesis: string | null;
  content: string | null;
  active_strategies: ActiveStrategyRef[];
}

export interface HypothesesLeadingToActiveResponse {
  items: HypothesisLeadingToActiveItem[];
}

export interface GraphEdgeRef {
  edge_type: string;
  other_labels: string[];
  other: GraphNodeProps;
  edge_properties: GraphNodeProps;
}

export interface NodeDetailResponse {
  node_type: string;
  node: GraphNodeProps;
  outgoing: GraphEdgeRef[];
  incoming: GraphEdgeRef[];
}

export interface SearchResultItem {
  node_type: string;
  properties: GraphNodeProps;
}

export interface SearchResponse {
  q: string;
  node_type: string | null;
  items: SearchResultItem[];
}
