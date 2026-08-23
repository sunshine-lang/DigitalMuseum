from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.core.errors import ApiError

GIT_PROCESSOR_VERSION = "git-evidence-v1"

_FIELD_SEP = "\x1f"
_GIT_TIMEOUT_SECONDS = 15
_MAX_SUBJECTS_IN_CLAIM = 5


@dataclass(frozen=True, slots=True)
class GitAnchor:
    quote: str
    line_start: int
    line_end: int
    char_start: int
    char_end: int


@dataclass(frozen=True, slots=True)
class GitActivityItem:
    title: str
    occurred_on: date
    claim_text: str
    anchors: tuple[GitAnchor, ...]
    # 确定性事实（提交日）导入即"系统核实"；推断性标题（存在标签 ≠ 发布了版本，
    # 且轻量标签的 creatordate 不可靠）必须保持 candidate 由人核对。
    initial_status: str = "verified"


@dataclass(frozen=True, slots=True)
class GitEvidence:
    repo_name: str
    branch: str
    document: str
    items: tuple[GitActivityItem, ...]


def import_git_repository(
    repo_path_raw: str,
    *,
    starts_on: date,
    ends_on: date,
    allowed_roots: str,
) -> GitEvidence:
    repo_path = _resolve_repo_path(repo_path_raw, allowed_roots)
    _require_git_repository(repo_path)
    branch = _git(repo_path, "rev-parse", "--abbrev-ref", "HEAD").strip() or "HEAD"
    log_output = _git(
        repo_path,
        "log",
        "--date=short",
        f"--pretty=format:%H{_FIELD_SEP}%cd{_FIELD_SEP}%s",
    )
    tags_output = _git(
        repo_path,
        "for-each-ref",
        "refs/tags",
        f"--format=%(refname:short){_FIELD_SEP}%(creatordate:short)",
    )

    range_start = str(starts_on)
    range_end = str(ends_on)

    commits_by_day: dict[str, list[tuple[str, str]]] = {}
    for line in log_output.splitlines():
        parts = line.split(_FIELD_SEP)
        if len(parts) != 3:
            continue
        commit_hash, day, subject = parts
        if range_start <= day <= range_end:
            commits_by_day.setdefault(day, []).append((commit_hash, subject))

    tags_in_range: list[tuple[str, str]] = []
    for line in tags_output.splitlines():
        parts = line.split(_FIELD_SEP)
        if len(parts) != 2:
            continue
        tag_name, day = parts
        if range_start <= day <= range_end:
            tags_in_range.append((tag_name, day))

    if not commits_by_day and not tags_in_range:
        raise ApiError(422, "no_git_activity_in_range", "这个仓库在当前建馆阶段内没有提交或标签")

    return _render_evidence_document(
        repo_name=repo_path.name,
        branch=branch,
        starts_on=starts_on,
        ends_on=ends_on,
        commits_by_day=commits_by_day,
        tags_in_range=tags_in_range,
    )


def _render_evidence_document(
    *,
    repo_name: str,
    branch: str,
    starts_on: date,
    ends_on: date,
    commits_by_day: dict[str, list[tuple[str, str]]],
    tags_in_range: list[tuple[str, str]],
) -> GitEvidence:
    lines: list[str] = [
        f"repo: {repo_name} ({branch})",
        f"range: {starts_on}..{ends_on}",
        "",
    ]
    pending: list[tuple[str, date, str, int, int, str]] = []

    for day in sorted(commits_by_day):
        commits = commits_by_day[day]
        header = f"## day {day} ({len(commits)} commits)"
        block_start = len(lines)
        lines.append(header)
        for commit_hash, subject in commits:
            lines.append(f"{commit_hash[:7]} {subject}")
        block_end = len(lines) - 1
        subjects = [subject for _, subject in commits]
        shown = "；".join(subjects[:_MAX_SUBJECTS_IN_CLAIM])
        ellipsis = "等" if len(subjects) > _MAX_SUBJECTS_IN_CLAIM else ""
        claim_text = (
            f"这一天在仓库 {repo_name}（{branch} 分支）"
            f"提交了 {len(commits)} 个变更：{shown}{ellipsis}"
        )
        pending.append(
            (
                f"在 {repo_name} 提交代码",
                date.fromisoformat(day),
                claim_text,
                block_start,
                block_end,
                "verified",
            )
        )

    for tag_name, day in sorted(tags_in_range, key=lambda item: item[1]):
        header = f"## tag {tag_name} ({day})"
        block_start = len(lines)
        lines.append(header)
        claim_text = f"在仓库 {repo_name}（{branch} 分支）创建了标签 {tag_name}。"
        pending.append(
            (
                f"在 {repo_name} 创建标签 {tag_name}",
                date.fromisoformat(day),
                claim_text,
                block_start,
                block_start,
                "candidate",
            )
        )

    offsets: list[int] = []
    total = 0
    for line in lines:
        offsets.append(total)
        total += len(line) + 1

    items: list[GitActivityItem] = []
    for title, occurred_on, claim_text, block_start, block_end, initial_status in pending:
        anchors = tuple(
            GitAnchor(
                quote=line_text,
                line_start=index + 1,
                line_end=index + 1,
                char_start=offsets[index],
                char_end=offsets[index] + len(line_text),
            )
            for index, line_text in enumerate(lines)
            if block_start <= index <= block_end
        )
        items.append(
            GitActivityItem(
                title=title[:200],
                occurred_on=occurred_on,
                claim_text=claim_text,
                anchors=anchors,
                initial_status=initial_status,
            )
        )

    return GitEvidence(
        repo_name=repo_name,
        branch=branch,
        document="\n".join(lines),
        items=tuple(items),
    )


def _resolve_repo_path(raw: str, allowed_roots: str) -> Path:
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ApiError(422, "repo_path_required", "请填写本地 Git 仓库路径")
    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "repo_not_found", "路径不存在或不是一个目录")
    resolved = candidate.resolve()
    roots = [
        Path(root.strip()).expanduser().resolve()
        for root in allowed_roots.split(",")
        if root.strip()
    ]
    if not any(resolved == root or root in resolved.parents for root in roots):
        raise ApiError(403, "repo_path_not_allowed", "这个路径不在允许读取的目录范围内")
    return resolved


def _require_git_repository(repo_path: Path) -> None:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise ApiError(422, "git_command_failed", "本机没有安装 git 命令") from exc
    except subprocess.TimeoutExpired as exc:
        raise ApiError(422, "git_command_failed", "读取仓库超时") from exc
    if completed.returncode != 0 or completed.stdout.strip() != "true":
        raise ApiError(422, "not_a_git_repository", "这个目录不是一个 Git 仓库")


def _git(repo_path: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_path), *args],
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT_SECONDS,
            check=True,
        )
    except FileNotFoundError as exc:
        raise ApiError(422, "git_command_failed", "本机没有安装 git 命令") from exc
    except subprocess.TimeoutExpired as exc:
        raise ApiError(422, "git_command_failed", "读取仓库超时") from exc
    except subprocess.CalledProcessError as exc:
        raise ApiError(422, "git_command_failed", "无法读取这个仓库") from exc
    return completed.stdout
