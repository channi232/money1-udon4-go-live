<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('tax_summary', 120, 60)) exit;
require_role_json(array('admin', 'finance', 'personnel'));
require_once __DIR__ . '/personal-lookup.php';
@set_time_limit(20);
if (function_exists('mysqli_report')) {
    mysqli_report(MYSQLI_REPORT_OFF);
}
init_api_trace('tax_summary');

$debugRequested = isset($_GET['debug']) && $_GET['debug'] === '1';
$debug = $debugRequested && current_role_from_server() === 'admin';
$preflight = isset($_GET['preflight']) && $_GET['preflight'] === '1';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1) $limit = 1;
if ($limit > 200) $limit = 200;

function mask_thai_id($id) {
    $s = preg_replace('/[^0-9]/', '', (string)$id);
    if (strlen($s) < 6) return (string)$id;
    return substr($s, 0, 1) . '-' . substr($s, 1, 4) . '-xxxxx-' . substr($s, -2, 1) . '-' . substr($s, -1);
}

function first_col($columns, $candidates) {
    foreach ($candidates as $c) {
        foreach ($columns as $real) {
            if (strtolower($real) === strtolower($c)) return $real;
        }
    }
    return null;
}

$fallbackRows = array(
    array('citizenIdMasked' => '3-4120-xxxxx-12-3', 'fullName' => 'สมชาย ใจดี', 'year' => '2568', 'status' => 'พร้อมดาวน์โหลด'),
    array('citizenIdMasked' => '1-4407-xxxxx-81-9', 'fullName' => 'อรทัย เข็มทอง', 'year' => '2568', 'status' => 'พร้อมดาวน์โหลด'),
    array('citizenIdMasked' => '3-4111-xxxxx-08-4', 'fullName' => 'วรพงษ์ ศรีสุข', 'year' => '2567', 'status' => 'อยู่ระหว่างจัดทำ'),
);

$cfgPath = __DIR__ . '/epay-db-config.php';
if (!file_exists($cfgPath)) {
    respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'epay-db-config.php not found', 'error_code' => 'TAX_DB_CONFIG_NOT_FOUND'), $debug, array('stage' => 'load_db_config'));
}
$db = include $cfgPath;
if (!is_array($db) || !isset($db['host']) || !isset($db['user']) || !isset($db['pass']) || !isset($db['name'])) {
    respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'invalid epay-db-config.php', 'error_code' => 'TAX_DB_CONFIG_INVALID'), $debug, array('stage' => 'validate_db_config'));
}

$conn = @mysqli_init();
if ($conn instanceof mysqli) {
    @mysqli_options($conn, MYSQLI_OPT_CONNECT_TIMEOUT, 8);
    if (defined('MYSQLI_OPT_READ_TIMEOUT')) {
        @mysqli_options($conn, MYSQLI_OPT_READ_TIMEOUT, 12);
    }
    @mysqli_real_connect($conn, $db['host'], $db['user'], $db['pass'], $db['name']);
} else {
    $conn = @new mysqli($db['host'], $db['user'], $db['pass'], $db['name']);
}
if ($conn->connect_errno) {
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'database unavailable', 'error_code' => 'TAX_DB_UNAVAILABLE');
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'connect',
            'connect_errno' => $conn->connect_errno,
            'connect_error' => $conn->connect_error,
            'db' => $db['name'],
        );
    }
    respond_json_with_trace($payload, $debug, array('stage' => 'connect_main_db'));
}
$conn->set_charset('utf8');

$tables = array();
$res = @$conn->query("SHOW TABLES");
if ($res) {
    while ($t = $res->fetch_array(MYSQLI_NUM)) $tables[] = $t[0];
    $res->free();
}

