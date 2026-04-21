export type DailyBriefResponse = {
  ok: boolean;
  date: string;
  summary: {
    audit_total: number;
    audit_unique_users: number;
    audit_by_module: Record<string, number>;
    audit_by_action: Record<string, number>;
    security_total: number;
    security_today_count: number;
    security_seven_day_count: number;
    risk_level: "ok" | "warn" | "critical";
  };
  top_buckets: Array<{ bucket: string; count: number }>;
  top_ips: Array<{ ip: string; count: number }>;
  trend_7d: Array<{
    date: string;
    audit_total: number;
    security_total: number;
    risk_level: "ok" | "warn" | "critical";
  }>;
  thresholds: {
    today_warn: number;
    today_critical: number;
    week_warn: number;
    week_critical: number;
  };
  recommendations: string[];
  message?: string;
};

export async function fetchDailyBrief(date?: string): Promise<DailyBriefResponse> {
  try {
    const search = new URLSearchParams();
    if (date && date.trim() !== "") search.set("date", date.trim());
    const res = await fetch(`/api/daily-brief.php?${search.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        date: date ?? "",
        summary: {
          audit_total: 0,
          audit_unique_users: 0,
          audit_by_module: {},
          audit_by_action: {},
          security_total: 0,
          security_today_count: 0,
          security_seven_day_count: 0,
          risk_level: "ok",
        },
        top_buckets: [],
        top_ips: [],
        trend_7d: [],
        thresholds: { today_warn: 20, today_critical: 50, week_warn: 80, week_critical: 200 },
        recommendations: [],
        message: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as DailyBriefResponse;
    if (!data || !data.summary) throw new Error("invalid_payload");
    return data;
  } catch {
    return {
      ok: false,
      date: date ?? "",
      summary: {
        audit_total: 0,
        audit_unique_users: 0,
        audit_by_module: {},
        audit_by_action: {},
        security_total: 0,
        security_today_count: 0,
        security_seven_day_count: 0,
        risk_level: "ok",
      },
      top_buckets: [],
      top_ips: [],
      trend_7d: [],
      thresholds: { today_warn: 20, today_critical: 50, week_warn: 80, week_critical: 200 },
      recommendations: [],
      message: "network_error",
    };
  }
}
