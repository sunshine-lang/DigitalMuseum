/**
 * 档案库 API 客户端（ADR-0001/0002）：Agent 会话同步、档案时间线、
 * 事件审阅（异议通道）与清空档案库是全部能力面。
 */

export type ReviewDecision = "confirmed" | "disputed" | "unknown" | "rejected";

export type EventStatus =
  | "candidate"
  | "verified"
  | ReviewDecision;

export type EventOrigin = "aggregated" | "claude" | "codex" | "pi" | "dsh";

type EventReview = {
  decision: ReviewDecision;
  note: string | null;
  revision: number;
  created_at: string;
};

export type ClaimAnchor = {
  blob_sha256: string;
  quote: string;
  line_start: number;
  line_end: number;
  char_start: number;
  char_end: number;
};

export type Claim = {
  id: string;
  text: string;
  epistemic_status: "unknown" | "user_confirmed" | "disputed";
  evidence_role: "user_statement" | "artifact";
  processor_version: string;
  anchors: ClaimAnchor[];
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
  claims: Claim[];
  latest_review: EventReview | null;
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
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Phase0ApiError(
      "无法连接本地后端。请先按 README 启动 8010 端口的本地 API。",
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

export function reviewEvent(
  eventId: string,
  payload: { decision: ReviewDecision; note: string | null; expected_revision: number },
): Promise<CandidateEvent> {
  return apiRequest(`/api/v1/events/${eventId}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** 会话发现面板：本机有会话的项目，供同步范围展示。 */
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

export function listPiSessionProjects(): Promise<AgentSessionProject[]> {
  return apiRequest("/api/v1/pi-sessions/projects");
}

export function listDshSessionProjects(): Promise<AgentSessionProject[]> {
  return apiRequest("/api/v1/dsh-sessions/projects");
}

// ---- 档案库（ADR-0001）：同步、时间线、清空 ----

export type ArchiveSyncProduct = {
  product: "claude" | "codex" | "pi" | "dsh";
  project: string;
  session_count: number;
  status: "imported" | "skipped" | "failed";
  error_code: string | null;
  events_created: number;
};

export type ArchiveSyncSummary = {
  products: ArchiveSyncProduct[];
  projects_imported: number;
  projects_skipped: number;
  projects_failed: number;
  events_created: number;
};

/** 一键同步本机全部 Agent 会话项目（幂等：内容不变跳过、变化换快照）。 */
export function syncArchive(): Promise<ArchiveSyncSummary> {
  return apiRequest("/api/v1/archive/sync", { method: "POST" });
}

/** 档案时间线：全部事件按发生日升序（无日期排最后）。 */
export function listArchiveEvents(): Promise<CandidateEvent[]> {
  return apiRequest("/api/v1/archive/events");
}

/** 清空档案库：唯一的破坏性数据操作（删全部数据行并回收原始文件）。 */
export function wipeArchive(): Promise<{
  cleared: boolean;
  events_removed: number;
  occurrences_removed: number;
}> {
  return apiRequest("/api/v1/archive", { method: "DELETE" });
}
