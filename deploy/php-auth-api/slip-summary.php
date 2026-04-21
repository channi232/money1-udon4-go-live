<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('slip_summary', 120, 60)) exit;
require_role_json(array('admin', 'finance', 'personnel'));
require_once __DIR__ . '/personal-lookup.php';
@set_time_limit(20);
if (function_exists('mysqli_report')) {
    mysqli_report(MYSQLI_REPORT_OFF);
}
init_api_trace('slip_summary');
$debugRequested = isset($_GET['debug']) && $_GET['debug'] === '1';
$debug = $debugRequested && current_role_from_server() === 'admin';
$preflight = isset($_GET['preflight']) && $_GET['preflight'] === '1';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1) $limit = 1;
if ($limit > 200) $limit = 200;

// Default fallback rows (safe to expose).
$fallbackRows = array(
    array('month' => 'เมษายน 2569', 'employeeId' => '34012', 'fullName' => 'สมชาย ใจดี', 'net' => 32450),
    array('month' => 'เมษายน 2569', 'employeeId' => '34087', 'fullName' => 'อรทัย เข็มทอง', 'net' => 28790),
    array('month' => 'มีนาคม 2569', 'employeeId' => '33995', 'fullName' => 'วรพงษ์ ศรีสุข', 'net' => 41920),
    array('month' => 'มีนาคม 2569', 'employeeId' => '34056', 'fullName' => 'ศิริพร บุญมา', 'net' => 30115),
);

$configPath = __DIR__ . '/db-config.php';
if (!file_exists($configPath)) {
    respond_json_with_trace(array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'db-config.php not found',
        'error_code' => 'SLIP_DB_CONFIG_NOT_FOUND',
    ), $debug, array('stage' => 'load_db_config'));
}

$db = include $configPath;
if (!is_array($db) || !isset($db['host']) || !isset($db['user']) || !isset($db['pass']) || !isset($db['name'])) {
    $payload = array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'invalid db-config.php',
        'error_code' => 'SLIP_DB_CONFIG_INVALID',
    );
    if ($debug) {
        $payload['debug'] = array('stage' => 'validate_config');
    }
    respond_json_with_trace($payload, $debug, array('stage' => 'validate_db_config'));
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
    $payload = array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'database unavailable',
        'error_code' => 'SLIP_DB_UNAVAILABLE',
    );
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'connect',
            'connect_errno' => $conn->connect_errno,
            'connect_error' => $conn->connect_error,
        );
    }
    respond_json_with_trace($payload, $debug, array('stage' => 'connect_main_db'));
}

$conn->set_charset('utf8');

function find_first_column($columns, $candidates) {
    foreach ($candidates as $c) {
        foreach ($columns as $real) {
            if (strtolower($real) === strtolower($c)) {
                return $real;
            }
        }
    }
    return null;
}

function enrich_rows_with_personal_names($rows, $debug, &$enrichDebug) {
    $enrichDebug = array(
        'status' => 'not_configured',
        'updated' => 0,
    );

    $ids = array();
    foreach ($rows as $r) {
        $id = isset($r['employeeId']) ? trim((string)$r['employeeId']) : '';
        if ($id !== '') {
            $ids[$id] = true;
        }
    }
    $idList = array_keys($ids);
    if (count($idList) === 0) {
        $enrichDebug['status'] = 'no_ids';
        return $rows;
    }

    $personalDbg = array();
    $ctx = pl_personal_connect($personalDbg);
    if (!is_array($ctx)) {
        $enrichDebug = array_merge($enrichDebug, $personalDbg);
        return $rows;
    }

    $updated = 0;
    $pconn = $ctx['conn'];
    $pdb = $ctx['cfg'];
    try {
        $personTable = pl_pick_person_table($pconn, $pdb, $debug, $personalDbg);
        if ($personTable === null) {
            $enrichDebug = array_merge($enrichDebug, $personalDbg);
            return $rows;
        }
        $map = pl_build_name_map($pconn, $pdb, $personTable, $idList, $debug, $personalDbg);
        foreach ($rows as $k => $r) {
            $emp = isset($r['employeeId']) ? (string)$r['employeeId'] : '';
            $curr = isset($r['fullName']) ? trim((string)$r['fullName']) : '';
            if (!pl_looks_like_raw_id_name($curr, $emp)) continue;
            if (!isset($map[$emp]) || trim((string)$map[$emp]) === '') continue;
            $rows[$k]['fullName'] = trim((string)$map[$emp]);
            $updated++;
        }
    } finally {
        $pconn->close();
    }

    $enrichDebug = array_merge($enrichDebug, $personalDbg);
    $enrichDebug['updated'] = $updated;
    return $rows;
}

