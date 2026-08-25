from __future__ import annotations

from pathlib import Path

from evaluation.runner import THRESHOLDS, run_evaluation


def test_phase0_baseline_meets_all_thresholds(tmp_path: Path) -> None:
    report = run_evaluation(tmp_path / "run")

    assert report["passed"], report["failures"]
    for name, expected in THRESHOLDS.items():
        assert report["metrics"][name] == expected, f"{name} 未达基线"
    assert report["dataset"]["expected_events"] == 8
    assert report["dataset"]["notes"] == 6


def test_phase0_baseline_is_deterministic_across_runs(tmp_path: Path) -> None:
    first = run_evaluation(tmp_path / "run-one")
    second = run_evaluation(tmp_path / "run-two")

    assert first["metrics"] == second["metrics"]
    assert first["dataset"] == second["dataset"]
    assert first["processor_versions"] == second["processor_versions"]
