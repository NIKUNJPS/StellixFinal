"""Test 5 (required order): assert the top 10% from generation N are present
unchanged in generation N+1 (byte-for-byte comparison) — elitism is implemented
manually since DEAP has no built-in operator by that name."""

from __future__ import annotations

import random

from app.evolution.ga import GAConfig, _clone, run_ga
from deap import creator


def test_top_elite_survives_one_generation_byte_for_byte():
    random.seed(7)

    def evaluate_fn(genes: list[float]) -> float:
        return sum(genes)

    initial = [[random.uniform(0, 10) for _ in range(4)] for _ in range(10)]
    bounds = [(0.0, 10.0)] * 4
    config = GAConfig(population_size=10, max_generations=1, elitism_fraction=0.1, tournament_size=3)

    # Reproduce generation 0's population + fitness exactly as run_ga would build it,
    # so we can identify which individual(s) SHOULD be preserved as elites.
    population = [creator.Individual(genes) for genes in initial]
    for ind in population:
        ind.fitness.values = (evaluate_fn(list(ind)),)
    ranked_gen0 = sorted(population, key=lambda ind: ind.fitness.values[0], reverse=True)
    n_elite = max(1, round(0.1 * len(population)))
    expected_elites = [(list(ind), ind.fitness.values[0]) for ind in ranked_gen0[:n_elite]]

    result = run_ga(initial, bounds, evaluate_fn, config)
    gen1_genes = [genes for genes, _fitness in result.final_population]
    gen1_fitness_by_genes = {tuple(genes): fitness for genes, fitness in result.final_population}

    print("Generation 0 top elite (genes, fitness):", expected_elites)
    print("Generation 1 population (genes, fitness):", result.final_population)

    for elite_genes, elite_fitness in expected_elites:
        assert elite_genes in gen1_genes, f"elite {elite_genes} did not survive unchanged into generation 1"
        # Byte-for-byte: exact float equality, not just "close enough".
        assert gen1_fitness_by_genes[tuple(elite_genes)] == elite_fitness


def test_elite_count_is_ten_percent_rounded_up():
    random.seed(3)

    def evaluate_fn(genes: list[float]) -> float:
        return sum(genes)

    initial = [[random.uniform(0, 10) for _ in range(4)] for _ in range(23)]
    bounds = [(0.0, 10.0)] * 4
    config = GAConfig(population_size=23, max_generations=1, elitism_fraction=0.1, tournament_size=3)

    population = [creator.Individual(genes) for genes in initial]
    for ind in population:
        ind.fitness.values = (evaluate_fn(list(ind)),)
    ranked = sorted(population, key=lambda ind: ind.fitness.values[0], reverse=True)
    # ceil(0.1 * 23) = 3
    top3 = [(list(ind), ind.fitness.values[0]) for ind in ranked[:3]]

    result = run_ga(initial, bounds, evaluate_fn, config)
    gen1_genes = [genes for genes, _fitness in result.final_population]
    for elite_genes, _fitness in top3:
        assert elite_genes in gen1_genes


def test_clone_produces_an_independent_copy_not_an_alias():
    ind = creator.Individual([1.0, 2.0, 3.0])
    ind.fitness.values = (9.0,)
    cloned = _clone(ind)
    cloned[0] = 999.0
    assert ind[0] == 1.0  # original untouched by mutating the clone
    assert cloned.fitness.values == (9.0,)  # fitness copied over correctly
