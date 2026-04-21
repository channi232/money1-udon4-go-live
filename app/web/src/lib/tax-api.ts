export type TaxRow = {
  citizenIdMasked: string;
  fullName: string;
  year: string;
  /** ข้อความจากคอลัมน์ DB เมื่อมี; ไม่เช่นนั้นเป็นค่าเริ่มต้นจาก API */
  status: string;
};

export type TaxApiResponse = {
  ok: boolean;
  source: "database" | "fallback";
  rows: TaxRow[];
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
    ready_count: number | null;
    processing_count: number | null;
    limit: number;
  };
};

const FALLBACK_ROWS: TaxRow[] = [
  { citizenIdMasked: "3-4120-xxxxx-12-3", fullName: "สมชาย ใจดี", year: "2568", status: "พร้อมดาวน์โหลด" },
  { citizenIdMasked: "1-4407-xxxxx-81-9", fullName: "อรทัย เข็มทอง", year: "2568", status: "พร้อมดาวน์โหลด" },
  { citizenIdMasked: "3-4111-xxxxx-08-4", fullName: "วรพงษ์ ศรีสุข", year: "2567", status: "อยู่ระหว่างจัดทำ" },
  { citizenIdMasked: "5-4100-xxxxx-97-1", fullName: "ศิริพร บุญมา", year: "2567", status: "พร้อมดาวน์โหลด" },
];

export type TaxRowsFetchOptions = {
  preflight?: boolean;
  limit?: number;
};

export async function fetchTaxRows(opts?: TaxRowsFetchOptions): Promise<TaxApiResponse> {
  try {
    const search = new URLSearchParams();
    if (opts?.preflight) search.set("preflight", "1");
    if (typeof opts?.limit === "number" && Number.isFinite(opts.limit)) {
      search.set("limit", String(Math.trunc(opts.limit)));
    }
    const qs = search.toString();
    const res = await fetch(qs ? `/api/tax-summary.php?${qs}` : "/api/tax-summary.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const requestId = res.headers.get("x-request-id") || undefined;
    if (!res.ok) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "API request failed", request_id: requestId };
    }
    const data = (await res.json()) as TaxApiResponse;
    if (!data || !Array.isArray(data.rows)) {
      return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Invalid API payload", request_id: requestId };
    }
    if (!data.request_id && requestId) data.request_id = requestId;
    return data;
  } catch {
    return { ok: false, source: "fallback", rows: FALLBACK_ROWS, message: "Cannot connect API" };
  }
}
