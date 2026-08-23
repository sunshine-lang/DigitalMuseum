export type Stage = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  created_at: string;
  evidence_count: number;
  event_count: number;
  confirmed_count: number;
  verified_count: number;
};

export type Anchor = {
  blob_sha256: string;
  quote: string;
  line_start: number;
  line_end: number;
  char_start: number;
  char_end: number;
};

export type SourceMedia = {
  sha256: string;
  media_type: string;
};

export type Claim = {
  id: string;
  text: string;
  epistemic_status: "unknown" | "user_confirmed" | "disputed";
  evidence_role: "user_statement" | "artifact";
  processor_version: string;
  anchors: Anchor[];
  /** 可展示的原始媒体：照片事件指向原图 blob；笔记/Git 为 null。 */
  source_media: SourceMedia | null;
};

export type ReviewDecision = "confirmed" | "disputed" | "unknown" | "rejected";

export type EventOrigin = "note" | "aggregated" | "merged" | "split" | "git" | "photo";

export type AuditDecision = ReviewDecision | "merged" | "split";

export type EventStatus = "candidate" | "verified" | ReviewDecision | "merged" | "split";

export type EventReview = {
  decision: AuditDecision;
  note: string | null;
  revision: number;
  created_at: string;
};

export type CandidateEvent = {
  id: string;
  stage_id: string;
  title: string;
  occurred_on: string | null;
  time_precision: "exact" | "unknown";
  status: EventStatus;
  revision: number;
  is_formal: boolean;
  origin: EventOrigin;
  source_count: number;
  claims: Claim[];
  latest_review: EventReview | null;
};

export type CoverageItem = {
  id: string;
  occurrence_id: string;
  original_filename: string;
  step: "stored_locally" | "parsed_locally" | "candidate_generated";
  status: "completed" | "failed";
  processor_version: string | null;
  error_code: string | null;
};

type ApiEnvelope<T> = { data: T };
type ApiErrorBody = { error?: { code?: string; message?: string } };

const apiBaseUrl =
  process.env.NEXT_PUBLIC_DIGITAL_MUSEUM_API_URL ?? "http://127.0.0.1:8010";

export class Phase0ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new Phase0ApiError(
      "无法连接本地后端。请先按 README 启动 8010 端口的 Phase 0 API。",
      "backend_unavailable",
      0,
    );
  }

  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorBody;
  if (!response.ok || !("data" in body)) {
    throw new Phase0ApiError(
      body.error?.message ?? "操作失败，请稍后重试",
      body.error?.code ?? "unknown_error",
      response.status,
    );
  }
  return body.data;
}

/** 内容寻址的本地 Blob 媒体地址（GET 只读端点，可永久缓存）。 */
export function blobUrl(sha256: string): string {
  return `${apiBaseUrl}/api/v1/blobs/${sha256}`;
}

export function createStage(payload: {
  name: string;
  starts_on: string;
  ends_on: string;
}): Promise<Stage> {
  return apiRequest("/api/v1/stages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStage(stageId: string): Promise<Stage> {
  return apiRequest(`/api/v1/stages/${stageId}`);
}

export function listStages(): Promise<Stage[]> {
  return apiRequest("/api/v1/stages");
}

export function renameStage(stageId: string, name: string): Promise<Stage> {
  return apiRequest(`/api/v1/stages/${stageId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteStage(stageId: string): Promise<{ id: string }> {
  return apiRequest(`/api/v1/stages/${stageId}`, {
    method: "DELETE",
  });
}

export function getEvents(stageId: string): Promise<CandidateEvent[]> {
  return apiRequest(`/api/v1/stages/${stageId}/events`);
}

export function getCoverage(stageId: string): Promise<CoverageItem[]> {
  return apiRequest(`/api/v1/stages/${stageId}/coverage`);
}

export function importNote(stageId: string, file: File): Promise<CandidateEvent> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<{
    event: CandidateEvent;
  }>(`/api/v1/stages/${stageId}/notes`, {
    method: "POST",
    body: formData,
  }).then((result) => result.event);
}

export function importPhoto(stageId: string, file: File): Promise<CandidateEvent> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<{
    event: CandidateEvent;
  }>(`/api/v1/stages/${stageId}/photos`, {
    method: "POST",
    body: formData,
  }).then((result) => result.event);
}

export function reviewEvent(
  eventId: string,
  payload: { decision: ReviewDecision; note: string | null; expected_revision: number },
): Promise<CandidateEvent> {
  return apiRequest(`/api/v1/events/${eventId}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function mergeEvents(
  stageId: string,
  payload: { event_ids: string[]; title?: string },
): Promise<{ event: CandidateEvent; sources: CandidateEvent[] }> {
  return apiRequest(`/api/v1/stages/${stageId}/events/merge`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function splitEvent(
  eventId: string,
): Promise<{ event: CandidateEvent; events: CandidateEvent[] }> {
  return apiRequest(`/api/v1/events/${eventId}/split`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function importGitRepo(
  stageId: string,
  repoPath: string,
): Promise<{ events: CandidateEvent[] }> {
  return apiRequest(`/api/v1/stages/${stageId}/git-repos`, {
    method: "POST",
    body: JSON.stringify({ path: repoPath }),
  });
}
