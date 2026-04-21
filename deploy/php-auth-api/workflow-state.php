<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('workflow_state', 60, 60)) exit;
require_role_json(array('admin', 'finance', 'personnel'));
require_once __DIR__ . '/workflow-db-store.php';

$logsDir = __DIR__ . '/logs';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
$storeFile = $logsDir . '/workflow-state.json';
$transitionLogFile = $logsDir . '/workflow-transition.log';

function ws_normalize_meta($value) {
    if (is_string($value)) {
        $status = trim($value);
        if ($status === 'new' || $status === 'in_review' || $status === 'approved' || $status === 'rejected') {
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
    if ($status !== 'new' && $status !== 'in_review' && $status !== 'approved' && $status !== 'rejected') return null;
    $history = array();
    if (isset($value['history']) && is_array($value['history'])) {
        foreach ($value['history'] as $entry) {
            if (!is_array($entry)) continue;
            $fromStatus = isset($entry['from']) ? trim((string)$entry['from']) : '';
            $toStatus = isset($entry['to']) ? trim((string)$entry['to']) : '';
            $by = isset($entry['by']) ? trim((string)$entry['by']) : '';
            $at = isset($entry['at']) ? trim((string)$entry['at']) : '';
            if (($fromStatus !== '' && $fromStatus !== 'new' && $fromStatus !== 'in_review' && $fromStatus !== 'approved' && $fromStatus !== 'rejected')
                || ($toStatus !== '' && $toStatus !== 'new' && $toStatus !== 'in_review' && $toStatus !== 'approved' && $toStatus !== 'rejected')) {
                continue;
            }
            $history[] = array(
                'from' => $fromStatus,
                'to' => $toStatus,
                'by' => $by,
                'at' => $at,
                'reason' => isset($entry['reason']) ? trim((string)$entry['reason']) : '',
                'transitionId' => isset($entry['transitionId']) ? trim((string)$entry['transitionId']) : '',
            );
        }
    }
    return array(
        'status' => $status,
        'updatedBy' => isset($value['updatedBy']) ? trim((string)$value['updatedBy']) : '',
        'updatedAt' => isset($value['updatedAt']) ? trim((string)$value['updatedAt']) : '',
        'history' => $history,
    );
}

function ws_read_store($storeFile) {
    if (!file_exists($storeFile)) return array();
    $raw = @file_get_contents($storeFile);
    if (!is_string($raw) || trim($raw) === '') return array();
    $data = json_decode($raw, true);
    if (!is_array($data)) return array();
    $out = array();
    foreach ($data as $k => $v) {
        $key = trim((string)$k);
        if ($key === '') continue;
        $meta = ws_normalize_meta($v);
        if (!is_array($meta)) continue;
        $out[$key] = $meta;
    }
    return $out;
}

function ws_write_store($storeFile, $data) {
    $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_string($payload)) return false;
    return @file_put_contents($storeFile, $payload, LOCK_EX) !== false;
}

function ws_module_from_key($key) {
    $parts = explode(':', (string)$key, 2);
    if (count($parts) < 2) return '';
    $module = trim((string)$parts[0]);
    if ($module !== 'money' && $module !== 'slip' && $module !== 'tax') return '';
    return $module;
}

function ws_generate_transition_id() {
    $rand = '';
    if (function_exists('random_bytes')) {
        try {
            $rand = bin2hex(random_bytes(6));
        } catch (Exception $e) {
            $rand = '';
        }
    }
    if ($rand === '') {
        $rand = substr(md5(uniqid('', true)), 0, 12);
    }
    return 'wf_' . gmdate('YmdHis') . '_' . $rand;
}

function ws_append_transition_log($filePath, $row) {
    $payload = json_encode($row, JSON_UNESCAPED_UNICODE);
    if (!is_string($payload)) return false;
    return @file_put_contents($filePath, $payload . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
}

function ws_role_can_operate($module, $role) {
    if ($role === 'admin') return true;
    if ($module === 'money') return $role === 'finance';
    if ($module === 'slip') return $role === 'finance' || $role === 'personnel';
    if ($module === 'tax') return $role === 'personnel';
    return false;
}

/**
 * โหลด map แบบรวม: ฐานข้อมูล (db-config) เป็นหลักเมื่อใช้ได้, ไฟล์ JSON เป็นสำรอง/ย้ายข้อมูลเก่า
 * @return array{map: array, persistence: string}
 */
function ws_load_merged_map($storeFile) {
    $fileMap = ws_read_store($storeFile);
    $conn = wf_db_try_init();
    if ($conn === null) {
        return array('map' => $fileMap, 'persistence' => 'file');
    }
    $dbMap = wf_db_read_map($conn);
    if ($dbMap === null) {
        $conn->close();
        return array('map' => $fileMap, 'persistence' => 'file');
    }
    $cnt = wf_db_count_rows($conn);
    if ($cnt === 0 && count($fileMap) > 0) {
        foreach ($fileMap as $k => $v) {
            $key = trim((string)$k);
            if ($key === '') continue;
            $mod = ws_module_from_key($key);
            if ($mod === '') continue;
            $meta = ws_normalize_meta($v);
            if (!is_array($meta)) continue;
            wf_db_upsert($conn, $key, $mod, $meta);
        }
        $dbMap = wf_db_read_map($conn);
        if ($dbMap === null) {
            $dbMap = array();
        }
    }
    $conn->close();
    return array('map' => wf_merge_maps($fileMap, $dbMap), 'persistence' => 'database');
}

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string)$_SERVER['REQUEST_METHOD']) : '';
if ($method === 'GET') {
    $loaded = ws_load_merged_map($storeFile);
    $map = isset($loaded['map']) && is_array($loaded['map']) ? $loaded['map'] : array();
    $persistence = isset($loaded['persistence']) ? (string)$loaded['persistence'] : 'file';
    echo json_encode(array('ok' => true, 'map' => $map, 'count' => count($map), 'persistence' => $persistence));
    exit;
}
if ($method !== 'POST') {
    deny_method_not_allowed_json('GET, POST');
}

