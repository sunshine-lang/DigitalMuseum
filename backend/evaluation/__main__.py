from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from evaluation.runner import dataset_digest, run_evaluation


def main() -> int:
    parser = argparse.ArgumentParser(description="运行 Phase 0 评测基线")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="JSON 报告输出路径（默认 data/evaluation/phase0-baseline.json）",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="digital-museum-eval-") as temp:
        report = run_evaluation(Path(temp))

    output = args.output
    if output is None:
        project_root = Path(__file__).resolve().parents[2]
        output = project_root / "data" / "evaluation" / "phase0-baseline.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    report["dataset_digest"] = dataset_digest()
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"评测报告已写入 {output}")
    for name, value in report["metrics"].items():
        print(f"  {name}: {value}")
    print(f"  passed: {report['passed']}")
    for failure in report["failures"]:
        print(f"  FAIL {failure}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
