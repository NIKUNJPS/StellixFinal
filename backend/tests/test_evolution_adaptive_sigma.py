"""Test 4 (required order): construct a synthetic plateau (no improvement for 5+
generations) and assert sigma halves — showing the exact before/after values."""

from __future__ import annotations

import random

from app.evolution.ga import GAConfig, run_ga


def test_sigma_halves_after_five_stagnant_generations():
    random.seed(1)

    # A constant fitness function guarantees zero improvement every generation,
    # forcing a deterministic plateau from generation 1 onward.
    def flat_evaluate_fn(genes: list[float]) -> float:
        return 1.0

    initial = [[random.uniform(0, 10) for _ in range(4)] for _ in range(10)]
    bounds = [(0.0, 10.0)] * 4
    config = GAConfig(
        population_size=10,
        max_generations=6,
        plateau_generations=5,
        convergence_window=100,  # disable convergence early-stop for this test
        convergence_threshold_pct=0.0,
    )

    result = run_ga(initial, bounds, flat_evaluate_fn, config)

    sigma_before = result.history[4].sigma  # generation 4: still pre-plateau-trigger
    sigma_after = result.history[5].sigma  # generation 5: 5th consecutive stagnant generation

    print(f"sigma BEFORE plateau trigger (generation 4): {sigma_before}")
    print(f"sigma AFTER plateau trigger (generation 5): {sigma_after}")

    assert sigma_before == config.sigma_base == 0.1
    assert sigma_after == sigma_before / 2.0 == 0.05
    assert result.plateau_halvings >= 1


def test_sigma_halves_again_after_another_five_stagnant_generations():
    random.seed(1)

    def flat_evaluate_fn(genes: list[float]) -> float:
        return 1.0

    initial = [[random.uniform(0, 10) for _ in range(4)] for _ in range(10)]
    bounds = [(0.0, 10.0)] * 4
    config = GAConfig(
        population_size=10,
        max_generations=12,
        plateau_generations=5,
        convergence_window=100,
        convergence_threshold_pct=0.0,
    )

    result = run_ga(initial, bounds, flat_evaluate_fn, config)
    sigmas = {rec.generation: rec.sigma for rec in result.history}

    print("Full sigma trajectory:", sigmas)

    assert sigmas[0] == 0.1
    assert sigmas[4] == 0.1  # unchanged through generation 4
    assert sigmas[5] == 0.05  # halved at the 5th stagnant generation
    assert sigmas[9] == 0.05  # unchanged through the next 4
    assert sigmas[10] == 0.025  # halved again after another 5 stagnant generations
    assert result.plateau_halvings == 2


def test_sigma_does_not_halve_when_fitness_keeps_improving():
    random.seed(2)

    def improving_evaluate_fn(genes: list[float]) -> float:
        return sum(genes)  # a real gradient to climb -> should keep improving

    initial = [[random.uniform(0, 10) for _ in range(4)] for _ in range(10)]
    bounds = [(0.0, 10.0)] * 4
    config = GAConfig(population_size=10, max_generations=4, plateau_generations=5)

    result = run_ga(initial, bounds, improving_evaluate_fn, config)
    assert result.plateau_halvings == 0
    assert all(rec.sigma == config.sigma_base for rec in result.history)
