"""The DEAP genetic algorithm loop (Batch 8).

Uses real DEAP components end to end — nothing hand-rolled:
    - Selection: ``tools.selTournament``, ``tournsize=5``
    - Crossover: ``tools.cxUniform``, ``indpb=0.5``
    - Mutation:  ``tools.mutGaussian`` with an ADAPTIVE sigma (see below)
    - Elitism:   manual (DEAP has no built-in "elitism" operator) — the top
      ``elitism_fraction`` of each generation is copied unchanged (genes AND
      fitness) into the next generation, verified byte-for-byte in tests.

Adaptive sigma: starts at ``sigma_base`` (as a fraction of each gene's ``[min, max]``
range). If the population's best fitness hasn't improved for ``plateau_generations``
(default 5) CONSECUTIVE generations, sigma halves and the stagnation counter resets —
so it takes another 5 stagnant generations before it halves again.

Termination: stop at ``max_generations``, OR early if best fitness has improved by
<= ``convergence_threshold_pct`` (default 1%) over the last ``convergence_window``
(default 10) generations.

The loop takes an injected ``evaluate_fn`` (genes -> fitness) so it's testable
without running any real backtest.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from deap import base, creator, tools

if not hasattr(creator, "FitnessMax"):
    creator.create("FitnessMax", base.Fitness, weights=(1.0,))
if not hasattr(creator, "Individual"):
    creator.create("Individual", list, fitness=creator.FitnessMax)


@dataclass
class GAConfig:
    population_size: int = 20
    max_generations: int = 50
    crossover_prob: float = 0.7          # probability a selected pair undergoes crossover
    crossover_indpb: float = 0.5         # cxUniform per-gene swap probability
    mutation_prob: float = 0.3           # probability an individual undergoes mutation
    mutation_indpb: float = 0.2          # mutGaussian per-gene mutation probability
    sigma_base: float = 0.1              # initial mutation sigma, as a fraction of each gene's range
    elitism_fraction: float = 0.1
    tournament_size: int = 5
    plateau_generations: int = 5         # generations with no improvement before sigma halves
    convergence_window: int = 10
    convergence_threshold_pct: float = 1.0


@dataclass
class GenerationRecord:
    generation: int
    best_fitness: float
    avg_fitness: float
    sigma: float


@dataclass
class GAResult:
    final_population: list[tuple[list[float], float]]  # (genes, fitness), best first
    history: list[GenerationRecord]
    generations_run: int
    best_individual: list[float]
    best_fitness: float
    plateau_halvings: int = 0


def _clone(ind) -> creator.Individual:
    new = creator.Individual(ind[:])
    if ind.fitness.valid:
        new.fitness.values = ind.fitness.values
    return new


def _clamp(ind, gene_bounds: Sequence[tuple[float, float]]) -> None:
    for i, (lo, hi) in enumerate(gene_bounds):
        ind[i] = min(max(ind[i], lo), hi)


def run_ga(
    initial_individuals: list[list[float]],
    gene_bounds: Sequence[tuple[float, float]],
    evaluate_fn: Callable[[list[float]], float],
    config: GAConfig,
    on_generation: Callable[[GenerationRecord, int], None] | None = None,
) -> GAResult:
    """Run the GA. If ``on_generation`` is given, it is called synchronously with
    (record, max_generations) after each generation is scored — Batch 19's hook for
    realtime evolution_progress. Default None keeps the function pure and unchanged
    for every existing caller (the determinism tests call it without a callback)."""
    if not initial_individuals:
        raise ValueError("initial_individuals must be non-empty")

    toolbox = base.Toolbox()
    toolbox.register("mate", tools.cxUniform, indpb=config.crossover_indpb)
    toolbox.register("select", tools.selTournament, tournsize=config.tournament_size)

    population = [creator.Individual(genes) for genes in initial_individuals]
    for ind in population:
        _clamp(ind, gene_bounds)
        ind.fitness.values = (evaluate_fn(list(ind)),)

    n_elite = max(1, math.ceil(config.elitism_fraction * len(population)))
    gene_ranges = [hi - lo for lo, hi in gene_bounds]

    sigma = config.sigma_base
    best_fitness_history = [max(ind.fitness.values[0] for ind in population)]
    generations_since_improvement = 0
    plateau_halvings = 0
    history = [
        GenerationRecord(
            generation=0,
            best_fitness=best_fitness_history[0],
            avg_fitness=sum(ind.fitness.values[0] for ind in population) / len(population),
            sigma=sigma,
        )
    ]

    generations_run = 0
    for gen in range(1, config.max_generations + 1):
        ranked = sorted(population, key=lambda ind: ind.fitness.values[0], reverse=True)
        elites = [_clone(ind) for ind in ranked[:n_elite]]

        n_offspring = len(population) - n_elite
        selected = toolbox.select(population, n_offspring) if n_offspring > 0 else []
        offspring = [_clone(ind) for ind in selected]

        for i in range(0, len(offspring) - 1, 2):
            if random.random() < config.crossover_prob:
                toolbox.mate(offspring[i], offspring[i + 1])
                del offspring[i].fitness.values
                del offspring[i + 1].fitness.values

        for ind in offspring:
            if random.random() < config.mutation_prob:
                per_gene_sigma = [sigma * r for r in gene_ranges]
                tools.mutGaussian(ind, mu=0, sigma=per_gene_sigma, indpb=config.mutation_indpb)
                del ind.fitness.values

        for ind in offspring:
            _clamp(ind, gene_bounds)
        for ind in offspring:
            if not ind.fitness.valid:
                ind.fitness.values = (evaluate_fn(list(ind)),)

        population = elites + offspring
        generations_run = gen

        current_best = max(ind.fitness.values[0] for ind in population)
        current_avg = sum(ind.fitness.values[0] for ind in population) / len(population)

        # Adaptive sigma: halve after `plateau_generations` consecutive non-improving generations.
        if current_best > best_fitness_history[-1] + 1e-12:
            generations_since_improvement = 0
        else:
            generations_since_improvement += 1
        best_fitness_history.append(current_best)

        if generations_since_improvement >= config.plateau_generations:
            sigma = sigma / 2.0
            plateau_halvings += 1
            generations_since_improvement = 0

        record = GenerationRecord(
            generation=gen, best_fitness=current_best, avg_fitness=current_avg, sigma=sigma
        )
        history.append(record)
        if on_generation is not None:
            on_generation(record, config.max_generations)

        if len(best_fitness_history) > config.convergence_window:
            window_start = best_fitness_history[-(config.convergence_window + 1)]
            if window_start != 0:
                improvement_pct = abs((current_best - window_start) / window_start) * 100
            else:
                improvement_pct = 0.0 if current_best == window_start else 100.0
            if improvement_pct <= config.convergence_threshold_pct:
                break

    ranked_final = sorted(population, key=lambda ind: ind.fitness.values[0], reverse=True)
    return GAResult(
        final_population=[(list(ind), ind.fitness.values[0]) for ind in ranked_final],
        history=history,
        generations_run=generations_run,
        best_individual=list(ranked_final[0]),
        best_fitness=ranked_final[0].fitness.values[0],
        plateau_halvings=plateau_halvings,
    )