$schemaOverride = get_module_schema_override('tax');
$strictSchema = is_array($schemaOverride) && !empty($schemaOverride['strict']);
$overrideCols = (is_array($schemaOverride) && isset($schemaOverride['columns']) && is_array($schemaOverride['columns'])) ? $schemaOverride['columns'] : array();
$tableCandidates = array('money_em_sum', 'money_em', 'tax', 'tax_doc', 'certificate');
$foundTable = null;
if (is_array($schemaOverride) && isset($schemaOverride['table'])) {
    $wantedTable = trim((string)$schemaOverride['table']);
    if ($wantedTable !== '') {
        foreach ($tables as $real) {
            if (strtolower($wantedTable) === strtolower($real)) { $foundTable = $real; break; }
        }
        if ($foundTable === null && $strictSchema) {
            $conn->close();
            respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'schema override table not found', 'error_code' => 'TAX_SCHEMA_TABLE_NOT_FOUND'), $debug, array('stage' => 'resolve_table'));
        }
    }
}
foreach ($tableCandidates as $cand) {
    if ($foundTable !== null) break;
    foreach ($tables as $real) {
        if (strtolower($cand) === strtolower($real)) { $foundTable = $real; break 2; }
    }
}
if ($foundTable === null && count($tables) > 0 && !$strictSchema) {
    $foundTable = $tables[0];
}

if ($foundTable === null) {
    $conn->close();
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'no table found', 'error_code' => 'TAX_NO_TABLE_FOUND');
    if ($debug) $payload['debug'] = array('stage' => 'table_detect', 'tables' => $tables);
    respond_json_with_trace($payload, $debug, array('stage' => 'detect_tables'));
}

$cols = array();
$cRes = @$conn->query("SHOW COLUMNS FROM `".$conn->real_escape_string($foundTable)."`");
if ($cRes) {
    while ($c = $cRes->fetch_assoc()) $cols[] = $c['Field'];
    $cRes->free();
}

$idCol = isset($overrideCols['id']) ? first_col($cols, array((string)$overrideCols['id'])) : null;
if ($idCol === null || !$strictSchema) $idCol = first_col($cols, array('ID_per','id_per','citizen_id','tax_id','pid'));
$nameCol = isset($overrideCols['name']) ? first_col($cols, array((string)$overrideCols['name'])) : null;
if ($nameCol === null || !$strictSchema) $nameCol = first_col($cols, array('Name','name','full_name','fullname'));
$yearCol = isset($overrideCols['year']) ? first_col($cols, array((string)$overrideCols['year'])) : null;
if ($yearCol === null || !$strictSchema) $yearCol = first_col($cols, array('Year','year','tax_year','fiscal_year'));
$statusCol = isset($overrideCols['status']) ? first_col($cols, array((string)$overrideCols['status'])) : null;
if ($statusCol === null || !$strictSchema) {
    $statusCol = first_col($cols, array('status','doc_status','state','tax_status','certificate_status','download_status'));
}

if ($idCol === null || $yearCol === null) {
    $conn->close();
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'query failed: unable to map required columns', 'error_code' => 'TAX_REQUIRED_COLUMNS_UNMAPPED');
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'column_detect',
            'table' => $foundTable,
            'columns' => $cols,
            'mapped' => array('id' => $idCol, 'name' => $nameCol, 'year' => $yearCol),
        );
    }
    respond_json_with_trace($payload, $debug, array('stage' => 'map_columns'));
}

function tax_resolve_status_display($raw) {
    $s = trim((string)$raw);
    if ($s === '') return 'พร้อมดาวน์โหลด';
    if (preg_match('/พร้อมดาวน์โหลด|ready|complete/i', $s)) return 'พร้อมดาวน์โหลด';
    if (preg_match('/อยู่ระหว่าง|จัดทำ|process|pending|wait/i', $s)) return 'อยู่ระหว่างจัดทำ';
    return $s;
}

$nameSelect = $nameCol !== null ? "`".$nameCol."`" : "`".$idCol."`";
$statusSelect = $statusCol !== null ? ", `".$statusCol."` AS statusv" : '';
$sql = "SELECT `".$idCol."` AS idv, ".$nameSelect." AS fullName, `".$yearCol."` AS yearv".$statusSelect."
FROM `".$foundTable."`
ORDER BY `".$yearCol."` DESC
LIMIT ".$limit;

$r = @$conn->query($sql);
if (!$r) {
    $conn->close();
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'query failed: update SQL in tax-summary.php', 'error_code' => 'TAX_QUERY_FAILED');
    if ($debug) {
        $payload['debug'] = array('stage' => 'query', 'table' => $foundTable, 'sql' => $sql, 'mysql_error' => $conn->error);
    }
    respond_json_with_trace($payload, $debug, array('stage' => 'query_rows'));
}

