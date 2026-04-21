"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import { fetchAuditRows, type AuditRow } from "@/lib/audit-view-api";
import { exportCsvChunked } from "@/lib/csv-export";
import {
  fetchReviewMap,
  saveReviewStatus,
  type ReviewHistoryEntry,
  type ReviewMeta,
  type ReviewStatus,
} from "@/lib/audit-review-api";

type RowFlag =
  | "invalid_time"
  | "unknown_user"
  | "invalid_count"
  | "missing_ip"
  | "missing_ua"
  | "very_large_export";
type Severity = "high" | "medium" | "low";
function getRowFlags(row: AuditRow): RowFlag[] {
  const flags: RowFlag[] = [];
  const user = String(row.username || "").trim().toLowerCase();
  const ts = String(row.ts || "").trim();
  const ip = String(row.ip || "").trim();
  const ua = String(row.ua || "").trim();
  const count = Number(row.count || 0);

  if (!ts || Number.isNaN(Date.parse(ts))) flags.push("invalid_time");
  if (!user || user === "unknown" || user === "anonymous" || user === "-") flags.push("unknown_user");
  if (!Number.isFinite(count) || count < 0) flags.push("invalid_count");
  if (!ip) flags.push("missing_ip");
  if (!ua) flags.push("missing_ua");
  if (row.action === "export_csv" && count >= 10000) flags.push("very_large_export");
  return flags;
}

function flagLabel(flag: RowFlag): string {
  switch (flag) {
    case "invalid_time":
      return "เวลาไม่ถูกต้อง";
    case "unknown_user":
      return "ไม่ทราบผู้ใช้";
    case "invalid_count":
      return "จำนวนผิดปกติ";
    case "missing_ip":
      return "ไม่มี IP";
    case "missing_ua":
      return "ไม่มี UA";
    case "very_large_export":
      return "export ใหญ่มาก";
    default:
      return flag;
  }
}

function flagSeverity(flag: RowFlag): Severity {
  switch (flag) {
    case "invalid_time":
    case "unknown_user":
    case "invalid_count":
      return "high";
    case "missing_ip":
    case "very_large_export":
      return "medium";
    case "missing_ua":
      return "low";
    default:
      return "low";
  }
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case "high":
      return "สูง";
    case "medium":
      return "กลาง";
    case "low":
      return "ต่ำ";
    default:
      return severity;
  }
}

function moduleLabel(module: string): string {
  if (module === "money") return "โมดูลการเงิน";
  if (module === "slip") return "โมดูลสลิป";
  if (module === "tax") return "โมดูลภาษี";
  return module;
}

function actionLabel(action: string): string {
  if (action === "export_csv") return "ส่งออก CSV";
  if (action === "print") return "พิมพ์รายงาน";
  if (action === "workflow_transition") return "เปลี่ยนสถานะงาน";
  return action;
}

function rowSeverity(flags: RowFlag[]): Severity | null {
  if (flags.length === 0) return null;
  if (flags.some((f) => flagSeverity(f) === "high")) return "high";
  if (flags.some((f) => flagSeverity(f) === "medium")) return "medium";
  return "low";
}

function suggestedActions(flags: RowFlag[]): string[] {
  const actions: string[] = [];
  if (flags.includes("unknown_user")) {
    actions.push("ตรวจสิทธิ์/บัญชีผู้ใช้ที่ใช้เรียก API");
  }
  if (flags.includes("invalid_time")) {
    actions.push("ตรวจเวลาเซิร์ฟเวอร์และ timezone ของระบบ");
  }
  if (flags.includes("invalid_count")) {
    actions.push("ตรวจ payload/logic การนับจำนวนก่อนบันทึก audit");
  }
  if (flags.includes("missing_ip")) {
    actions.push("ตรวจ reverse proxy หรือ header forwarding ของ IP");
  }
  if (flags.includes("missing_ua")) {
    actions.push("ทวน client policy/เครื่องมือที่เรียก API โดยไม่มี User-Agent");
  }
  if (flags.includes("very_large_export")) {
    actions.push("ทวนความจำเป็นของ export ขนาดใหญ่และจำกัดช่วงข้อมูล");
  }
  if (actions.length === 0) {
    actions.push("ไม่ต้องดำเนินการ (ปกติ)");
  }
  return actions;
}

function auditRowKey(row: AuditRow): string {
  return [row.ts, row.username, row.module, row.action, String(row.count), row.ip ?? "", row.ua ?? ""].join("|");
}

function formatHistoryEntry(h: ReviewHistoryEntry): string {
  const from = h.from ? h.from : "unknown";
  const to = h.to ? h.to : "unknown";
  const by = h.by && h.by.trim() !== "" ? h.by : "unknown";
  const at = h.at && h.at.trim() !== "" ? h.at : "-";
  return `${from} -> ${to} by ${by} @ ${at}`;
}