require_same_origin_write_json();
$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) deny_bad_request_json('invalid_json');

$key = isset($data['key']) ? trim((string)$data['key']) : '';
$status = isset($data['status']) ? trim((string)$data['status']) : '';
$reason = isset($data['reason']) ? trim((string)$data['reason']) : '';
if ($key === '' || strlen($key) > 300) deny_bad_request_json('invalid_key');
if ($status !== 'new' && $status !== 'in_review' && $status !== 'approved' && $status !== 'rejected') {
    deny_bad_request_json('invalid_status');
}
if (strlen($reason) > 500) deny_bad_request_json('reason_too_long');
if ($status === 'rejected' && $reason === '') deny_bad_request_json('reason_required_for_reject');

$module = ws_module_from_key($key);
if ($module === '') deny_bad_request_json('invalid_module_key');
$role = current_role_from_server();
if (!ws_role_can_operate($module, $role)) deny_forbidden_json('role_not_allowed_for_module');

$loaded = ws_load_merged_map($storeFile);
$store = isset($loaded['map']) && is_array($loaded['map']) ? $loaded['map'] : array();
$persistence = isset($loaded['persistence']) ? (string)$loaded['persistence'] : 'file';

$prevStatus = isset($store[$key]['status']) ? trim((string)$store[$key]['status']) : 'new';
$actor = current_username_from_server();
if ($actor === '') $actor = 'unknown';
$at = date('c');
$transitionId = ws_generate_transition_id();
$history = isset($store[$key]['history']) && is_array($store[$key]['history']) ? $store[$key]['history'] : array();
$history[] = array(
    'from' => $prevStatus,
    'to' => $status,
    'by' => $actor,
    'at' => $at,
    'reason' => $reason,
    'transitionId' => $transitionId,
);
if (count($history) > 20) {
    $history = array_slice($history, -20);
}
$newMeta = array(
    'status' => $status,
    'updatedBy' => $actor,
    'updatedAt' => $at,
    'history' => $history,
);

$dbOk = false;
if ($persistence === 'database') {
    $conn = wf_db_try_init();
    if ($conn !== null) {
        if (wf_db_upsert($conn, $key, $module, $newMeta)) {
            $dbOk = true;
        }
        $conn->close();
    }
    if (!$dbOk) {
        http_response_code(500);
        echo json_encode(array('ok' => false, 'message' => 'database_write_failed'));
        exit;
    }
} else {
    $fileStore = ws_read_store($storeFile);
    $fileStore[$key] = $newMeta;
    if (!ws_write_store($storeFile, $fileStore)) {
        http_response_code(500);
        echo json_encode(array('ok' => false, 'message' => 'write_failed'));
        exit;
    }
}

$transitionRow = array(
    'transitionId' => $transitionId,
    'key' => $key,
    'module' => $module,
    'from' => $prevStatus,
    'to' => $status,
    'reason' => $reason,
    'by' => $actor,
    'at' => $at,
);
if (!ws_append_transition_log($transitionLogFile, $transitionRow)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'message' => 'transition_log_failed'));
    exit;
}

$writtenPersistence = $persistence === 'database' ? 'database' : 'file';
echo json_encode(array('ok' => true, 'key' => $key, 'transitionId' => $transitionId, 'meta' => $newMeta, 'persistence' => $writtenPersistence));
