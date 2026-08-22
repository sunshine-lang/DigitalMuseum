from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO

from PIL import Image
from PIL.ExifTags import IFD

from app.core.errors import ApiError

PHOTO_PROCESSOR_VERSION = "photo-evidence-v1"

PHOTO_EVENT_TITLE = "拍摄照片"
_EXIF_DATETIME_FORMAT = "%Y:%m:%d %H:%M:%S"
_TAG_DATETIME = 306
_TAG_MAKE = 271
_TAG_MODEL = 272
_TAG_DATETIME_ORIGINAL = 36867
_ALLOWED_FORMATS = {"JPEG", "PNG"}


@dataclass(frozen=True, slots=True)
class PhotoAnchor:
    quote: str
    line_start: int
    line_end: int
    char_start: int
    char_end: int


@dataclass(frozen=True, slots=True)
class PhotoEvidence:
    filename: str
    event_title: str
    occurred_on: date
    claim_text: str
    descriptor: str
    anchors: tuple[PhotoAnchor, ...]


def analyze_photo(
    content: bytes,
    *,
    filename: str,
    starts_on: date,
    ends_on: date,
) -> PhotoEvidence:
    image = _open_image(content)
    exif = image.getexif()

    taken_at, taken_source = _resolve_taken_at(exif)
    occurred_on = taken_at.date()
    if not (starts_on <= occurred_on <= ends_on):
        raise ApiError(422, "photo_outside_stage", "照片拍摄日期不在当前建馆阶段内")

    camera = _camera_label(exif)
    location = _location_label(exif)
    descriptor = _render_descriptor(
        filename=filename,
        content=content,
        image_format=image.format or "",
        size=image.size,
        taken_at=taken_at,
        taken_source=taken_source,
        camera=camera,
        location=location,
    )
    claim_text = _render_claim_text(
        filename=filename,
        taken_at=taken_at,
        camera=camera,
        location=location,
    )
    anchors = _build_anchors(descriptor)
    return PhotoEvidence(
        filename=filename,
        event_title=PHOTO_EVENT_TITLE,
        occurred_on=occurred_on,
        claim_text=claim_text,
        descriptor=descriptor,
        anchors=anchors,
    )


def _open_image(content: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(content)) as probe:
            probe.verify()
        image = Image.open(BytesIO(content))
        image.load()
    except Exception as exc:
        raise ApiError(415, "invalid_photo_content", "照片必须是可解析的 JPEG 或 PNG 图片") from exc
    if image.format not in _ALLOWED_FORMATS:
        raise ApiError(415, "invalid_photo_content", "照片必须是可解析的 JPEG 或 PNG 图片")
    return image


def _resolve_taken_at(exif: Image.Exif) -> tuple[datetime, str]:
    for value, source in (
        (exif.get_ifd(IFD.Exif).get(_TAG_DATETIME_ORIGINAL), "DateTimeOriginal"),
        (exif.get(_TAG_DATETIME), "DateTime"),
    ):
        cleaned = _clean_text(value)
        if cleaned is None:
            continue
        try:
            return datetime.strptime(cleaned, _EXIF_DATETIME_FORMAT), source
        except ValueError:
            continue
    raise ApiError(422, "photo_missing_timestamp", "照片缺少可读的 EXIF 拍摄时间，无法归入时间线")


def _camera_label(exif: Image.Exif) -> str | None:
    make = _clean_text(exif.get(_TAG_MAKE))
    model = _clean_text(exif.get(_TAG_MODEL))
    return _clean_text(f"{make or ''} {model or ''}")


def _location_label(exif: Image.Exif) -> str | None:
    gps = exif.get_ifd(IFD.GPSInfo)
    latitude = _gps_coordinate(gps, value_tag=2, ref_tag=1, negative_ref="S")
    longitude = _gps_coordinate(gps, value_tag=4, ref_tag=3, negative_ref="W")
    if latitude is None or longitude is None:
        return None
    return f"{latitude:.4f},{longitude:.4f}"


def _gps_coordinate(gps: dict, *, value_tag: int, ref_tag: int, negative_ref: str) -> float | None:
    try:
        degrees, minutes, seconds = gps.get(value_tag)
        ref = gps.get(ref_tag)
        value = float(degrees) + float(minutes) / 60 + float(seconds) / 3600
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if ref is None:
        return None
    return -value if str(ref).strip().upper().startswith(negative_ref) else value


def _render_descriptor(
    *,
    filename: str,
    content: bytes,
    image_format: str,
    size: tuple[int, int],
    taken_at: datetime,
    taken_source: str,
    camera: str | None,
    location: str | None,
) -> str:
    lines = [
        f"photo: {filename}",
        f"sha256: {hashlib.sha256(content).hexdigest()}",
        f"bytes: {len(content)}",
        f"format: {image_format}",
        f"dimensions: {size[0]}x{size[1]}",
        f"taken_at: {taken_at.strftime(_EXIF_DATETIME_FORMAT)} (EXIF {taken_source})",
    ]
    if camera is not None:
        lines.append(f"camera: {camera}")
    if location is not None:
        lines.append(f"location: {location}")
    return "\n".join(lines)


def _render_claim_text(
    *,
    filename: str,
    taken_at: datetime,
    camera: str | None,
    location: str | None,
) -> str:
    details = [taken_at.strftime("%Y-%m-%d %H:%M")]
    if camera is not None:
        details.append(f"相机 {camera}")
    if location is not None:
        details.append(f"位置 {location}")
    return f"拍摄了照片 {filename}（{'，'.join(details)}）"


def _build_anchors(descriptor: str) -> tuple[PhotoAnchor, ...]:
    lines = descriptor.split("\n")
    offsets: list[int] = []
    total = 0
    for line in lines:
        offsets.append(total)
        total += len(line) + 1
    return tuple(
        PhotoAnchor(
            quote=line,
            line_start=index + 1,
            line_end=index + 1,
            char_start=offsets[index],
            char_end=offsets[index] + len(line),
        )
        for index, line in enumerate(lines)
    )


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    if not cleaned or any(ord(char) < 32 or 127 <= ord(char) <= 159 for char in cleaned):
        return None
    return cleaned
