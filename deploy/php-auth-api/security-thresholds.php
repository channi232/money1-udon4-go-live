<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('security_thresholds', 20, 60)) exit;
require_role_json(array('admin'));
$username = current_username_from_server();

$defaults = array(
    'today_warn' => 20,
    'today_critical' => 50,
    'week_warn' => 80,
    'week_critical' => 200,
);

$dir = __DIR__ . '/logs';
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$file = $dir . '/security-thresholds.json';
$historyFile = $dir . '/security-thresholds-history.log';

function load_thresholds($file, $defaults) {
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

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $history = array();
    if (file_exists($historyFile)) {
        $lines = @file($historyFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($lines)) {
            for ($i = count($lines) - 1; $i >= 0; $i--) {
                $row = json_decode($lines[$i], true);
                if (!is_array($row)) continue;
                $history[] = $row;
                if (count($history) >= 20) break;
            }
        }
    }
    echo json_encode(array('ok' => true, 'thresholds' => load_thresholds($file, $defaults), 'history' => $history));
    exit;
}

require_request_method_json('POST');
require_same_origin_write_json();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => 'invalid_json'));
    exit;
}

$useDefaults = isset($data['reset_defaults']) && $data['reset_defaults'] === true;
$todayWarn = $useDefaults ? $defaults['today_warn'] : (isset($data['today_warn']) ? (int)$data['today_warn'] : 0);
$todayCritical = $useDefaults ? $defaults['today_critical'] : (isset($data['today_critical']) ? (int)$data['today_critical'] : 0);
$weekWarn = $useDefaults ? $defaults['week_warn'] : (isset($data['week_warn']) ? (int)$data['week_warn'] : 0);
$weekCritical = $useDefaults ? $defaults['week_critical'] : (isset($data['week_critical']) ? (int)$data['week_critical'] : 0);

if ($todayWarn < 1 || $todayCritical < 1 || $weekWarn < 1 || $weekCritical < 1) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => 'threshold_must_be_positive'));
    exit;
}
if ($todayWarn > $todayCritical || $weekWarn > $weekCritical) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => 'warn_must_be_lte_critical'));
    exit;
}

$payload = array(
    'today_warn' => $todayWarn,
    'today_critical' => $todayCritical,
    'week_warn' => $weekWarn,
    'week_critical' => $weekCritical,
);
$ok = @file_put_contents($file, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
if ($ok === false) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'write_failed'));
    exit;
}

@file_put_contents($historyFile, json_encode(array(
    'ts' => date('c'),
    'username' => $username !== '' ? $username : 'unknown',
    'action' => $useDefaults ? 'reset_defaults' : 'update',
    'thresholds' => $payload,
), JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);

echo json_encode(array('ok' => true, 'thresholds' => $payload));
