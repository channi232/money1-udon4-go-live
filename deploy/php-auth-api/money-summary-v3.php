<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('money_summary_v3', 120, 60)) exit;
require_role_json(array('admin', 'finance', 'personnel'));
require_once __DIR__ . '/personal-lookup.php';
@set_time_limit(20);
if (function_exists('mysqli_report')) {
    mysqli_report(MYSQLI_REPORT_OFF);
}
init_api_trace('money_summary_v3');

$debugRequested = isset($_GET['debug']) && $_GET['debug'] === '1';
$debug = $debugRequested && current_role_from_server() === 'admin';
$preflight = isset($_GET['preflight']) && $_GET['preflight'] === '1';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1) $limit = 1;
if ($limit > 200) $limit = 200;
$apiVersion = 'money-summary-v3-direct';
$fileMtime = @filemtime(__FILE__);

function first_col_v3($columns, $candidates) {
    foreach ($candidates as $c) {
        foreach ($columns as $real) {
            if (strtolower($real) === strtolower($c)) return $real;
        }
    }
    return null;
}

$fallbackRows = array(
    array('id' => 'MN-2026-0410-001', 'school' => 'รร.บ้านหนองบัว', 'amount' => 125000, 'date' => '10/04/2026', 'status' => 'อนุมัติแล้ว'),
    array('id' => 'MN-2026-0410-002', 'school' => 'รร.บ้านเชียงพิณ', 'amount' => 98500, 'date' => '10/04/2026', 'status' => 'รอตรวจสอบ'),
);

$cfgPath = __DIR__ . '/db-config.php';
if (!file_exists($cfgPath)) {
    respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'db-config.php not found', 'error_code' => 'MONEY_DB_CONFIG_NOT_FOUND', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime), $debug, array('stage' => 'load_db_config'));
}
$db = include $cfgPath;
if (!is_array($db) || !isset($db['host']) || !isset($db['user']) || !isset($db['pass']) || !isset($db['name'])) {
    respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'invalid db-config.php', 'error_code' => 'MONEY_DB_CONFIG_INVALID', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime), $debug, array('stage' => 'validate_db_config'));
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
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'database unavailable', 'error_code' => 'MONEY_DB_UNAVAILABLE', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime);
    if ($debug) $payload['debug'] = array('connect_errno' => $conn->connect_errno, 'connect_error' => $conn->connect_error);
    respond_json_with_trace($payload, $debug, array('stage' => 'connect_main_db'));
}
$conn->set_charset('utf8');

$tables = array();
$tRes = @$conn->query("SHOW TABLES");
if ($tRes) {
    while ($t = $tRes->fetch_array(MYSQLI_NUM)) $tables[] = $t[0];
    $tRes->free();
}
$schemaOverride = get_module_schema_override('money');
$strictSchema = is_array($schemaOverride) && !empty($schemaOverride['strict']);
$overrideCols = (is_array($schemaOverride) && isset($schemaOverride['columns']) && is_array($schemaOverride['columns'])) ? $schemaOverride['columns'] : array();
$tableCandidates = array('money_cur_sum', 'money_sum', 'money_cur', 'momey_sum', 'momey');
$foundTable = null;
if (is_array($schemaOverride) && isset($schemaOverride['table_candidates']) && is_array($schemaOverride['table_candidates']) && count($schemaOverride['table_candidates']) > 0) {
    $tableCandidates = array();
    foreach ($schemaOverride['table_candidates'] as $cand) {
        $cand = trim((string)$cand);
        if ($cand !== '') $tableCandidates[] = $cand;
    }
}
if (is_array($schemaOverride) && isset($schemaOverride['table'])) {
    $wantedTable = trim((string)$schemaOverride['table']);
    if ($wantedTable !== '') {
        foreach ($tables as $real) {
            if (strtolower($wantedTable) === strtolower($real)) {
                $foundTable = $real;
                break;
            }
        }
        if ($foundTable === null && $strictSchema) {
            $conn->close();
            respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'schema override table not found', 'error_code' => 'MONEY_SCHEMA_TABLE_NOT_FOUND', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime), $debug, array('stage' => 'resolve_table'));
        }
    }
}
foreach ($tableCandidates as $cand) {
    if ($foundTable !== null) break;
    foreach ($tables as $real) {
        if (strtolower($cand) === strtolower($real)) { $foundTable = $real; break 2; }
    }
}
if ($foundTable === null && count($tables) > 0 && !$strictSchema) $foundTable = $tables[0];
if ($foundTable === null) {
    $conn->close();
    respond_json_with_trace(array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'no table found', 'error_code' => 'MONEY_NO_TABLE_FOUND', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime), $debug, array('stage' => 'detect_tables'));
}

