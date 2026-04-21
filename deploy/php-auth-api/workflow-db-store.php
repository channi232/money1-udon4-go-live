<?php
/**
 * เก็บ workflow overlay ในฐานข้อมูลหลัก (db-config.php) แทนการพึ่งไฟล์อย่างเดียว
 * ถ้าเชื่อมต่อ/สร้างตาราง/เขียนไม่ได้ จะคืน null ให้ workflow-state.php ใช้ JSON เดิม
 */

define('WF_DB_TABLE', 'platform_workflow_state');

function wf_db_config_path() {
    return __DIR__ . '/db-config.php';
}

function wf_db_connect() {
    $path = wf_db_config_path();
    if (!file_exists($path)) return null;
    $db = include $path;
    if (!is_array($db) || !isset($db['host'], $db['user'], $db['pass'], $db['name'])) return null;
    $conn = @new mysqli($db['host'], $db['user'], $db['pass'], $db['name']);
    if ($conn->connect_errno) {
        if (is_object($conn)) $conn->close();
        return null;
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

function wf_db_ensure_table($conn) {
    $t = WF_DB_TABLE;
    $sql = "CREATE TABLE IF NOT EXISTS `" . $conn->real_escape_string($t) . "` (
        `item_key` VARCHAR(300) NOT NULL,
        `module` VARCHAR(16) NOT NULL DEFAULT '',
        `status` VARCHAR(32) NOT NULL DEFAULT 'new',
        `updated_by` VARCHAR(128) NOT NULL DEFAULT '',
        `updated_at` DATETIME NULL,
        `history_json` MEDIUMTEXT NULL,
        PRIMARY KEY (`item_key`),
        KEY `idx_module` (`module`),
        KEY `idx_updated_at` (`updated_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    return @$conn->query($sql) === true;
}

function wf_db_valid_status($s) {
    return $s === 'new' || $s === 'in_review' || $s === 'approved' || $s === 'rejected';
}

function wf_db_row_to_meta($row) {
    if (!is_array($row)) return null;
    $status = isset($row['status']) ? trim((string)$row['status']) : '';
    if (!wf_db_valid_status($status)) return null;
    $history = array();
    if (isset($row['history_json']) && is_string($row['history_json']) && trim($row['history_json']) !== '') {
        $decoded = json_decode($row['history_json'], true);
        if (is_array($decoded)) {
            foreach ($decoded as $entry) {
                if (!is_array($entry)) continue;
                $fromStatus = isset($entry['from']) ? trim((string)$entry['from']) : '';
                $toStatus = isset($entry['to']) ? trim((string)$entry['to']) : '';
                $by = isset($entry['by']) ? trim((string)$entry['by']) : '';
                $at = isset($entry['at']) ? trim((string)$entry['at']) : '';
                $reason = isset($entry['reason']) ? trim((string)$entry['reason']) : '';
                $tid = isset($entry['transitionId']) ? trim((string)$entry['transitionId']) : '';
                if (($fromStatus !== '' && !wf_db_valid_status($fromStatus))
                    || ($toStatus !== '' && !wf_db_valid_status($toStatus))) {
                    continue;
                }
                $history[] = array(
                    'from' => $fromStatus,
                    'to' => $toStatus,
                    'by' => $by,
                    'at' => $at,
                    'reason' => $reason,
                    'transitionId' => $tid,
                );
            }
        }
    }
    return array(
        'status' => $status,
        'updatedBy' => isset($row['updated_by']) ? trim((string)$row['updated_by']) : '',
        'updatedAt' => isset($row['updated_at_iso']) ? trim((string)$row['updated_at_iso']) : '',
        'history' => $history,
    );
}

function wf_db_read_map($conn) {
    $t = WF_DB_TABLE;
    $sql = "SELECT `item_key`, `module`, `status`, `updated_by`, `updated_at`, `history_json`
            FROM `" . $conn->real_escape_string($t) . "`";
    $res = @$conn->query($sql);
    if (!$res) return null;
    $out = array();
    while ($row = $res->fetch_assoc()) {
        $key = isset($row['item_key']) ? trim((string)$row['item_key']) : '';
        if ($key === '') continue;
        if (isset($row['updated_at']) && $row['updated_at'] !== null && $row['updated_at'] !== '') {
            $ts = strtotime((string)$row['updated_at']);
            $row['updated_at_iso'] = $ts !== false ? date('c', $ts) : trim((string)$row['updated_at']);
        } else {
            $row['updated_at_iso'] = '';
        }
        $meta = wf_db_row_to_meta($row);
        if (is_array($meta)) $out[$key] = $meta;
    }
    $res->free();
    return $out;
}

function wf_db_count_rows($conn) {
    $t = WF_DB_TABLE;
    $res = @$conn->query("SELECT COUNT(*) AS c FROM `" . $conn->real_escape_string($t) . "`");
    if (!$res) return -1;
    $row = $res->fetch_assoc();
    $res->free();
    return isset($row['c']) ? (int)$row['c'] : 0;
}

function wf_db_upsert($conn, $key, $module, $meta) {
    if (!is_array($meta)) return false;
    $status = isset($meta['status']) ? trim((string)$meta['status']) : '';
    if (!wf_db_valid_status($status)) return false;
    $by = isset($meta['updatedBy']) ? trim((string)$meta['updatedBy']) : '';
    $atIso = isset($meta['updatedAt']) ? trim((string)$meta['updatedAt']) : '';
    $atSql = null;
    if ($atIso !== '') {
        $ts = strtotime($atIso);
        if ($ts !== false) {
            $atSql = date('Y-m-d H:i:s', $ts);
        }
    }
    if ($atSql === null) $atSql = date('Y-m-d H:i:s');

    $history = isset($meta['history']) && is_array($meta['history']) ? $meta['history'] : array();
    $hj = json_encode($history, JSON_UNESCAPED_UNICODE);
    if (!is_string($hj)) return false;

    $t = WF_DB_TABLE;
    $stmt = $conn->prepare(
        "INSERT INTO `" . $t . "` (`item_key`, `module`, `status`, `updated_by`, `updated_at`, `history_json`)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE `module` = VALUES(`module`), `status` = VALUES(`status`),
           `updated_by` = VALUES(`updated_by`), `updated_at` = VALUES(`updated_at`), `history_json` = VALUES(`history_json`)"
    );
    if (!$stmt) return false;
    $stmt->bind_param('ssssss', $key, $module, $status, $by, $atSql, $hj);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok === true;
}

function wf_db_try_init() {
    $conn = wf_db_connect();
    if ($conn === null) return null;
    if (!wf_db_ensure_table($conn)) {
        $conn->close();
        return null;
    }
    return $conn;
}

function wf_merge_maps($fileMap, $dbMap) {
    if (!is_array($fileMap)) $fileMap = array();
    if (!is_array($dbMap)) $dbMap = array();
    // DB ทับคีย์ซ้ำ; คีย์ที่มีแค่ในไฟล์ยังแสดง (ช่วงย้ายระบบเก่า)
    return array_merge($fileMap, $dbMap);
}
