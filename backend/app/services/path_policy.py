"""逗号分隔允许根目录的公共路径校验。

Git / Claude / Codex 三条证据导入链路共用同一套"解析逗号分隔根 +
parents 包含判断"规则，仅错误码与文案随调用方不同。
"""

from __future__ import annotations

from pathlib import Path

from app.core.errors import ApiError


def require_path_allowed(
    resolved: Path,
    allowed_roots: str,
    *,
    error_code: str,
    message: str = "这个路径不在允许读取的目录范围内",
) -> None:
    """resolved 必须等于某个允许根，或位于某个允许根之下。"""
    roots = [
        Path(root.strip()).expanduser().resolve()
        for root in allowed_roots.split(",")
        if root.strip()
    ]
    if not any(resolved == root or root in resolved.parents for root in roots):
        raise ApiError(403, error_code, message)