$cols = array();
$cRes = @$conn->query("SHOW COLUMNS FROM `".$conn->real_escape_string($foundTable)."`");
if ($cRes) {
    while ($c = $cRes->fetch_assoc()) $cols[] = $c['Field'];
    $cRes->free();
}
$idCol = isset($overrideCols['id']) ? first_col_v3($cols, array((string)$overrideCols['id'])) : null;
if ($idCol === null || !$strictSchema) $idCol = first_col_v3($cols, array('id','ID','ID_per','id_per','emp_id','employee_id'));
$nameCol = isset($overrideCols['name']) ? first_col_v3($cols, array((string)$overrideCols['name'])) : null;
if ($nameCol === null || !$strictSchema) $nameCol = first_col_v3($cols, array('full_name','Name','name','school','Sch_name','sch_name'));
$amountCol = isset($overrideCols['amount']) ? first_col_v3($cols, array((string)$overrideCols['amount'])) : null;
if ($amountCol === null || !$strictSchema) $amountCol = first_col_v3($cols, array('money','sumsalary','net','total','amount'));
$dateCol = isset($overrideCols['date']) ? first_col_v3($cols, array((string)$overrideCols['date'])) : null;
if ($dateCol === null || !$strictSchema) $dateCol = first_col_v3($cols, array('month','Mouth','date','pay_month','Year'));
$statusCol = isset($overrideCols['status']) ? first_col_v3($cols, array((string)$overrideCols['status'])) : null;
if ($statusCol === null || !$strictSchema) {
    $statusCol = first_col_v3($cols, array('status','state','approve_status','approval_status','pay_status','sts','st','money_status'));
}
if ($idCol === null || $amountCol === null || $dateCol === null) {
    $conn->close();
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'query failed: unable to map required columns', 'error_code' => 'MONEY_REQUIRED_COLUMNS_UNMAPPED', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime);
    if ($debug) $payload['debug'] = array('table' => $foundTable, 'mapped' => array('id' => $idCol, 'name' => $nameCol, 'amount' => $amountCol, 'date' => $dateCol));
    respond_json_with_trace($payload, $debug, array('stage' => 'map_columns'));
}

function money_status_from_amount($amount) {
    $amount = (float)$amount;
    if ($amount < 1000) return 'ตีกลับ';
    if ($amount <= 0) return 'รอตรวจสอบ';
    return 'อนุมัติแล้ว';
}

/**
 * ใช้ค่าจากคอลัมน์สถานะเมื่อ map ได้; ไม่เช่นนั้นใช้ heuristic จากยอดเงิน
 */
function money_resolve_row_status($rawFromDb, $amount) {
    $raw = trim((string)$rawFromDb);
    if ($raw !== '') {
        if (preg_match('/ตีกลับ|reject/i', $raw)) return 'ตีกลับ';
        if (preg_match('/อนุมัติ|approve/i', $raw)) return 'อนุมัติแล้ว';
        if (preg_match('/รอ|ตรวจ|pending|wait/i', $raw)) return 'รอตรวจสอบ';
    }
    return money_status_from_amount($amount);
}

$nameSelect = $nameCol !== null ? "`".$nameCol."`" : "`".$idCol."`";
$statusSelect = $statusCol !== null ? ", `".$statusCol."` AS statusRaw" : '';
$sql = "SELECT `".$idCol."` AS rowId, ".$nameSelect." AS schoolName, `".$amountCol."` AS amountValue, `".$dateCol."` AS dateValue".$statusSelect."
FROM `".$foundTable."`
ORDER BY `".$dateCol."` DESC
LIMIT ".$limit;
$r = @$conn->query($sql);
if (!$r) {
    $conn->close();
    $payload = array('ok' => true, 'source' => 'fallback', 'rows' => $fallbackRows, 'message' => 'query failed', 'error_code' => 'MONEY_QUERY_FAILED', 'apiVersion' => $apiVersion, 'fileMtime' => $fileMtime);
    if ($debug) $payload['debug'] = array('sql' => $sql, 'mysql_error' => $conn->error);
    respond_json_with_trace($payload, $debug, array('stage' => 'query_rows'));
}

