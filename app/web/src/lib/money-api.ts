export type MoneyRow = {
  id: string;
  school: string;
  amount: number;
  date: string;
  status: "อนุมัติแล้ว" | "รอตรวจสอบ" | "ตีกลับ";
};

export type MoneyApiResponse = {
  ok: boolean;
  source: "database" | "fallback";
  rows: MoneyRow[];
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
  meta?: {
    status_mapping?: {
      source?: string;
      column?: string | null;
    };
  };
  metrics?: {
    total_rows: number | null;
    pending_review_rows: number | null;
    limit: number;
  };
};

const FALLBACK_ROWS: MoneyRow[] = [
  { id: "MN-2026-0410-001", school: "รร.บ้านหนองบัว", amount: 125000, date: "10/04/2026", status: "อนุมัติแล้ว" },
  { id: "MN-2026-0410-002", school: "รร.บ้านเชียงพิณ", amount: 98500, date: "10/04/2026", status: "รอตรวจสอบ" },
  { id: "MN-2026-0409-014", school: "รร.อนุบาลอุดร 4", amount: 215000, date: "09/04/2026", status: "อนุมัติแล้ว" },
  { id: "MN-2026-0409-009", school: "รร.บ้านโนนสูง", amount: 78500, date: "09/04/2026", status: "ตีกลับ" },
];

export type MoneyRowsFetchOptions = {
  preflight?: boolean;
  limit?: number;
};

export async function fetchMoneyRows(opts?: MoneyRowsFetchOptions): Promise<MoneyApiResponse> {
  try {
    const search = new URLSearchParams();
    if (opts?.preflight) search.set("preflight", "1");
    if (typeof opts?.limit === "number" && Number.isFinite(opts.limit)) {
      search.set("limit", String(Math.trunc(opts.limit)));
    }
    const qs = search.toString();
    const res = await fetch(qs ? `/api/money-summary-v3.php?${qs}` : "/api/money-summary-v3.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const requestId = res.headers.get("x-request-id") || undefined;
    if (!res.ok) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "API request failed", request_id: requestId };
    }
    const data = (await res.json()) as MoneyApiResponse;
    if (!data || !Array.isArray(data.rows)) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Invalid API payload", request_id: requestId };
    }
    if (!data.request_id && requestId) data.request_id = requestId;
    return data;
  } catch {
    return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Cannot connect API" };
  }
}