$rows = array();
$rawIds = array();
while ($row = $r->fetch_assoc()) {
    $idv = isset($row['idv']) ? (string)$row['idv'] : '';
    $name = isset($row['fullName']) ? trim((string)$row['fullName']) : '';
    $year = isset($row['yearv']) ? (string)$row['yearv'] : '';
    if ($name === '') $name = $idv;
    $rawSt = ($statusCol !== null && isset($row['statusv'])) ? (string)$row['statusv'] : '';
    $rows[] = array(
        'citizenIdMasked' => mask_thai_id($idv),
        'fullName' => $name,
        'year' => $year,
        'status' => tax_resolve_status_display($rawSt),
    );
    $rawIds[] = $idv;
}
$r->free();

if (!$preflight) {
    $personalDbg = array();
    $ctx = pl_personal_connect($personalDbg);
    if (is_array($ctx)) {
        $pconn = $ctx['conn'];
        $pdb = $ctx['cfg'];
        try {
            $personTable = pl_pick_person_table($pconn, $pdb, $debug, $personalDbg);
            if ($personTable !== null) {
                $nameMap = pl_build_name_map($pconn, $pdb, $personTable, $rawIds, $debug, $personalDbg);
                foreach ($rows as $i => $rr) {
                    $idv = isset($rawIds[$i]) ? (string)$rawIds[$i] : '';
                    if ($idv === '') continue;
                    $curr = isset($rr['fullName']) ? trim((string)$rr['fullName']) : '';
                    if (pl_looks_like_raw_id_name($curr, $idv)) {
                        if (isset($nameMap[$idv]) && trim((string)$nameMap[$idv]) !== '') {
                            $rows[$i]['fullName'] = trim((string)$nameMap[$idv]);
                        }
                    }
                }
            }
        } finally {
            $pconn->close();
        }
    }
    if ($debug) {
        $GLOBALS['tax_personal_debug'] = $personalDbg;
    }
}

$totalRows = null;
$readyCount = null;
$processingCount = null;
if ($preflight) {
    $cntRes = @$conn->query("SELECT COUNT(*) AS c FROM `".$conn->real_escape_string($foundTable)."`");
    if ($cntRes) {
        $cntRow = $cntRes->fetch_assoc();
        if (is_array($cntRow) && isset($cntRow['c'])) {
            $totalRows = (int)$cntRow['c'];
        }
        $cntRes->free();
    }

    if ($statusCol !== null) {
        $escTable = $conn->real_escape_string($foundTable);
        $escStatus = $conn->real_escape_string($statusCol);

        $readySql = "SELECT COUNT(*) AS c FROM `".$escTable."` WHERE `".$escStatus."` LIKE '%พร้อมดาวน์โหลด%'";
        $procSql = "SELECT COUNT(*) AS c FROM `".$escTable."` WHERE `".$escStatus."` LIKE '%อยู่ระหว่างจัดทำ%'";

        $r1 = @$conn->query($readySql);
        if ($r1) {
            $row1 = $r1->fetch_assoc();
            if (is_array($row1) && isset($row1['c'])) $readyCount = (int)$row1['c'];
            $r1->free();
        }
        $r2 = @$conn->query($procSql);
        if ($r2) {
            $row2 = $r2->fetch_assoc();
            if (is_array($row2) && isset($row2['c'])) $processingCount = (int)$row2['c'];
            $r2->free();
        }
    }
}

$conn->close();

$payload = array(
    'ok' => true,
    'source' => 'database',
    'table' => $foundTable,
    'rows' => $rows,
    'meta' => array(
        'status_mapping' => array(
            'source' => $statusCol !== null ? 'database_column' : 'default_ready',
            'column' => $statusCol,
        ),
    ),
);
if ($preflight) {
    $payload['metrics'] = array(
        'total_rows' => $totalRows,
        'ready_count' => $readyCount,
        'processing_count' => $processingCount,
        'limit' => $limit,
    );
}
if ($debug && isset($GLOBALS['tax_personal_debug']) && is_array($GLOBALS['tax_personal_debug'])) {
    if (!isset($payload['debug']) || !is_array($payload['debug'])) {
        $payload['debug'] = array();
    }
    $payload['debug']['personal_lookup'] = $GLOBALS['tax_personal_debug'];
}
respond_json_with_trace($payload, $debug, array('stage' => 'ok'));
