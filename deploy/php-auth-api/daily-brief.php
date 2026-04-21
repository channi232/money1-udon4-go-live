<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('daily_brief', 30, 60)) exit;
require_role_json(array('admin'));

function safe_date_input($s) {
    $s = trim((string)$s);
    if ($s === '') return date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return '';
    return $s;
}

function load_security_thresholds_daily($file, $defaults) {
    if (!file_exists($file)) return $defaults;
    $raw = @file_get_contents($file);
    $data = json_decode($raw, true);
    if (!is_array($data)) return $defaults;
    return array(
        'today_warn' => isset($data['today_warn']) ? (int)$data['today_warn'] : $defaults['today_warn'],
        'today_critical' => isset($data['today_critical']) ? (int)$data['today_critical'] : $defaults['today_critical'],
        'week_warn' => isset($data['week_warn']) ? (int)$data['week_warn'] : $defaults['week_warn'],
        'week_critical' => isset($data['week_critical']) ? (int)$data['week_critical'] : $defaults['week_critical'],
    );
}

function daily_risk_level($dailyCount, $warn, $critical) {
    if ($dailyCount >= $critical) return 'critical';
    if ($dailyCount >= $warn) return 'warn';
    return 'ok';
}

$dateParam = isset($_GET['date']) ? safe_date_input($_GET['date']) : date('Y-m-d');
if ($dateParam === '') {
    deny_bad_request_json('invalid_date');
}

$fromTs = strtotime($dateParam . ' 00:00:00');
$toTs = strtotime($dateParam . ' 23:59:59');
if ($fromTs === false || $toTs === false) {
    deny_bad_request_json('invalid_date_range');
}

$auditFile = __DIR__ . '/logs/audit.log';
$securityFile = __DIR__ . '/logs/security.log';
$thresholdFile = __DIR__ . '/logs/security-thresholds.json';

$auditRows = 0;
$auditByModule = array('money' => 0, 'slip' => 0, 'tax' => 0, 'other' => 0);
$auditByAction = array('export_csv' => 0, 'print' => 0, 'other' => 0);
$auditUsers = array();
$trendStartTs = strtotime($dateParam . ' 00:00:00') - (6 * 24 * 60 * 60);
$trendEndTs = $toTs;
$trendMap = array();
for ($d = 0; $d < 7; $d++) {
    $dayTs = $trendStartTs + ($d * 24 * 60 * 60);
    $dayKey = date('Y-m-d', $dayTs);
    $trendMap[$dayKey] = array(
        'date' => $dayKey,
        'audit_total' => 0,
        'security_total' => 0,
        'risk_level' => 'ok',
    );
}

if (file_exists($auditFile)) {
    $lines = @file($auditFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines)) {
        foreach ($lines as $line) {
            $row = json_decode($line, true);
            if (!is_array($row)) continue;
            $ts = isset($row['ts']) ? strtotime((string)$row['ts']) : false;
            if ($ts === false || $ts < $fromTs || $ts > $toTs) continue;
            $auditRows++;
            $module = isset($row['module']) ? strtolower((string)$row['module']) : 'other';
            $action = isset($row['action']) ? strtolower((string)$row['action']) : 'other';
            $username = isset($row['username']) ? strtolower(trim((string)$row['username'])) : '';
            if (!isset($auditByModule[$module])) $module = 'other';
            if (!isset($auditByAction[$action])) $action = 'other';
            $auditByModule[$module]++;
            $auditByAction[$action]++;
            if ($username !== '') $auditUsers[$username] = true;
            $dayKey = date('Y-m-d', $ts);
            if (isset($trendMap[$dayKey])) {
                $trendMap[$dayKey]['audit_total']++;
            }
        }
    }
}

$securityRows = 0;
$securityByBucket = array();
$securityByIp = array();
$today429 = 0;
$sevenDay429 = 0;
$todayStart = strtotime(date('Y-m-d 00:00:00'));
$sevenDayStart = time() - (7 * 24 * 60 * 60);

