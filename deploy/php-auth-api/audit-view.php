<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('audit_view', 30, 60)) exit;
require_role_json(array('admin'));

$module = isset($_GET['module']) ? trim((string)$_GET['module']) : '';
$action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';
$userFilter = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
if ($limit < 1) $limit = 1;
if ($limit > 500) $limit = 500;

$logFile = __DIR__ . '/logs/audit.log';
if (!file_exists($logFile)) {
    echo json_encode(array('ok' => true, 'rows' => array(), 'count' => 0));
    exit;
}

$lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (!is_array($lines)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'read_failed'));
    exit;
}

$rows = array();
for ($i = count($lines) - 1; $i >= 0; $i--) {
    $row = json_decode($lines[$i], true);
    if (!is_array($row)) continue;
    if ($module !== '' && isset($row['module']) && $row['module'] !== $module) continue;
    if ($action !== '' && isset($row['action']) && $row['action'] !== $action) continue;
    if ($userFilter !== '' && isset($row['username']) && stripos((string)$row['username'], $userFilter) === false) continue;
    $rows[] = $row;
    if (count($rows) >= $limit) break;
}

echo json_encode(array(
    'ok' => true,
    'count' => count($rows),
    'rows' => $rows,
));
