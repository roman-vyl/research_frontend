/**
 * Strategy Runtime read API, reached through the dev-server proxy `/runtime-api` (Runtime sends no CORS headers):
 * `GET /v1/strategy-instances`, the strategy instances registered in Runtime's deployment catalog.
 */

export type RuntimeStrategyInstance = {
  strategy_instance_id: string;
  strategy_id: string;
  instrument: string;
  base_timeframe: string;
  /** The `enabled` value of the spec file in the catalog; not the state of Runtime's processing. */
  enabled: boolean;
  source_path: string;
};

export type RuntimeInvalidFile = {
  source_path: string;
  error_code: string;
  error_message: string | null;
};

export type RuntimeDuplicateIdentity = {
  strategy_instance_id: string;
  source_paths: string[];
};

export type RuntimeStrategyList = {
  scanned_file_count: number;
  strategy_instances: RuntimeStrategyInstance[];
  invalid_files: RuntimeInvalidFile[];
  duplicate_identities: RuntimeDuplicateIdentity[];
};

export type RuntimeListErrorKind = "not_ready" | "catalog_unavailable" | "runtime_error" | "unreachable";

export class RuntimeListError extends Error {
  readonly kind: RuntimeListErrorKind;

  constructor(kind: RuntimeListErrorKind) {
    super(kind);
    this.name = "RuntimeListError";
    this.kind = kind;
  }
}

const RUNTIME_API_BASE = "/runtime-api";

async function runtimeBodyStatus(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as { status?: unknown }).status === "string") {
      return (body as { status: string }).status;
    }
  } catch {
    // not a Runtime body
  }
  return null;
}

/**
 * The strategy list. A failure is classified by what answered: Runtime's own status bodies map to
 * `not_ready` / `catalog_unavailable` / `runtime_error`; a network failure, a 502 / 504 or a 5xx without a
 * Runtime body (what the dev proxy answers when Runtime is down) is `unreachable`.
 */
export async function fetchRuntimeStrategyInstances(): Promise<RuntimeStrategyList> {
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instances`, { method: "GET" });
  } catch {
    throw new RuntimeListError("unreachable");
  }
  if (res.ok) {
    return (await res.json()) as RuntimeStrategyList;
  }
  const status = await runtimeBodyStatus(res);
  if (status === "not_ready") throw new RuntimeListError("not_ready");
  if (status === "catalog_unavailable") throw new RuntimeListError("catalog_unavailable");
  if (status === "internal_error") throw new RuntimeListError("runtime_error");
  if (res.status === 502 || res.status === 504 || (res.status >= 500 && status === null)) {
    throw new RuntimeListError("unreachable");
  }
  throw new RuntimeListError("runtime_error");
}
