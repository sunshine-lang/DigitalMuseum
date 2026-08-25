from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from evaluation.builder import MANIFEST_PATH, NOTES_DIR, build_dataset, load_manifest

THRESHOLDS = {
    "claim_grounding_rate": 1.0,
    "key_event_recall": 1.0,
    "spurious_event_count": 0,
    "aggregation_correctness": 1.0,
    "rejection_correctness": 1.0,
    "restart_persistence": True,
}


def run_evaluation(workdir: Path) -> dict:
    """在独立目录上跑完整评测，返回含指标与结论的报告字典。"""
    manifest = load_manifest()
    dataset = build_dataset(workdir, manifest)

    app = create_app(
        database_url=f"sqlite:///{workdir / 'evaluation.db'}",
        upload_dir=workdir / "uploads",
        allowed_repo_roots=str(workdir),
    )
    with TestClient(app) as client:
        stage_id = _create_stage(client, manifest["stage"])
        _import_all(client, stage_id, dataset)
        rejection_results = _import_rejected(client, stage_id, dataset["rejected"])
        events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]

        metrics = _compute_metrics(client, stage_id, events, manifest, rejection_results, workdir)
        reviewed_id = _confirm_one(client, events)

    with TestClient(
        create_app(
            database_url=f"sqlite:///{workdir / 'evaluation.db'}",
            upload_dir=workdir / "uploads",
            allowed_repo_roots=str(workdir),
        )
    ) as restarted:
        metrics["restart_persistence"] = _check_restart(restarted, reviewed_id)

    failures = [
        f"{name}: expected {expected}, got {metrics[name]}"
        for name, expected in THRESHOLDS.items()
        if metrics[name] != expected
    ]
    return {
        "phase": "phase-0-baseline",
        "generated_at": datetime.now(UTC).isoformat(),
        "processor_versions": {
            "note": "note-development-v2",
            "git": "git-evidence-v1",
            "aggregation": "note-aggregation-v1",
        },
        "dataset": {
            "notes": len(dataset["notes"]),
            "git_repo": manifest["git_repo"]["repo_dirname"],
            "rejected": len(dataset["rejected"]),
            "expected_events": len(manifest["expected_events"]),
        },
        "metrics": metrics,
        "thresholds": THRESHOLDS,
        "passed": not failures,
        "failures": failures,
    }


def _create_stage(client: TestClient, spec: dict) -> str:
    response = client.post("/api/v1/stages", json=spec)
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _import_all(client: TestClient, stage_id: str, dataset: dict) -> None:
    for filename in dataset["notes"]:
        path = NOTES_DIR / filename
        response = client.post(
            f"/api/v1/stages/{stage_id}/notes",
            files={"file": (filename, path.read_bytes(), "text/markdown")},
        )
        assert response.status_code == 201, f"{filename}: {response.text}"
    response = client.post(
        f"/api/v1/stages/{stage_id}/git-repos",
        json={"path": str(dataset["git_repo"])},
    )
    assert response.status_code == 201, response.text


def _import_rejected(client: TestClient, stage_id: str, rejected: list[dict]) -> list[dict]:
    results = []
    for item in rejected:
        response = client.post(
            f"/api/v1/stages/{stage_id}/notes",
            files={"file": (item["filename"], item["path"].read_bytes(), "text/markdown")},
        )
        body = response.json()
        results.append(
            {
                "filename": item["filename"],
                "expected_status": item["status"],
                "expected_code": item["error_code"],
                "actual_status": response.status_code,
                "actual_code": body.get("error", {}).get("code"),
            }
        )
    return results


def _compute_metrics(
    client: TestClient,
    stage_id: str,
    events: list[dict],
    manifest: dict,
    rejection_results: list[dict],
    workdir: Path,
) -> dict:
    upload_dir = workdir / "uploads"
    blob_cache: dict[str, str] = {}

    def blob_text(sha256: str) -> str:
        if sha256 not in blob_cache:
            matches = list(upload_dir.glob(f"{sha256[:2]}/{sha256}.*"))
            assert matches, f"评测锚点指向的 blob 未落盘: {sha256}"
            blob_cache[sha256] = matches[0].read_text(encoding="utf-8")
        return blob_cache[sha256]

    total_anchors = 0
    grounded_anchors = 0
    for event in events:
        for claim in event["claims"]:
            for anchor in claim["anchors"]:
                total_anchors += 1
                text = blob_text(anchor["blob_sha256"])
                lines = text.split("\n")
                if (
                    lines[anchor["line_start"] - 1] == anchor["quote"]
                    and text[anchor["char_start"] : anchor["char_end"]] == anchor["quote"]
                ):
                    grounded_anchors += 1

    produced = {
        (_normalized(event["title"]), event["occurred_on"]): event for event in events
    }
    matched_expected = 0
    aggregation_checks = 0
    aggregation_passes = 0
    for expected in manifest["expected_events"]:
        event = produced.get((_normalized(expected["title"]), expected["occurred_on"]))
        if event is None:
            continue
        matched_expected += 1
        if "source_count" in expected:
            aggregation_checks += 1
            if event["source_count"] == expected["source_count"]:
                aggregation_passes += 1
        if expected.get("claim_contains") and event["claims"]:
            claim_text = event["claims"][0]["text"]
            if expected["claim_contains"] not in claim_text:
                matched_expected -= 1

    expected_keys = {
        (_normalized(expected["title"]), expected["occurred_on"])
        for expected in manifest["expected_events"]
    }
    spurious = [key for key in produced if key not in expected_keys]

    rejection_passes = sum(
        1
        for result in rejection_results
        if result["actual_status"] == result["expected_status"]
        and result["actual_code"] == result["expected_code"]
    )

    return {
        "claim_grounding_rate": (
            round(grounded_anchors / total_anchors, 6) if total_anchors else 0.0
        ),
        "key_event_recall": round(
            matched_expected / len(manifest["expected_events"]), 6
        ),
        "spurious_event_count": len(spurious),
        "aggregation_correctness": (
            round(aggregation_passes / aggregation_checks, 6) if aggregation_checks else 1.0
        ),
        "rejection_correctness": (
            round(rejection_passes / len(rejection_results), 6) if rejection_results else 1.0
        ),
    }


def _confirm_one(client: TestClient, events: list[dict]) -> str | None:
    for event in events:
        if event["status"] == "candidate":
            response = client.post(
                f"/api/v1/events/{event['id']}/reviews",
                json={"decision": "confirmed", "note": None, "expected_revision": 0},
            )
            assert response.status_code == 200, response.text
            return event["id"]
    return None


def _check_restart(restarted: TestClient, reviewed_id: str | None) -> bool:
    if reviewed_id is None:
        return False
    event = restarted.get(f"/api/v1/events/{reviewed_id}")
    return event.status_code == 200 and event.json()["data"]["status"] == "confirmed"


def _normalized(title: str) -> str:
    return " ".join(title.casefold().split())


def dataset_digest() -> str:
    """数据集内容指纹：笔记 + manifest，用于判断基线数据是否被改动。"""
    digest = hashlib.sha256()
    for path in sorted(NOTES_DIR.glob("*.md")):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    digest.update(MANIFEST_PATH.read_bytes())
    return digest.hexdigest()