function buildTimelineSummaryText(key: string, rows: ReviewHistoryEntry[]): string {
  const lines: string[] = [];
  lines.push(`รหัสไทม์ไลน์: ${key}`);
  lines.push(`จำนวนเหตุการณ์: ${rows.length}`);
  lines.push("");
  rows.forEach((h, idx) => {
    lines.push(`${idx + 1}. ${formatHistoryEntry(h)}`);
  });
  return lines.join("\n");
}

function buildIncidentBriefText(
  rows: Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }>,
  context: {
    moduleFilter: string;
    actionFilter: string;
    severityFilter: string;
    reviewFilter: string;
    recentHoursFilter: number;
  },
): string {
  const now = new Date().toLocaleString("th-TH");
  const total = rows.length;
  const severity = { high: 0, medium: 0, low: 0, normal: 0 };
  const review = { new: 0, acknowledged: 0, resolved: 0 };
  const topFlags: Record<string, number> = {};

  for (const item of rows) {
    const sev = rowSeverity(item.flags);
    if (sev === "high") severity.high += 1;
    else if (sev === "medium") severity.medium += 1;
    else if (sev === "low") severity.low += 1;
    else severity.normal += 1;

    review[item.reviewMeta.status] += 1;
    for (const f of item.flags) {
      const k = flagLabel(f);
      topFlags[k] = (topFlags[k] || 0) + 1;
    }
  }

  const topFlagList = Object.entries(topFlags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  const lines: string[] = [];
  lines.push("สรุปเหตุการณ์ (Audit)");
  lines.push(`เวลาสร้าง: ${now}`);
  lines.push(
    `Filter: module=${context.moduleFilter}, action=${context.actionFilter}, severity=${context.severityFilter}, review=${context.reviewFilter}, hours=${context.recentHoursFilter || "all"}`,
  );
  lines.push(`จำนวนทั้งหมด: ${total}`);
  lines.push(
    `ระดับความรุนแรง: สูง=${severity.high}, กลาง=${severity.medium}, ต่ำ=${severity.low}, ปกติ=${severity.normal}`,
  );
  lines.push(
    `สถานะตรวจทาน: ใหม่=${review.new}, รับทราบแล้ว=${review.acknowledged}, ปิดแล้ว=${review.resolved}`,
  );
  lines.push(`Top flags: ${topFlagList || "-"}`);
  lines.push("");
  lines.push("รายการสำคัญล่าสุด:");
  rows.slice(0, 5).forEach((item, i) => {
    const sev = rowSeverity(item.flags);
    const sevLabel = sev ? severityLabel(sev) : "ปกติ";
      lines.push(
      `${i + 1}) ${item.row.ts} | ${item.row.module}/${item.row.action} | ${item.row.username} | ${sevLabel} | สถานะตรวจทาน=${item.reviewMeta.status}`,
    );
  });
  return lines.join("\n");
}

function rowsWithinLastHours(
  rows: Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }>,
  hours: number,
): Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }> {
  const now = Date.now();
  const maxAgeMs = hours * 60 * 60 * 1000;
  return rows.filter((item) => {
    const t = Date.parse(item.row.ts);
    if (Number.isNaN(t)) return false;
    return now - t <= maxAgeMs;
  });
}

function rowsToday(
  rows: Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }>,
): Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return rows.filter((item) => {
    const t = Date.parse(item.row.ts);
    if (Number.isNaN(t)) return false;
    return t >= start && t < end;
  });
}

