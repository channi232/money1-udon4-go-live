<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('audit_review', 60, 60)) exit;
require_role_json(array('admin'));

$logsDir = __DIR__ . '/logs';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
$storeFile = $logsDir . '/audit-review.json';

function normalize_review_meta($value) {
    // Backward compatibility: old schema stored only status string.
    if (is_string($value)) {
        $status = trim($value);
        if ($status === 'new' || $status === 'acknowledged' || $status === 'resolved') {
            return array(
                'status' => $status,
                'updatedBy' => '',
                'updatedAt' => '',
                'history' => array(),
            );
        }
        return null;
    }
    if (!is_array($value)) return null;

    $status = isset($value['status']) ? trim((string)$value['status']) : '';
    $updatedBy = isset($value['updatedBy']) ? trim((string)$value['updatedBy']) : '';
    $updatedAt = isset($value['updatedAt']) ? trim((string)$value['updatedAt']) : '';
    $history = array();
    if (isset($value['history']) && is_array($value['history'])) {
        foreach ($value['history'] as $entry) {
            if (!is_array($entry)) continue;
            $fromStatus = isset($entry['from']) ? trim((string)$entry['from']) : '';
            $toStatus = isset($entry['to']) ? trim((string)$entry['to']) : '';
            $by = isset($entry['by']) ? trim((string)$entry['by']) : '';
            $at = isset($entry['at']) ? trim((string)$entry['at']) : '';
            if (($fromStatus !== '' && $fromStatus !== 'new' && $fromStatus !== 'acknowledged' && $fromStatus !== 'resolved')
                || ($toStatus !== '' && $toStatus !== 'new' && $toStatus !== 'acknowledged' && $toStatus !== 'resolved')) {
                continue;
            }
            $history[] = array(
                'from' => $fromStatus,
                'to' => $toStatus,
                'by' => $by,
                'at' => $at,
            );
        }
    }
    if ($status !== 'new' && $status !== 'acknowledged' && $status !== 'resolved') return null;
    return array(
        'status' => $status,
        'updatedBy' => $updatedBy,
        'updatedAt' => $updatedAt,
        'history' => $history,
    );
}

function read_review_store($storeFile) {
    if (!file_exists($storeFile)) return array();
    $raw = @file_get_contents($storeFile);
    if (!is_string($raw) || trim($raw) === '') return array();
    $data = json_decode($raw, true);
    if (!is_array($data)) return array();

    $clean = array();
    foreach ($data as $k => $v) {
        $key = trim((string)$k);
        if ($key === '') continue;
        $meta = normalize_review_meta($v);
        if (!is_array($meta)) continue;
        $clean[$key] = $meta;
    }
    return $clean;
}

function write_review_store($storeFile, $data) {
    $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_string($payload)) return false;
    return @file_put_contents($storeFile, $payload, LOCK_EX) !== false;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string)$_SERVER['REQUEST_METHOD']) : '';
if ($method === 'GET') {
    $map = read_review_store($storeFile);
    echo json_encode(array('ok' => true, 'map' => $map, 'count' => count($map)));
    exit;
}

if ($method !== 'POST') {
    deny_method_not_allowed_json('GET, POST');
}

require_same_origin_write_json();
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    deny_bad_request_json('invalid_json');
}

$key = isset($data['key']) ? trim((string)$data['key']) : '';
$status = isset($data['status']) ? trim((string)$data['status']) : '';
if ($key === '' || strlen($key) > 256) {
    deny_bad_request_json('invalid_key');
}
if ($status !== 'new' && $status !== 'acknowledged' && $status !== 'resolved') {
    deny_bad_request_json('invalid_status');
}

$store = read_review_store($storeFile);
$prevStatus = isset($store[$key]['status']) ? trim((string)$store[$key]['status']) : 'new';
$actor = current_username_from_server();
if ($actor === '') $actor = 'unknown';
$at = date('c');
$history = isset($store[$key]['history']) && is_array($store[$key]['history']) ? $store[$key]['history'] : array();
$history[] = array(
    'from' => $prevStatus,
    'to' => $status,
    'by' => $actor,
    'at' => $at,
);
if (count($history) > 20) {
    $history = array_slice($history, -20);
}

$store[$key] = array(
    'status' => $status,
    'updatedBy' => $actor,
    'updatedAt' => $at,
    'history' => $history,
);
if (!write_review_store($storeFile, $store)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'write_failed'));
    exit;
}

echo json_encode(array(
    'ok' => true,
    'key' => $key,
    'status' => $status,
    'meta' => $store[$key],
));
