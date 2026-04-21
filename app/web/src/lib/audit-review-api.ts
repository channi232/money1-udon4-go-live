export type ReviewStatus = "new" | "acknowledged" | "resolved";
export type ReviewHistoryEntry = {
  from?: ReviewStatus | "";
  to?: ReviewStatus | "";
  by?: string;
  at?: string;
};
export type ReviewMeta = {
  status: ReviewStatus;
  updatedBy?: string;
  updatedAt?: string;
  history?: ReviewHistoryEntry[];
};

type FetchReviewMapResponse = {
  ok: boolean;
  map: Record<string, ReviewMeta>;
  count: number;
  message?: string;
};

export async function fetchReviewMap(): Promise<FetchReviewMapResponse> {
  try {
    const res = await fetch("/api/audit-review.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, map: {}, count: 0, message: `HTTP ${res.status}` };
    const data = (await res.json()) as FetchReviewMapResponse;
    if (!data || typeof data !== "object" || !data.map || typeof data.map !== "object") {
      return { ok: false, map: {}, count: 0, message: "invalid_payload" };
    }
    return data;
  } catch {
    return { ok: false, map: {}, count: 0, message: "network_error" };
  }
}

export async function saveReviewStatus(
  key: string,
  status: ReviewStatus,
): Promise<{ ok: boolean; message?: string; meta?: ReviewMeta }> {
  try {
    const res = await fetch("/api/audit-review.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ key, status }),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok?: boolean; message?: string; meta?: ReviewMeta };
    return { ok: data?.ok === true, message: data?.message, meta: data?.meta };
  } catch {
    return { ok: false, message: "network_error" };
  }
}