$foundTable = null;
$tableRes = @$conn->query("SHOW TABLES");
$allTables = array();
if ($tableRes) {
    while ($t = $tableRes->fetch_array(MYSQLI_NUM)) {
        $allTables[] = $t[0];
    }
    $tableRes->free();
}
$schemaOverride = get_module_schema_override('slip');
$strictSchema = is_array($schemaOverride) && !empty($schemaOverride['strict']);
$overrideCols = (is_array($schemaOverride) && isset($schemaOverride['columns']) && is_array($schemaOverride['columns'])) ? $schemaOverride['columns'] : array();
$targetTables = $allTables;
if (is_array($schemaOverride) && isset($schemaOverride['table_candidates']) && is_array($schemaOverride['table_candidates']) && count($schemaOverride['table_candidates']) > 0) {
    $candidateTables = array();
    foreach ($schemaOverride['table_candidates'] as $cand) {
        $cand = trim((string)$cand);
        if ($cand === '') continue;
        foreach ($allTables as $tb) {
            if (strtolower($tb) === strtolower($cand)) {
                $candidateTables[] = $tb;
                break;
            }
        }
    }
    if (count($candidateTables) > 0) {
        $targetTables = $candidateTables;
    } else if ($strictSchema) {
        $payload = array(
            'ok' => true,
            'source' => 'fallback',
            'rows' => $fallbackRows,
            'message' => 'schema override candidate tables not found',
            'error_code' => 'SLIP_SCHEMA_CANDIDATE_TABLES_NOT_FOUND',
        );
        if ($debug) {
            $payload['debug'] = array(
                'stage' => 'table_scan',
                'wanted_tables' => $schemaOverride['table_candidates'],
                'tables' => $allTables,
            );
        }
        $conn->close();
        respond_json_with_trace($payload, $debug, array('stage' => 'resolve_candidate_tables'));
    }
}
if (is_array($schemaOverride) && isset($schemaOverride['table'])) {
    $wantedTable = trim((string)$schemaOverride['table']);
    if ($wantedTable !== '') {
        $matchedTable = null;
        foreach ($allTables as $tb) {
            if (strtolower($tb) === strtolower($wantedTable)) {
                $matchedTable = $tb;
                break;
            }
        }
        if ($matchedTable !== null) {
            $targetTables = array($matchedTable);
        } else if ($strictSchema) {
            $payload = array(
                'ok' => true,
                'source' => 'fallback',
                'rows' => $fallbackRows,
                'message' => 'schema override table not found',
                'error_code' => 'SLIP_SCHEMA_TABLE_NOT_FOUND',
            );
            if ($debug) {
                $payload['debug'] = array(
                    'stage' => 'table_scan',
                    'wanted_table' => $wantedTable,
                    'tables' => $allTables,
                );
            }
            $conn->close();
            respond_json_with_trace($payload, $debug, array('stage' => 'resolve_table'));
        }
    }
}

// Try every table and choose the best column match.
$best = null;
$inspect = array();
foreach ($targetTables as $tb) {
    $columns = array();
    $colRes = @$conn->query("SHOW COLUMNS FROM `".$conn->real_escape_string($tb)."`");
    if ($colRes) {
        while ($c = $colRes->fetch_assoc()) {
            $columns[] = $c['Field'];
        }
        $colRes->free();
    }
    if (count($columns) === 0) {
        continue;
    }

    $monthCol = isset($overrideCols['month']) ? find_first_column($columns, array((string)$overrideCols['month'])) : null;
    if ($monthCol === null || !$strictSchema) $monthCol = find_first_column($columns, array('pay_month','month','months','mon','period','pmonth','mn'));
    $idCol = isset($overrideCols['employeeId']) ? find_first_column($columns, array((string)$overrideCols['employeeId'])) : null;
    if ($idCol === null || !$strictSchema) $idCol = find_first_column($columns, array('employee_id','emp_id','id','pid','code','person_id','staff_id','empno','perid','userid'));
    $nameCol = isset($overrideCols['fullName']) ? find_first_column($columns, array((string)$overrideCols['fullName'])) : null;
    if ($nameCol === null || !$strictSchema) $nameCol = find_first_column($columns, array('full_name','fullname','name','empname','username','person_name','title_name','fname','pname'));
    $netCol = isset($overrideCols['net']) ? find_first_column($columns, array((string)$overrideCols['net'])) : null;
    if ($netCol === null || !$strictSchema) $netCol = find_first_column($columns, array('net_amount','net','sum_net','salary_net','income_net','total','money','netpay','sumsalary','sumnet'));

    $score = 0;
    if ($monthCol !== null) $score += 3;
    if ($idCol !== null) $score += 2;
    if ($nameCol !== null) $score += 2;
    if ($netCol !== null) $score += 3;

    $inspect[] = array(
        'table' => $tb,
        'score' => $score,
        'mapped' => array(
            'month' => $monthCol,
            'employeeId' => $idCol,
            'fullName' => $nameCol,
            'net' => $netCol,
        ),
    );

    if ($best === null || $score > $best['score']) {
        $best = array(
            'table' => $tb,
            'score' => $score,
            'columns' => $columns,
            'monthCol' => $monthCol,
            'idCol' => $idCol,
            'nameCol' => $nameCol,
            'netCol' => $netCol,
        );
    }
}

