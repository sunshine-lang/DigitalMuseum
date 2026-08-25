export type GitRepoPreview = {
  repo_name: string;
  first_commit_on: string;
  last_commit_on: string;
  commit_count: number;
};

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

type Anchor = {
  blob_sha256: string;
  quote: string;
  line_start: number;
  line_end: number;
  char_start: number;
  char_end: number;
};

type Claim = {
  id: string;
  text: string;
  epistemic_status: "unknown" | "user_confirmed" | "disputed";
  evidence_role: "user_statement" | "artifact";
  processor_version: string;
  anchors: Anchor[];
};

export type ReviewDecision = "confirmed" | "disputed" | "unknown" | "rejected";

type EventOrigin =
  | "note"
  | "aggregated"
  | "merged"
  | "split"
  | "git"
  // "photo" 仅为兼容历史数据中的旧照片事件保留；照片适配器已于 2026-08-25 删除。
  | "photo"
  | "claude"
  | "codex";

type AuditDecision = ReviewDecision | "merged" | "split";

type EventStatus = "candidate" | "verified" | ReviewDecision | "merged" | "split";

type EventReview = {
  decision: AuditDecision;
  note: string | null;
  revision: number;
  created_at: string;
};

export type CandidateEvent = {
  id: string;
  title: string;
  occurred_on: string | null;
  time_precision: "exact" | "unknown";
  status: EventStatus;
  revision: number;
  is_formal: boolean;
  origin: EventOrigin;
  source_count: number;
  exhibit_caption: string | null;
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

export function updateExhibitCaption(
  eventId: string,
  caption: string | null,
): Promise<CandidateEvent> {
  return apiRequest(`/api/v1/events/${eventId}/exhibit-caption`, {
    method: "PATCH",
    body: JSON.stringify({ caption }),
  });
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

/** 十秒开馆冷启动：只读预览仓库的最早/最晚提交与提交数，帮填建馆表单，不落库。 */
export function previewGitRepo(repoPath: string): Promise<GitRepoPreview> {
  return apiRequest(
    `/api/v1/git-repos/preview?path=${encodeURIComponent(repoPath)}`,
  );
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

/** occurrence.original_filename 形如 "MyProject-claude-sessions.txt"，项目标签是确定性前缀。 */
export function claudeProjectLabel(originalFilename: string): string {
  return originalFilename.replace(/-claude-sessions\.txt$/, "");
}

export function importClaudeSessions(
  stageId: string,
  projectPath: string,
): Promise<{ occurrence: { original_filename: string }; events: CandidateEvent[] }> {
  return apiRequest(`/api/v1/stages/${stageId}/claude-sessions`, {
    method: "POST",
    body: JSON.stringify({ path: projectPath }),
  });
}

/** occurrence.original_filename 形如 "MyProject-codex-sessions.txt"。 */
export function codexProjectLabel(originalFilename: string): string {
  return originalFilename.replace(/-codex-sessions\.txt$/, "");
}

export function importCodexSessions(
  stageId: string,
  projectPath: string,
): Promise<{ occurrence: { original_filename: string }; events: CandidateEvent[] }> {
  return apiRequest(`/api/v1/stages/${stageId}/codex-sessions`, {
    method: "POST",
    body: JSON.stringify({ path: projectPath }),
  });
}

/** 会话发现面板：本机有会话的项目，import_path 可原样传给导入端点。 */
export type AgentSessionProject = {
  project: string;
  session_count: number;
  import_path: string;
};

export function listClaudeSessionProjects(): Promise<AgentSessionProject[]> {
  return apiRequest("/api/v1/claude-sessions/projects");
}

export function listCodexSessionProjects(): Promise<AgentSessionProject[]> {
  return apiRequest("/api/v1/codex-sessions/projects");
}
