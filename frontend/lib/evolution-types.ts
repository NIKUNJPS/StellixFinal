/** Types mirroring backend app/schemas/evolution.py. */

export type EvolutionRunStatusValue = "running" | "completed" | "failed";

export interface GAConfigOverrides {
  population_size?: number;
  max_generations?: number;
  crossover_prob?: number;
  crossover_indpb?: number;
  mutation_prob?: number;
  mutation_indpb?: number;
  sigma_base?: number;
  elitism_fraction?: number;
  tournament_size?: number;
  plateau_generations?: number;
  convergence_window?: number;
  convergence_threshold_pct?: number;
}

export interface EvolutionRunRequest {
  symbol: string;
  strategy_ids: string[] | "all";
  ga_config: GAConfigOverrides;
}

export interface EvolutionRunEnqueued {
  run_id: string;
  message: string;
  task_id: string | null;
}

export interface GenerationRecord {
  generation: number;
  best_fitness: number;
  avg_fitness: number;
  sigma: number;
}

export interface EvolutionRunSummary {
  id: string;
  symbol: string;
  status: EvolutionRunStatusValue;
  best_fitness: number | null;
  generations_run: number;
  candidate_count: number;
  created_at: string;
}

export interface EvolutionRunListResponse {
  total: number;
  items: EvolutionRunSummary[];
}

export interface EvolutionRunDetail {
  id: string;
  symbol: string;
  status: EvolutionRunStatusValue;
  ga_config: Required<GAConfigOverrides>;
  seed_strategy_ids: string[];
  generation_history: GenerationRecord[];
  best_fitness: number | null;
  generations_run: number;
  candidate_strategy_ids: string[];
  error: string | null;
  created_at: string;
}

export interface PendingCandidate {
  id: string;
  name: string;
  parent_strategy_id: string | null;
  robustness_score: number | null;
  regime_compatibility: Record<string, number | null> | null;
  created_at: string;
}

export interface PendingCandidatesResponse {
  items: PendingCandidate[];
}