if ($best === null) {
    $payload = array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'query failed: no readable table found',
        'error_code' => 'SLIP_NO_READABLE_TABLE_FOUND',
    );
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'table_scan',
            'tables' => $targetTables,
        );
    }
    $conn->close();
    respond_json_with_trace($payload, $debug, array('stage' => 'scan_tables'));
}

$foundTable = $best['table'];
$columns = $best['columns'];
$monthCol = $best['monthCol'];
$idCol = $best['idCol'];
$nameCol = $best['nameCol'];
$netCol = $best['netCol'];

// Require month + id + net. Name can be optional and will fallback to id.
if ($monthCol === null || $idCol === null || $netCol === null) {
    $payload = array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'query failed: unable to map required columns',
        'error_code' => 'SLIP_REQUIRED_COLUMNS_UNMAPPED',
    );
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'column_detect',
            'table' => $foundTable,
            'columns' => $columns,
            'best_score' => $best['score'],
            'table_inspect' => $inspect,
            'mapped' => array(
                'month' => $monthCol,
                'employeeId' => $idCol,
                'fullName' => $nameCol,
                'net' => $netCol,
            ),
        );
    }
    $conn->close();
    respond_json_with_trace($payload, $debug, array('stage' => 'map_columns'));
}

$nameSelect = $nameCol !== null ? "`".$nameCol."`" : "`".$idCol."`";
$sql = "SELECT `".$monthCol."` AS month, `".$idCol."` AS employeeId, ".$nameSelect." AS fullName, `".$netCol."` AS net
FROM `".$foundTable."`
ORDER BY `".$monthCol."` DESC
LIMIT ".$limit;

$result = @$conn->query($sql);
if (!$result) {
    $payload = array(
        'ok' => true,
        'source' => 'fallback',
        'rows' => $fallbackRows,
        'message' => 'query failed: update SQL in slip-summary.php',
        'error_code' => 'SLIP_QUERY_FAILED',
    );
    if ($debug) {
        $payload['debug'] = array(
            'stage' => 'query',
            'sql' => $sql,
            'mysql_error' => $conn->error,
            'table' => $foundTable,
            'columns' => $columns,
        );
    }
    $conn->close();
    respond_json_with_trace($payload, $debug, array('stage' => 'query_rows'));
}

$rows = array();
while ($row = $result->fetch_assoc()) {
    $rows[] = array(
        'month' => isset($row['month']) ? (string)$row['month'] : '',
        'employeeId' => isset($row['employeeId']) ? (string)$row['employeeId'] : '',
        'fullName' => isset($row['fullName']) ? (string)$row['fullName'] : '',
        'net' => isset($row['net']) ? (float)$row['net'] : 0,
    );
}

$result->free();
$enrichDebug = array();
if ($preflight) {
    $enrichDebug = array(
        'status' => 'skipped_preflight',
        'updated' => 0,
    );
} else {
    $rows = enrich_rows_with_personal_names($rows, $debug, $enrichDebug);
}

$totalRows = null;
if ($preflight) {
    $cntRes = @$conn->query("SELECT COUNT(*) AS c FROM `".$conn->real_escape_string($foundTable)."`");
    if ($cntRes) {
        $cntRow = $cntRes->fetch_assoc();
        if (is_array($cntRow) && isset($cntRow['c'])) {
            $totalRows = (int)$cntRow['c'];
        }
        $cntRes->free();
    }
}

$conn->close();

$payload = array(
    'ok' => true,
    'source' => 'database',
    'table' => $foundTable,
    'meta' => array(
        'mapped' => array(
            'month' => $monthCol,
            'employeeId' => $idCol,
            'fullName' => $nameCol !== null ? $nameCol : $idCol,
            'net' => $netCol,
        ),
        'personal_enrich' => $enrichDebug,
    ),
    'rows' => $rows,
);
if ($preflight) {
    $payload['metrics'] = array(
        'total_rows' => $totalRows,
        'limit' => $limit,
    );
}
respond_json_with_trace($payload, $debug, array('stage' => 'ok'));
