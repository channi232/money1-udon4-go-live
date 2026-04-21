export type SecurityEventRow = {
  ts: string;
  event: string;
  bucket: string;
  ip: string;
  retry_after_seconds: number;
  max_requests: number;
  window_seconds: number;
  request_uri?: string;
  ua?: string;
};

export type SecurityEventsResponse = {
  ok: boolean;
  count: number;
  rows: SecurityEventRow[];
  summary?: {
    today_count: number;
    seven_day_count: number;
    top_buckets: Array<{ bucket: string; count: number }>;
    top_ips: Array<{ ip: string; count: number }>;
  };
  message?: string;
};

export async function fetchSecurityEvents(params: {
  bucket?: string;
  ip?: string;
  limit?: number;
}): Promise<SecurityEventsResponse> {
  try {
    const search = new URLSearchParams();
    if (params.bucket && params.bucket !== "ทั้งหมด") search.set("bucket", params.bucket);
    if (params.ip && params.ip.trim() !== "") search.set("ip", params.ip.trim());
    search.set("limit", String(params.limit ?? 200));

    const res = await fetch(`/api/security-events.php?${search.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, count: 0, rows: [], message: `HTTP ${res.status}` };
    const data = (await res.json()) as SecurityEventsResponse;
    if (!data || !Array.isArray(data.rows)) return { ok: false, count: 0, rows: [], message: "invalid_payload" };
    return data;
  } catch {
    return { ok: false, count: 0, rows: [], message: "network_error" };
  }
}