function buildDailyBriefText(
  label: string,
  rows: Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }>,
): string {
  return buildIncidentBriefText(rows, {
    moduleFilter: "all",
    actionFilter: "all",
    severityFilter: "all",
    reviewFilter: "all",
    recentHoursFilter: 0,
  }).replace("สรุปเหตุการณ์ (Audit)", `สรุปรายวัน (${label})`);
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportTimelineCsv(key: string, rows: ReviewHistoryEntry[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const cleanKey = key.replaceAll("|", "_").slice(0, 50);
  const header = ["รหัส", "สถานะเดิม", "สถานะใหม่", "ผู้ดำเนินการ", "เวลา", "สรุป"];
  const csvRows = rows.map((h) => [
    key,
    h.from || "",
    h.to || "",
    h.by || "",
    h.at || "",
    formatHistoryEntry(h),
  ]);
  await exportCsvChunked({
    filename: `audit-timeline-${cleanKey}-${stamp}.csv`,
    header,
    rows: csvRows,
  });
}

async function exportAuditCsv(
  rows: Array<{ row: AuditRow; flags: RowFlag[]; reviewMeta: ReviewMeta }>,
  includeOnlyAnomaly: boolean,
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = [
    "เวลา",
    "ผู้ใช้",
    "โมดูล",
    "การกระทำ",
    "จำนวนรายการ",
    "ระดับความรุนแรง",
    "Flags",
    "สถานะตรวจทาน",
    "ผู้ปรับสถานะตรวจทาน",
    "เวลาปรับสถานะตรวจทาน",
    "ลำดับเหตุการณ์ตรวจทาน",
    "ข้อเสนอแนะการดำเนินการ",
    "IP",
    "ตัวแทนผู้ใช้งาน (User Agent)",
  ];
  const csvRows = rows.map(({ row, flags, reviewMeta }) => [
    row.ts,
    row.username,
    row.module,
    row.action,
    String(row.count),
    rowSeverity(flags) ? severityLabel(rowSeverity(flags) as Severity) : "ปกติ",
    flags.length > 0 ? flags.map(flagLabel).join(" | ") : "ปกติ",
    reviewMeta.status,
    reviewMeta.updatedBy || "",
    reviewMeta.updatedAt || "",
    Array.isArray(reviewMeta.history) ? reviewMeta.history.map(formatHistoryEntry).join(" || ") : "",
    suggestedActions(flags).join(" | "),
    row.ip ?? "",
    row.ua ?? "",
  ]);
  await exportCsvChunked({
    filename: includeOnlyAnomaly ? `audit-anomaly-${stamp}.csv` : `audit-all-${stamp}.csv`,
    header,
    rows: csvRows,
  });
}

export default function AuditPage() {
  const [moduleFilter, setModuleFilter] = useState("ทั้งหมด");
  const [actionFilter, setActionFilter] = useState("ทั้งหมด");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"ทั้งหมด" | "high" | "medium" | "low" | "normal">("ทั้งหมด");
  const [showOnlyAnomaly, setShowOnlyAnomaly] = useState(false);
  const [recentHoursFilter, setRecentHoursFilter] = useState<0 | 24 | 168>(0);
  const [reviewFilter, setReviewFilter] = useState<"ทั้งหมด" | ReviewStatus>("ทั้งหมด");
  const [reviewState, setReviewState] = useState<Record<string, ReviewMeta>>({});
  const [timelineTarget, setTimelineTarget] = useState<{ key: string; history: ReviewHistoryEntry[] } | null>(null);
  const [timelineQuery, setTimelineQuery] = useState("");
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<"ทั้งหมด" | ReviewStatus>("ทั้งหมด");
  const [copyStatus, setCopyStatus] = useState<"" | "ok" | "error">("");
  const [briefCopyStatus, setBriefCopyStatus] = useState<"" | "ok" | "error">("");
  const [briefExportStatus, setBriefExportStatus] = useState<"" | "ok" | "error">("");
  const [dailyBriefStatus, setDailyBriefStatus] = useState<"" | "ok_today" | "ok_24h" | "error">("");
  const [dailyExportStatus, setDailyExportStatus] = useState<"" | "ok_today" | "ok_24h" | "error">("");
  const [snapshotStatus, setSnapshotStatus] = useState<"" | "ok" | "error">("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetchAuditRows({
      module: moduleFilter,
      action: actionFilter,
      username: usernameFilter,
      limit: 200,
    }).then(async (data) => {
      if (!active) return;
      setRows(data.rows);
      if (!data.ok) {
        setMessage(`โหลดไม่สำเร็จ: ${data.message ?? "unknown_error"}`);
      } else {
        const rv = await fetchReviewMap();
        if (!active) return;
        if (rv.ok) {
          setReviewState(rv.map || {});
          setMessage("");
        } else {
          setMessage(`โหลดสถานะ review ไม่สำเร็จ: ${rv.message ?? "unknown_error"}`);
        }
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [moduleFilter, actionFilter, usernameFilter, reloadTick]);

  const setRowReviewStatus = async (row: AuditRow, status: ReviewStatus) => {
    const key = auditRowKey(row);
    const prev = reviewState[key] ?? { status: "new", updatedBy: "", updatedAt: "" };
    const optimistic: ReviewMeta = {
      status,
      updatedBy: "กำลังบันทึก...",
      updatedAt: new Date().toISOString(),
      history: Array.isArray(prev.history)
        ? [...prev.history, { from: prev.status, to: status, by: "กำลังบันทึก...", at: new Date().toISOString() }]
        : [{ from: prev.status, to: status, by: "กำลังบันทึก...", at: new Date().toISOString() }],
    };
    setReviewState((state) => ({ ...state, [key]: optimistic }));
    const saved = await saveReviewStatus(key, status);
    if (!saved.ok) {
      setReviewState((state) => ({ ...state, [key]: prev }));
      setMessage(`บันทึก review ไม่สำเร็จ: ${saved.message ?? "unknown_error"}`);
      return;
    }
    if (saved.meta) {
      setReviewState((state) => ({ ...state, [key]: saved.meta as ReviewMeta }));
    }
    setMessage("");
  };

  const openTimeline = (row: AuditRow, meta: ReviewMeta) => {
    const key = auditRowKey(row);
    setTimelineTarget({
      key,
      history: Array.isArray(meta.history) ? meta.history : [],
    });
    setTimelineQuery("");
    setTimelineStatusFilter("ทั้งหมด");
    setCopyStatus("");
  };

  const timelineVisible = useMemo(() => {
    if (!timelineTarget) return [];
    const q = timelineQuery.trim().toLowerCase();
    return timelineTarget.history
      .slice()
      .reverse()
      .filter((h) => {
        if (timelineStatusFilter !== "ทั้งหมด" && h.to !== timelineStatusFilter) return false;
        if (q === "") return true;
        const hay = `${h.from || ""} ${h.to || ""} ${h.by || ""} ${h.at || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [timelineTarget, timelineQuery, timelineStatusFilter]);

  const copyTimelineSummary = async (key: string, rows: ReviewHistoryEntry[]) => {
    const text = buildTimelineSummaryText(key, rows);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("ok");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus(""), 1800);
  };

  const copyIncidentBrief = async () => {
    const text = buildIncidentBriefText(sortedVisibleRows, {
      moduleFilter,
      actionFilter,
      severityFilter,
      reviewFilter,
      recentHoursFilter,
    });
    try {
      await navigator.clipboard.writeText(text);
      setBriefCopyStatus("ok");
    } catch {
      setBriefCopyStatus("error");
    }
    window.setTimeout(() => setBriefCopyStatus(""), 1800);
  };

  const exportIncidentBriefText = () => {
    try {
      const text = buildIncidentBriefText(sortedVisibleRows, {
        moduleFilter,
        actionFilter,
        severityFilter,
        reviewFilter,
        recentHoursFilter,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`incident-brief-${stamp}.txt`, text);
      setBriefExportStatus("ok");
    } catch {
      setBriefExportStatus("error");
    }
    window.setTimeout(() => setBriefExportStatus(""), 1800);
  };

  const exportFullAuditSnapshot = async () => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const incidentText = buildIncidentBriefText(sortedVisibleRows, {
        moduleFilter,
        actionFilter,
        severityFilter,
        reviewFilter,
        recentHoursFilter,
      });
      downloadTextFile(`audit-snapshot-incident-${stamp}.txt`, incidentText);

      const csvRows = sortedVisibleRows.map(({ row, flags, reviewMeta }) => [
        row.ts,
        row.username,
        row.module,
        row.action,
        String(row.count),
        rowSeverity(flags) ? severityLabel(rowSeverity(flags) as Severity) : "ปกติ",
        flags.length > 0 ? flags.map(flagLabel).join(" | ") : "ปกติ",
        reviewMeta.status,
        reviewMeta.updatedBy || "",
        reviewMeta.updatedAt || "",
        Array.isArray(reviewMeta.history) ? reviewMeta.history.map(formatHistoryEntry).join(" || ") : "",
        suggestedActions(flags).join(" | "),
        row.ip ?? "",
        row.ua ?? "",
      ]);
      await exportCsvChunked({
        filename: `audit-snapshot-data-${stamp}.csv`,
        header: [
          "เวลา",
          "ผู้ใช้",
          "โมดูล",
          "การกระทำ",
          "จำนวนรายการ",
          "ระดับความรุนแรง",
          "Flags",
          "สถานะตรวจทาน",
          "ผู้ปรับสถานะตรวจทาน",
          "เวลาปรับสถานะตรวจทาน",
          "ลำดับเหตุการณ์ตรวจทาน",
          "ข้อเสนอแนะการดำเนินการ",
          "IP",
          "ตัวแทนผู้ใช้งาน (User Agent)",
        ],
        rows: csvRows,
      });

      setSnapshotStatus("ok");
    } catch {
      setSnapshotStatus("error");
    }
    window.setTimeout(() => setSnapshotStatus(""), 2000);
  };

  const copyDailyBrief = async (mode: "today" | "24h") => {
    const data = mode === "today" ? rowsToday(flaggedRows) : rowsWithinLastHours(flaggedRows, 24);
    const text = buildDailyBriefText(mode === "today" ? "วันนี้" : "ย้อนหลัง 24 ชั่วโมง", data);
    try {
      await navigator.clipboard.writeText(text);
      setDailyBriefStatus(mode === "today" ? "ok_today" : "ok_24h");
    } catch {
      setDailyBriefStatus("error");
    }
    window.setTimeout(() => setDailyBriefStatus(""), 1800);
  };

  const exportDailyBriefText = (mode: "today" | "24h") => {
    try {
      const data = mode === "today" ? rowsToday(flaggedRows) : rowsWithinLastHours(flaggedRows, 24);
      const label = mode === "today" ? "วันนี้" : "ย้อนหลัง 24 ชั่วโมง";
      const text = buildDailyBriefText(label, data);
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = mode === "today" ? "today" : "24h";
      downloadTextFile(`daily-brief-${suffix}-${stamp}.txt`, text);
      setDailyExportStatus(mode === "today" ? "ok_today" : "ok_24h");
    } catch {
      setDailyExportStatus("error");
    }
    window.setTimeout(() => setDailyExportStatus(""), 1800);
  };

  const flaggedRows = useMemo(
    () =>
      rows.map((row) => {
        const flags = getRowFlags(row);
        const key = auditRowKey(row);
        const reviewMeta: ReviewMeta = reviewState[key] ?? { status: "new", updatedBy: "", updatedAt: "", history: [] };
        return { row, flags, reviewMeta };
      }),
    [rows, reviewState],
  );
  const visibleRows = useMemo(() => {
    let list = showOnlyAnomaly ? flaggedRows.filter((x) => x.flags.length > 0) : flaggedRows;
    if (severityFilter !== "ทั้งหมด") {
      list = list.filter((item) => {
        const sev = rowSeverity(item.flags);
        if (severityFilter === "normal") return sev === null;
        return sev === severityFilter;
      });
    }
    if (recentHoursFilter > 0) {
      const now = Date.now();
      const maxAgeMs = recentHoursFilter * 60 * 60 * 1000;
      list = list.filter((item) => {
        const t = Date.parse(item.row.ts);
        if (Number.isNaN(t)) return false;
        return now - t <= maxAgeMs;
      });
    }
    if (reviewFilter !== "ทั้งหมด") list = list.filter((item) => item.reviewMeta.status === reviewFilter);
    return list;
  }, [flaggedRows, showOnlyAnomaly, severityFilter, recentHoursFilter, reviewFilter]);
  const sortedVisibleRows = useMemo(() => {
    const rank = (sev: Severity | null) => {
      if (sev === "high") return 3;
      if (sev === "medium") return 2;
      if (sev === "low") return 1;
      return 0;
    };
    return [...visibleRows].sort((a, b) => {
      const ra = rank(rowSeverity(a.flags));
      const rb = rank(rowSeverity(b.flags));
      if (ra !== rb) return rb - ra;
      const ta = Date.parse(a.row.ts);
      const tb = Date.parse(b.row.ts);
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
      return 0;
    });
  }, [visibleRows]);
  const anomalySummary = useMemo(() => {
    const summary: Record<RowFlag, number> = {
      invalid_time: 0,
      unknown_user: 0,
      invalid_count: 0,
      missing_ip: 0,
      missing_ua: 0,
      very_large_export: 0,
    };
    for (const item of flaggedRows) {
      for (const f of item.flags) summary[f] += 1;
    }
    return summary;
  }, [flaggedRows]);
  const totalAnomalyRows = useMemo(
    () => flaggedRows.reduce((acc, item) => acc + (item.flags.length > 0 ? 1 : 0), 0),
    [flaggedRows],
  );
  const severitySummary = useMemo(() => {
    const summary: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const item of flaggedRows) {
      const sev = rowSeverity(item.flags);
      if (sev) summary[sev] += 1;
    }
    return summary;
  }, [flaggedRows]);

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">มุมมองบันทึกการตรวจสอบ</h1>
        <p className="mt-3 text-slate-600">ดูประวัติการส่งออก/พิมพ์ของผู้ใช้งาน (สิทธิ์ผู้ดูแลระบบเท่านั้น)</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-6">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={moduleFilter}
              onChange={(e) => {
                setLoading(true);
                setModuleFilter(e.target.value);
              }}
            >
              <option>ทั้งหมด</option>
              <option value="money">โมดูลการเงิน</option>
              <option value="slip">โมดูลสลิป</option>
              <option value="tax">โมดูลภาษี</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={actionFilter}
              onChange={(e) => {
                setLoading(true);
                setActionFilter(e.target.value);
              }}
            >
              <option>ทั้งหมด</option>
              <option value="export_csv">ส่งออก CSV</option>
              <option value="print">พิมพ์รายงาน</option>
              <option value="workflow_transition">เปลี่ยนสถานะงาน</option>
            </select>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="ค้นหาชื่อผู้ใช้งาน"
              value={usernameFilter}
              onChange={(e) => {
                setLoading(true);
                setUsernameFilter(e.target.value);
              }}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={severityFilter}
              onChange={(e) => {
                setLoading(true);
                setSeverityFilter(e.target.value as "ทั้งหมด" | "high" | "medium" | "low" | "normal");
              }}
            >
              <option value="ทั้งหมด">ระดับความรุนแรง: ทั้งหมด</option>
              <option value="high">ระดับความรุนแรง: สูง</option>
              <option value="medium">ระดับความรุนแรง: กลาง</option>
              <option value="low">ระดับความรุนแรง: ต่ำ</option>
              <option value="normal">ระดับความรุนแรง: ปกติ</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={reviewFilter}
              onChange={(e) => {
                setLoading(true);
                setReviewFilter(e.target.value as "ทั้งหมด" | ReviewStatus);
              }}
            >
              <option value="ทั้งหมด">สถานะตรวจทาน: ทั้งหมด</option>
              <option value="new">สถานะตรวจทาน: ใหม่</option>
              <option value="acknowledged">สถานะตรวจทาน: รับทราบแล้ว</option>
              <option value="resolved">สถานะตรวจทาน: ปิดแล้ว</option>
            </select>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              onClick={() => {
                setLoading(true);
                setReloadTick((v) => v + 1);
              }}
            >
              รีเฟรชข้อมูล
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 font-semibold text-rose-800 hover:bg-rose-100"
              onClick={() => {
                setShowOnlyAnomaly(true);
                setSeverityFilter("high");
                setRecentHoursFilter(24);
              }}
            >
              ระดับสูง ล่าสุด 24 ชม.
            </button>
            <button
              type="button"
              className="rounded-md border border-orange-300 bg-orange-50 px-2 py-1 font-semibold text-orange-800 hover:bg-orange-100"
              onClick={() => {
                setShowOnlyAnomaly(true);
                setSeverityFilter("high");
                setRecentHoursFilter(168);
              }}
            >
              ระดับสูง ล่าสุด 7 วัน
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setShowOnlyAnomaly(false);
                setSeverityFilter("ทั้งหมด");
                setRecentHoursFilter(0);
                setReviewFilter("ทั้งหมด");
                setModuleFilter("ทั้งหมด");
                setActionFilter("ทั้งหมด");
                setUsernameFilter("");
              }}
            >
              รีเซ็ตตัวกรอง
            </button>
            <button
              type="button"
              className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-800 hover:bg-indigo-100"
              onClick={() => {
                void copyIncidentBrief();
              }}
            >
              คัดลอกสรุปเหตุการณ์
            </button>
            <button
              type="button"
              className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-800 hover:bg-violet-100"
              onClick={() => exportIncidentBriefText()}
            >
              ส่งออกสรุปเหตุการณ์ TXT
            </button>
            <button
              type="button"
              className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 py-1 font-semibold text-fuchsia-800 hover:bg-fuchsia-100"
              onClick={() => {
                void exportFullAuditSnapshot();
              }}
            >
              ส่งออกภาพรวม Audit ทั้งชุด
            </button>
            <button
              type="button"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100"
              onClick={() => {
                void copyDailyBrief("today");
              }}
            >
              คัดลอกสรุปรายวัน (วันนี้)
            </button>
            <button
              type="button"
              className="rounded-md border border-teal-300 bg-teal-50 px-2 py-1 font-semibold text-teal-800 hover:bg-teal-100"
              onClick={() => {
                void copyDailyBrief("24h");
              }}
            >
              คัดลอกสรุปรายวัน (24 ชม.)
            </button>
            <button
              type="button"
              className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 font-semibold text-sky-800 hover:bg-sky-100"
              onClick={() => exportDailyBriefText("today")}
            >
              ส่งออกสรุปรายวัน TXT (วันนี้)
            </button>
            <button
              type="button"
              className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 font-semibold text-cyan-800 hover:bg-cyan-100"
              onClick={() => exportDailyBriefText("24h")}
            >
              ส่งออกสรุปรายวัน TXT (24 ชม.)
            </button>
            <button
              type="button"
              className={`rounded-md border px-2 py-1 font-medium ${
                showOnlyAnomaly
                  ? "border-amber-400 bg-amber-100 text-amber-900"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
              onClick={() => setShowOnlyAnomaly((v) => !v)}
            >
              {showOnlyAnomaly ? "แสดงทั้งหมด" : "แสดงเฉพาะรายการผิดปกติ"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                void exportAuditCsv(sortedVisibleRows, showOnlyAnomaly);
              }}
            >
              ส่งออก Audit CSV
            </button>
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
              แถวผิดปกติ: {totalAnomalyRows}
            </span>
            <span className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800">
              สูง: {severitySummary.high}
            </span>
            <span className="rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-orange-800">
              กลาง: {severitySummary.medium}
            </span>
            <span className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-1 text-cyan-800">
              ต่ำ: {severitySummary.low}
            </span>
            {(Object.keys(anomalySummary) as RowFlag[]).map((k) =>
              anomalySummary[k] > 0 ? (
                <span key={k} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                  {flagLabel(k)}: {anomalySummary[k]}
                </span>
              ) : null,
            )}
          </div>

          <div className="mt-4 text-sm text-slate-600">
            พบรายการ: <span className="font-semibold text-slate-900">{visibleRows.length}</span>
            {showOnlyAnomaly ? (
              <span className="ml-2 text-xs text-amber-700">(กรองเฉพาะแถวที่มีตัวบ่งชี้ผิดปกติ)</span>
            ) : null}
            {severityFilter !== "ทั้งหมด" ? (
              <span className="ml-2 text-xs text-slate-500">
                (ระดับความรุนแรง: {severityFilter === "normal" ? "ปกติ" : severityLabel(severityFilter as Severity)})
              </span>
            ) : null}
            {reviewFilter !== "ทั้งหมด" ? (
              <span className="ml-2 text-xs text-slate-500">(สถานะตรวจทาน: {reviewFilter})</span>
            ) : null}
            {recentHoursFilter > 0 ? (
              <span className="ml-2 text-xs text-slate-500">(ช่วงเวลา: ล่าสุด {recentHoursFilter} ชม.)</span>
            ) : null}
            {briefCopyStatus === "ok" ? <span className="ml-2 text-xs text-emerald-700">คัดลอกสรุปเหตุการณ์แล้ว</span> : null}
            {briefCopyStatus === "error" ? (
              <span className="ml-2 text-xs text-rose-700">คัดลอกสรุปเหตุการณ์ไม่สำเร็จ</span>
            ) : null}
            {briefExportStatus === "ok" ? (
              <span className="ml-2 text-xs text-emerald-700">ส่งออกสรุปเหตุการณ์ TXT แล้ว</span>
            ) : null}
            {briefExportStatus === "error" ? (
              <span className="ml-2 text-xs text-rose-700">ส่งออกสรุปเหตุการณ์ TXT ไม่สำเร็จ</span>
            ) : null}
            {snapshotStatus === "ok" ? (
              <span className="ml-2 text-xs text-emerald-700">ส่งออกภาพรวมบันทึกการตรวจสอบทั้งชุดแล้ว (TXT + CSV)</span>
            ) : null}
            {snapshotStatus === "error" ? (
              <span className="ml-2 text-xs text-rose-700">ส่งออกภาพรวมบันทึกการตรวจสอบทั้งชุดไม่สำเร็จ</span>
            ) : null}
            {dailyBriefStatus === "ok_today" ? (
              <span className="ml-2 text-xs text-emerald-700">คัดลอกสรุปรายวัน (วันนี้) แล้ว</span>
            ) : null}
            {dailyBriefStatus === "ok_24h" ? (
              <span className="ml-2 text-xs text-emerald-700">คัดลอกสรุปรายวัน (24 ชม.) แล้ว</span>
            ) : null}
            {dailyBriefStatus === "error" ? (
              <span className="ml-2 text-xs text-rose-700">คัดลอกสรุปรายวันไม่สำเร็จ</span>
            ) : null}
            {dailyExportStatus === "ok_today" ? (
              <span className="ml-2 text-xs text-emerald-700">ส่งออกสรุปรายวัน TXT (วันนี้) แล้ว</span>
            ) : null}
            {dailyExportStatus === "ok_24h" ? (
              <span className="ml-2 text-xs text-emerald-700">ส่งออกสรุปรายวัน TXT (24 ชม.) แล้ว</span>
            ) : null}
            {dailyExportStatus === "error" ? (
              <span className="ml-2 text-xs text-rose-700">ส่งออกสรุปรายวัน TXT ไม่สำเร็จ</span>
            ) : null}
            {message ? <span className="ml-3 text-red-600">{message}</span> : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            {loading ? <p className="pb-2 text-sm text-slate-500">กำลังโหลดข้อมูล...</p> : null}
            <table className="w-full min-w-[1380px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">เวลา</th>
                  <th className="py-2">ผู้ใช้</th>
                  <th className="py-2">โมดูล</th>
                  <th className="py-2">การกระทำ</th>
                  <th className="py-2">จำนวนรายการ</th>
                  <th className="py-2">ระดับความรุนแรง</th>
                  <th className="py-2">ตัวบ่งชี้ผิดปกติ</th>
                  <th className="py-2">ตรวจทาน</th>
                  <th className="py-2">ข้อเสนอแนะการดำเนินการ</th>
                  <th className="py-2">IP</th>
                  <th className="py-2">ตัวแทนผู้ใช้งาน (User Agent)</th>
                </tr>
              </thead>
              <tbody>
                {sortedVisibleRows.map(({ row: r, flags, reviewMeta }, idx) => (
                  <tr key={`${r.ts}-${idx}`} className="border-b border-slate-100">
                    <td className="py-2">{r.ts}</td>
                    <td className="py-2 font-medium">{r.username}</td>
                    <td className="py-2">{moduleLabel(r.module)}</td>
                    <td className="py-2">{actionLabel(r.action)}</td>
                    <td className="py-2">{r.count}</td>
                    <td className="py-2">
                      {rowSeverity(flags) === null ? (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          ปกติ
                        </span>
                      ) : rowSeverity(flags) === "high" ? (
                        <span className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-800">
                          สูง
                        </span>
                      ) : rowSeverity(flags) === "medium" ? (
                        <span className="rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                          กลาง
                        </span>
                      ) : (
                        <span className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-800">
                          ต่ำ
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {flags.length === 0 ? (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          ปกติ
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <span
                              key={f}
                              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                            >
                              {flagLabel(f)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={`rounded-md border px-2 py-0.5 text-xs ${
                            reviewMeta.status === "new"
                              ? "border-slate-400 bg-slate-100 text-slate-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                          onClick={() => setRowReviewStatus(r, "new")}
                        >
                          ใหม่
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2 py-0.5 text-xs ${
                            reviewMeta.status === "acknowledged"
                              ? "border-blue-300 bg-blue-100 text-blue-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                          onClick={() => setRowReviewStatus(r, "acknowledged")}
                        >
                          รับทราบแล้ว
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2 py-0.5 text-xs ${
                            reviewMeta.status === "resolved"
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                          onClick={() => setRowReviewStatus(r, "resolved")}
                        >
                          ปิดแล้ว
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 hover:bg-indigo-100"
                          onClick={() => openTimeline(r, reviewMeta)}
                        >
                          ดูไทม์ไลน์เต็ม
                        </button>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        by {reviewMeta.updatedBy || "-"} @ {reviewMeta.updatedAt || "-"}
                      </div>
                      {Array.isArray(reviewMeta.history) && reviewMeta.history.length > 0 ? (
                        <div className="mt-1 space-y-1 text-[11px] text-slate-500">
                          {reviewMeta.history
                            .slice()
                            .reverse()
                            .slice(0, 3)
                            .map((h, i) => (
                              <div key={`${h.at || "na"}-${i}`}>{formatHistoryEntry(h)}</div>
                            ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {suggestedActions(flags).map((text, i) => (
                          <span
                            key={`${text}-${i}`}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800"
                          >
                            {text}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">{r.ip ?? "-"}</td>
                    <td className="py-2">{r.ua ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {timelineTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">ไทม์ไลน์การเปลี่ยนสถานะตรวจทาน</h3>
                  <p className="text-xs text-slate-500">รหัส: {timelineTarget.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      void exportTimelineCsv(timelineTarget.key, timelineVisible);
                    }}
                  >
                    ส่งออกไทม์ไลน์ CSV
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      void copyTimelineSummary(timelineTarget.key, timelineVisible);
                    }}
                  >
                    คัดลอกสรุปไทม์ไลน์
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => setTimelineTarget(null)}
                  >
                    ปิด
                  </button>
                </div>
              </div>
              <div className="max-h-[65vh] overflow-auto p-4">
                <div className="mb-3 grid gap-2 md:grid-cols-3">
                  <input
                    className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="ค้นหาในไทม์ไลน์ (ผู้แก้/สถานะ/เวลา)"
                    value={timelineQuery}
                    onChange={(e) => setTimelineQuery(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    value={timelineStatusFilter}
                    onChange={(e) => setTimelineStatusFilter(e.target.value as "ทั้งหมด" | ReviewStatus)}
                  >
                    <option value="ทั้งหมด">สถานะทั้งหมด</option>
                    <option value="new">ไปสถานะ: ใหม่</option>
                    <option value="acknowledged">ไปสถานะ: รับทราบแล้ว</option>
                    <option value="resolved">ไปสถานะ: ปิดแล้ว</option>
                  </select>
                </div>
                {copyStatus === "ok" ? (
                  <p className="mb-2 text-xs text-emerald-700">คัดลอกสรุปไทม์ไลน์แล้ว</p>
                ) : null}
                {copyStatus === "error" ? (
                  <p className="mb-2 text-xs text-rose-700">คัดลอกไม่สำเร็จ (clipboard ไม่พร้อมใช้งาน)</p>
                ) : null}

                {timelineVisible.length === 0 ? (
                  <p className="text-sm text-slate-500">ยังไม่มีประวัติการเปลี่ยนสถานะ</p>
                ) : (
                  <div className="space-y-2">
                    {timelineVisible.map((h, i) => (
                      <div key={`${h.at || "na"}-${i}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-900">
                          {h.from || "unknown"} -&gt; {h.to || "unknown"}
                        </p>
                        <p className="text-xs text-slate-600">
                          by {h.by || "unknown"} @ {h.at || "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </AuthGuard>
  );
}