if (file_exists($securityFile)) {
    $lines = @file($securityFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines)) {
        foreach ($lines as $line) {
            $row = json_decode($line, true);
            if (!is_array($row)) continue;
            $ts = isset($row['ts']) ? strtotime((string)$row['ts']) : false;
            if ($ts !== false) {
                if ($ts >= $todayStart) $today429++;
                if ($ts >= $sevenDayStart) $sevenDay429++;
            }
            if ($ts === false || $ts < $fromTs || $ts > $toTs) continue;
            $securityRows++;
            $bucket = isset($row['bucket']) ? (string)$row['bucket'] : 'unknown';
            $ip = isset($row['ip']) ? (string)$row['ip'] : 'unknown';
            if (!isset($securityByBucket[$bucket])) $securityByBucket[$bucket] = 0;
            if (!isset($securityByIp[$ip])) $securityByIp[$ip] = 0;
            $securityByBucket[$bucket]++;
            $securityByIp[$ip]++;
            $dayKey = date('Y-m-d', $ts);
            if (isset($trendMap[$dayKey])) {
                $trendMap[$dayKey]['security_total']++;
            }
        }
    }
}

arsort($securityByBucket);
arsort($securityByIp);
$topBuckets = array();
$topIps = array();
foreach ($securityByBucket as $k => $v) {
    $topBuckets[] = array('bucket' => $k, 'count' => $v);
    if (count($topBuckets) >= 5) break;
}
foreach ($securityByIp as $k => $v) {
    $topIps[] = array('ip' => $k, 'count' => $v);
    if (count($topIps) >= 5) break;
}

$defaults = array(
    'today_warn' => 20,
    'today_critical' => 50,
    'week_warn' => 80,
    'week_critical' => 200,
);
$thresholds = load_security_thresholds_daily($thresholdFile, $defaults);
foreach ($trendMap as $k => $trendRow) {
    $trendMap[$k]['risk_level'] = daily_risk_level(
        isset($trendRow['security_total']) ? (int)$trendRow['security_total'] : 0,
        $thresholds['today_warn'],
        $thresholds['today_critical']
    );
}
$riskLevel = 'ok';
if ($today429 >= $thresholds['today_critical'] || $sevenDay429 >= $thresholds['week_critical']) {
    $riskLevel = 'critical';
} else if ($today429 >= $thresholds['today_warn'] || $sevenDay429 >= $thresholds['week_warn']) {
    $riskLevel = 'warn';
}

$recommendations = array();
if ($riskLevel === 'critical') {
    $recommendations[] = 'ระดับเสี่ยงวิกฤต: ตรวจสอบ top IP และ endpoint ที่โดนยิงทันที';
    $recommendations[] = 'พิจารณาเพิ่ม WAF/rate-limit เฉพาะ endpoint ที่มีความเสี่ยงสูง';
} else if ($riskLevel === 'warn') {
    $recommendations[] = 'ระดับเสี่ยงเตือน: เฝ้าระวัง traffic ต่อเนื่องและตรวจแนวโน้มรายชั่วโมง';
}
if ($auditRows === 0) {
    $recommendations[] = 'วันนี้ยังไม่มี audit activity (export/print) จากผู้ใช้งาน';
}
if (count($recommendations) === 0) {
    $recommendations[] = 'ภาพรวมปกติ: ไม่พบสัญญาณผิดปกติที่เกิน threshold';
}

echo json_encode(array(
    'ok' => true,
    'date' => $dateParam,
    'summary' => array(
        'audit_total' => $auditRows,
        'audit_unique_users' => count($auditUsers),
        'audit_by_module' => $auditByModule,
        'audit_by_action' => $auditByAction,
        'security_total' => $securityRows,
        'security_today_count' => $today429,
        'security_seven_day_count' => $sevenDay429,
        'risk_level' => $riskLevel,
    ),
    'top_buckets' => $topBuckets,
    'top_ips' => $topIps,
    'trend_7d' => array_values($trendMap),
    'thresholds' => $thresholds,
    'recommendations' => $recommendations,
));
