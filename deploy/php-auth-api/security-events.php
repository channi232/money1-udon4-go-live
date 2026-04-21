<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('security_events', 20, 60)) exit;
require_role_json(array('admin'));

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
if ($limit < 1) $limit = 1;
if ($limit > 500) $limit = 500;

$bucket = isset($_GET['bucket']) ? trim((string)$_GET['bucket']) : '';
$ipFilter = isset($_GET['ip']) ? trim((string)$_GET['ip']) : '';

$logFile = __DIR__ . '/logs/security.log';
if (!file_exists($logFile)) {
    echo json_encode(array('ok' => true, 'count' => 0, 'rows' => array()));
    exit;
}

$lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (!is_array($lines)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'read_failed'));
    exit;
}

$rows = array();
$todayCount = 0;
$sevenDayCount = 0;
$bucketAgg = array();
$ipAgg = array();
$now = time();
$todayStart = strtotime(date('Y-m-d 00:00:00'));
$sevenDayStart = $now - (7 * 24 * 60 * 60);
for ($i = count($lines) - 1; $i >= 0; $i--) {
    $row = json_decode($lines[$i], true);
    if (!is_array($row)) continue;
    $ts = isset($row['ts']) ? strtotime((string)$row['ts']) : false;
    if ($ts !== false) {
        if ($ts >= $todayStart) $todayCount++;
        if ($ts >= $sevenDayStart) $sevenDayCount++;
    }
    $b = isset($row['bucket']) ? (string)$row['bucket'] : 'unknown';
    $ipv = isset($row['ip']) ? (string)$row['ip'] : 'unknown';
    if (!isset($bucketAgg[$b])) $bucketAgg[$b] = 0;
    if (!isset($ipAgg[$ipv])) $ipAgg[$ipv] = 0;
    $bucketAgg[$b]++;
    $ipAgg[$ipv]++;

    if ($bucket !== '' && isset($row['bucket']) && $row['bucket'] !== $bucket) continue;
    if ($ipFilter !== '' && isset($row['ip']) && stripos((string)$row['ip'], $ipFilter) === false) continue;
    $rows[] = $row;
    if (count($rows) >= $limit) break;
}

arsort($bucketAgg);
arsort($ipAgg);
$topBuckets = array();
$topIps = array();
foreach ($bucketAgg as $k => $v) {
    $topBuckets[] = array('bucket' => $k, 'count' => $v);
    if (count($topBuckets) >= 5) break;
}
foreach ($ipAgg as $k => $v) {
    $topIps[] = array('ip' => $k, 'count' => $v);
    if (count($topIps) >= 5) break;
}

echo json_encode(array(
    'ok' => true,
    'count' => count($rows),
    'rows' => $rows,
    'summary' => array(
        'today_count' => $todayCount,
        'seven_day_count' => $sevenDayCount,
        'top_buckets' => $topBuckets,
        'top_ips' => $topIps,
    ),
));
