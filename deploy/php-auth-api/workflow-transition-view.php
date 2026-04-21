<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('workflow_transition_view', 30, 60)) exit;
require_role_json(array('admin'));

$module = isset($_GET['module']) ? trim((string)$_GET['module']) : '';
$keyFilter = isset($_GET['key']) ? trim((string)$_GET['key']) : '';
$from = isset($_GET['from']) ? trim((string)$_GET['from']) : '';
$to = isset($_GET['to']) ? trim((string)$_GET['to']) : '';
$by = isset($_GET['by']) ? trim((string)$_GET['by']) : '';
$q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
$fromAt = isset($_GET['from_at']) ? trim((string)$_GET['from_at']) : '';
$toAt = isset($_GET['to_at']) ? trim((string)$_GET['to_at']) : '';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1) $limit = 1;
if ($limit > 1000) $limit = 1000;

function wtv_valid_status($value) {
    return $value === 'new' || $value === 'in_review' || $value === 'approved' || $value === 'rejected';
}

if ($module !== '' && $module !== 'money' && $module !== 'slip' && $module !== 'tax') {
    deny_bad_request_json('invalid_module');
}
if ($from !== '' && !wtv_valid_status($from)) deny_bad_request_json('invalid_from_status');
if ($to !== '' && !wtv_valid_status($to)) deny_bad_request_json('invalid_to_status');

$fromAtTs = null;
$toAtTs = null;
if ($fromAt !== '') {
    $fromAtTs = strtotime($fromAt);
    if ($fromAtTs === false) deny_bad_request_json('invalid_from_at');
}
if ($toAt !== '') {
    $toAtTs = strtotime($toAt);
    if ($toAtTs === false) deny_bad_request_json('invalid_to_at');
}

$logFile = __DIR__ . '/logs/workflow-transition.log';
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

    $rowModule = isset($row['module']) ? trim((string)$row['module']) : '';
    $rowKey = isset($row['key']) ? trim((string)$row['key']) : '';
    $rowFrom = isset($row['from']) ? trim((string)$row['from']) : '';
    $rowTo = isset($row['to']) ? trim((string)$row['to']) : '';
    $rowBy = isset($row['by']) ? trim((string)$row['by']) : '';
    $rowReason = isset($row['reason']) ? trim((string)$row['reason']) : '';
    $rowTransitionId = isset($row['transitionId']) ? trim((string)$row['transitionId']) : '';
    $rowAt = isset($row['at']) ? trim((string)$row['at']) : '';

    if ($module !== '' && $rowModule !== $module) continue;
    if ($keyFilter !== '' && stripos($rowKey, $keyFilter) === false) continue;
    if ($from !== '' && $rowFrom !== $from) continue;
    if ($to !== '' && $rowTo !== $to) continue;
    if ($by !== '' && stripos($rowBy, $by) === false) continue;
    if ($q !== '') {
        $hay = strtolower($rowModule . ' ' . $rowKey . ' ' . $rowFrom . ' ' . $rowTo . ' ' . $rowBy . ' ' . $rowReason . ' ' . $rowTransitionId . ' ' . $rowAt);
        if (strpos($hay, strtolower($q)) === false) continue;
    }

    if ($fromAtTs !== null || $toAtTs !== null) {
        $atTs = strtotime($rowAt);
        if ($atTs === false) continue;
        if ($fromAtTs !== null && $atTs < $fromAtTs) continue;
        if ($toAtTs !== null && $atTs > $toAtTs) continue;
    }

    $rows[] = $row;
    if (count($rows) >= $limit) break;
}

echo json_encode(array(
    'ok' => true,
    'count' => count($rows),
    'rows' => $rows,
));
