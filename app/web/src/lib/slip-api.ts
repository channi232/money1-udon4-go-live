export type SlipRow = {
  month: string;
  employeeId: string;
  fullName: string;
  net: number;
};

export type SlipApiResponse = {
  ok: boolean;
  source: "database" | "fallback";
  rows: SlipRow[];
  message?: string;
  request_id?: string;
  error_code?: string;
  debug?: {
    trace?: {
      module?: string;
      request_id?: string;
      duration_ms?: number | null;
      stage?: string;
    };
  };
  metrics?: {
    total_rows: number | null;
    limit: number;
  };
};

const FALLBACK_ROWS: SlipRow[] = [
  { month: "เมษายน 2569", employeeId: "34012", fullName: "สมชาย ใจดี", net: 32450 },
  { month: "เมษายน 2569", employeeId: "34087", fullName: "อรทัย เข็มทอง", net: 28790 },
  { month: "มีนาคม 2569", employeeId: "33995", fullName: "วรพงษ์ ศรีสุข", net: 41920 },
  { month: "มีนาคม 2569", employeeId: "34056", fullName: "ศิริพร บุญมา", net: 30115 },
];

export type SlipRowsFetchOptions = {
  preflight?: boolean;
  limit?: number;
};

export async function fetchSlipRows(opts?: SlipRowsFetchOptions): Promise<SlipApiResponse> {
  try {
    const search = new URLSearchParams();
    if (opts?.preflight) search.set("preflight", "1");
    if (typeof opts?.limit === "number" && Number.isFinite(opts.limit)) {
      search.set("limit", String(Math.trunc(opts.limit)));
    }
    const qs = search.toString();
    const res = await fetch(qs ? `/api/slip-summary.php?${qs}` : "/api/slip-summary.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const requestId = res.headers.get("x-request-id") || undefined;
    if (!res.ok) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "API request failed", request_id: requestId };
    }
    const data = (await res.json()) as SlipApiResponse;
    if (!data || !Array.isArray(data.rows)) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Invalid API payload", request_id: requestId };
    }
    if (!data.request_id && requestId) data.request_id = requestId;
    return data;
  } catch {
    return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Cannot connect API" };
  }
}
