<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('POST');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('audit_log', 60, 60)) exit;
require_role_json(array('admin', 'finance', 'personnel'));
require_same_origin_write_json();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => 'invalid_json'));
    exit;
}

$module = isset($data['module']) ? trim((string)$data['module']) : '';
$action = isset($data['action']) ? trim((string)$data['action']) : '';
$count = isset($data['count']) ? (int)$data['count'] : 0;

$allowedModules = array('money', 'slip', 'tax');
$allowedActions = array('export_csv', 'print', 'workflow_transition');
if (!in_array($module, $allowedModules, true) || !in_array($action, $allowedActions, true)) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => 'invalid_payload'));
    exit;
}

$username = current_username_from_server();
if ($username === '') $username = 'unknown';

$ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '';
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string)$_SERVER['HTTP_USER_AGENT'] : '';
$ts = date('c');

$line = json_encode(array(
    'ts' => $ts,
    'username' => $username,
    'module' => $module,
    'action' => $action,
    'count' => $count,
    'ip' => $ip,
    'ua' => $ua,
), JSON_UNESCAPED_UNICODE);

$logsDir = __DIR__ . '/logs';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
$logFile = $logsDir . '/audit.log';
$ok = @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
if ($ok === false) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'write_failed'));
    exit;
}

echo json_encode(array('ok' => true));