$rows = array();
while ($row = $r->fetch_assoc()) {
    $id = isset($row['rowId']) ? (string)$row['rowId'] : '';
    $school = isset($row['schoolName']) ? trim((string)$row['schoolName']) : '';
    if ($school === '') $school = $id;
    $amount = isset($row['amountValue']) ? (float)$row['amountValue'] : 0;
    $date = isset($row['dateValue']) ? (string)$row['dateValue'] : '';
    $rawStatus = ($statusCol !== null && isset($row['statusRaw'])) ? (string)$row['statusRaw'] : '';
    $status = money_resolve_row_status($rawStatus, $amount);
    $rows[] = array('id' => $id, 'school' => $school, 'amount' => $amount, 'date' => $date, 'status' => $status);
}
$r->free();

// Enrich display name ("school") from personnel DB when the mapped column is missing/misleading.
if (!$preflight) {
    $personalDbg = array();
    $ctx = pl_personal_connect($personalDbg);
    if (is_array($ctx)) {
        $pconn = $ctx['conn'];
        $pdb = $ctx['cfg'];
        try {
            $personTable = pl_pick_person_table($pconn, $pdb, $debug, $personalDbg);
            if ($personTable !== null) {
                $ids = array();
                foreach ($rows as $rr) {
                    if (!isset($rr['id'])) continue;
                    $ids[] = (string)$rr['id'];
                }
                $nameMap = pl_build_name_map($pconn, $pdb, $personTable, $ids, $debug, $personalDbg);
                foreach ($rows as $i => $rr) {
                    if (!isset($rr['id'])) continue;
                    $idv = (string)$rr['id'];
                    $curr = isset($rr['school']) ? trim((string)$rr['school']) : '';
                    if (pl_looks_like_raw_id_name($curr, $idv)) {
                        if (isset($nameMap[$idv]) && trim((string)$nameMap[$idv]) !== '') {
                            $rows[$i]['school'] = trim((string)$nameMap[$idv]);
                        }
                    }
                }
            }
        } finally {
            $pconn->close();
        }
    }
    if ($debug) {
        // attach light-weight enrichment diagnostics for admins only
        $GLOBALS['money_personal_debug'] = $personalDbg;
    }
}

$totalRows = null;
$pendingCount = null;
if ($preflight) {
    $cntRes = @$conn->query("SELECT COUNT(*) AS c FROM `".$conn->real_escape_string($foundTable)."`");
    if ($cntRes) {
        $cntRow = $cntRes->fetch_assoc();
        if (is_array($cntRow) && isset($cntRow['c'])) {
            $totalRows = (int)$cntRow['c'];
        }
        $cntRes->free();
    }
    $pendRes = @$conn->query(
        "SELECT COUNT(*) AS c FROM `".$conn->real_escape_string($foundTable)."` WHERE `".$amountCol."` <= 0"
    );
    if ($pendRes) {
        $pendRow = $pendRes->fetch_assoc();
        if (is_array($pendRow) && isset($pendRow['c'])) {
            $pendingCount = (int)$pendRow['c'];
        }
        $pendRes->free();
    }
}

$conn->close();

$payload = array(
    'ok' => true,
    'source' => 'database',
    'table' => $foundTable,
    'rows' => $rows,
    'apiVersion' => $apiVersion,
    'fileMtime' => $fileMtime,
    'meta' => array(
        'status_mapping' => array(
            'source' => $statusCol !== null ? 'database_column_with_amount_fallback' : 'amount_heuristic',
            'column' => $statusCol,
        ),
    ),
);
if ($preflight) {
    $payload['metrics'] = array(
        'total_rows' => $totalRows,
        'pending_review_rows' => $pendingCount,
        'limit' => $limit,
    );
}
if ($debug) {
    if (!isset($payload['meta']) || !is_array($payload['meta'])) {
        $payload['meta'] = array();
    }
    $payload['meta']['mapped'] = array(
        'id' => $idCol,
        'school' => $nameCol !== null ? $nameCol : $idCol,
        'amount' => $amountCol,
        'date' => $dateCol,
        'status' => $statusCol,
    );
    if (isset($GLOBALS['money_personal_debug']) && is_array($GLOBALS['money_personal_debug'])) {
        $payload['meta']['personal_lookup'] = $GLOBALS['money_personal_debug'];
    }
}
respond_json_with_trace($payload, $debug, array('stage' => 'ok'));
