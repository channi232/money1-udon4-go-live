export type SecurityThresholds = {
  today_warn: number;
  today_critical: number;
  week_warn: number;
  week_critical: number;
};

export type SecurityThresholdHistoryRow = {
  ts: string;
  username: string;
  action: "update" | "reset_defaults";
  thresholds: SecurityThresholds;
};

export async function fetchSecurityThresholds(): Promise<{ thresholds: SecurityThresholds; history: SecurityThresholdHistoryRow[] }> {
  const fallback: SecurityThresholds = {
    today_warn: 20,
    today_critical: 50,
    week_warn: 80,
    week_critical: 200,
  };
  try {
    const res = await fetch("/api/security-thresholds.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { thresholds: fallback, history: [] };
    const data = (await res.json()) as { ok: boolean; thresholds?: SecurityThresholds; history?: SecurityThresholdHistoryRow[] };
    if (!data?.ok || !data.thresholds) return { thresholds: fallback, history: [] };
    return { thresholds: data.thresholds, history: Array.isArray(data.history) ? data.history : [] };
  } catch {
    return { thresholds: fallback, history: [] };
  }
}

export async function saveSecurityThresholds(thresholds: SecurityThresholds): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/security-thresholds.php", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(thresholds),
    });
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { ok: boolean; message?: string };
    return { ok: !!data?.ok, message: data?.message };
  } catch {
    return { ok: false, message: "network_error" };
  }
}

export async function resetSecurityThresholds(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/security-thresholds.php", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ reset_defaults: true }),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok: boolean; message?: string };
    return { ok: !!data?.ok, message: data?.message };
  } catch {
    return { ok: false, message: "network_error" };
  }
}
