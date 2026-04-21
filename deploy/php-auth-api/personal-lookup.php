<?php

/**
 * Lightweight personal-name lookup helpers (shared by money/tax APIs).
 * Uses personal-db-config.php when present.
 */

function pl_find_first_column($columns, $candidates) {
    foreach ($candidates as $c) {
        foreach ($columns as $real) {
            if (strtolower($real) === strtolower($c)) return $real;
        }
    }
    return null;
}

function pl_personal_connect(&$debugOut) {
    $debugOut = array('status' => 'not_configured');
    $path = __DIR__ . '/personal-db-config.php';
    if (!file_exists($path)) {
        return null;
    }
    $pdb = include $path;
    if (!is_array($pdb) || !isset($pdb['host']) || !isset($pdb['user']) || !isset($pdb['pass']) || !isset($pdb['name'])) {
        $debugOut['status'] = 'invalid_personal_config';
        return null;
    }

    $dbCandidates = array($pdb['name']);
    if (isset($pdb['name_candidates']) && is_array($pdb['name_candidates'])) {
        foreach ($pdb['name_candidates'] as $cand) {
            if (!in_array($cand, $dbCandidates, true)) $dbCandidates[] = $cand;
        }
    }

    $pconn = null;
    $selectedDb = null;
    foreach ($dbCandidates as $dbc) {
        $tryConn = @new mysqli($pdb['host'], $pdb['user'], $pdb['pass'], $dbc);
        if (!$tryConn->connect_errno) {
            $pconn = $tryConn;
            $selectedDb = $dbc;
            break;
        }
    }
    if ($pconn === null) {
        $debugOut['status'] = 'personal_connect_failed';
        return null;
    }
    $pconn->set_charset('utf8');
    $debugOut['status'] = 'connected';
    $debugOut['db'] = $selectedDb;
    return array('conn' => $pconn, 'cfg' => $pdb);
}

function pl_pick_person_table($pconn, $pdb, $debug, &$debugOut) {
    $tables = array();
    $tblRes = @$pconn->query("SHOW TABLES");
    if ($tblRes) {
        while ($t = $tblRes->fetch_array(MYSQLI_NUM)) $tables[] = $t[0];
        $tblRes->free();
    }

    $tableCandidates = array('member', 'members', 'personal', 'personnel', 'employee', 'employees');
    $overrideTable = isset($pdb['table']) ? trim((string)$pdb['table']) : '';
    $personTable = null;
    if ($overrideTable !== '') {
        foreach ($tables as $realTb) {
            if (strtolower($overrideTable) === strtolower($realTb)) {
                $personTable = $realTb;
                break;
            }
        }
    }
    if ($personTable === null) {
        foreach ($tableCandidates as $cand) {
            foreach ($tables as $realTb) {
                if (strtolower($cand) === strtolower($realTb)) {
                    $personTable = $realTb;
                    break 2;
                }
            }
        }
    }
    if ($personTable === null) {
        foreach ($tables as $tbScan) {
            $scanCols = array();
            $scanRes = @$pconn->query("SHOW COLUMNS FROM `".$pconn->real_escape_string($tbScan)."`");
            if ($scanRes) {
                while ($sc = $scanRes->fetch_assoc()) $scanCols[] = $sc['Field'];
                $scanRes->free();
            }
            if (count($scanCols) === 0) continue;
            $scanId = pl_find_first_column($scanCols, array('ID_per','id_per','employee_id','emp_id','id','code'));
            $scanName = pl_find_first_column($scanCols, array('Name','name','full_name','fullname','first_name','fname'));
            if ($scanId !== null && $scanName !== null) {
                $personTable = $tbScan;
                break;
            }
        }
    }

    if ($personTable === null) {
        $debugOut['status'] = 'personal_table_not_found';
        if ($debug) $debugOut['tables'] = $tables;
        return null;
    }

    $debugOut['table'] = $personTable;
    return $personTable;
}

function pl_build_name_map($pconn, $pdb, $personTable, $ids, $debug, &$debugOut) {
    $memberColumns = array();
    $colRes = @$pconn->query("SHOW COLUMNS FROM `".$pconn->real_escape_string($personTable)."`");
    if ($colRes) {
        while ($c = $colRes->fetch_assoc()) $memberColumns[] = $c['Field'];
        $colRes->free();
    }

    $overrideIdCol = isset($pdb['id_col']) ? trim((string)$pdb['id_col']) : '';
    $overrideNameCol = isset($pdb['name_col']) ? trim((string)$pdb['name_col']) : '';
    $overridePrefixCol = isset($pdb['prefix_col']) ? trim((string)$pdb['prefix_col']) : '';
    $overrideLastCol = isset($pdb['last_col']) ? trim((string)$pdb['last_col']) : '';

    $idCol = $overrideIdCol !== '' ? pl_find_first_column($memberColumns, array($overrideIdCol)) : null;
    if ($idCol === null) $idCol = pl_find_first_column($memberColumns, array('ID_per','id_per','employee_id','emp_id','id','code'));

    $nameCol = $overrideNameCol !== '' ? pl_find_first_column($memberColumns, array($overrideNameCol)) : null;
    if ($nameCol === null) $nameCol = pl_find_first_column($memberColumns, array('Name','name','full_name','fullname','first_name','fname'));

    $prefixCol = $overridePrefixCol !== '' ? pl_find_first_column($memberColumns, array($overridePrefixCol)) : null;
    if ($prefixCol === null) $prefixCol = pl_find_first_column($memberColumns, array('Pname','prefix','title_name','title'));

    $lastCol = $overrideLastCol !== '' ? pl_find_first_column($memberColumns, array($overrideLastCol)) : null;
    if ($lastCol === null) $lastCol = pl_find_first_column($memberColumns, array('Sname','sname','lname','lastname','last_name'));

    if ($idCol === null || $nameCol === null) {
        $debugOut['status'] = 'personal_member_columns_not_found';
        if ($debug) {
            $debugOut['member_columns'] = $memberColumns;
        }
        return array();
    }

    $escaped = array();
    foreach ($ids as $idv) {
        $idv = trim((string)$idv);
        if ($idv === '') continue;
        $escaped[] = "'" . $pconn->real_escape_string($idv) . "'";
    }
    if (count($escaped) === 0) return array();
    $inClause = implode(',', $escaped);

    $sql = "SELECT `".$idCol."` AS idv, `".$nameCol."` AS firstName";
    if ($prefixCol !== null) $sql .= ", `".$prefixCol."` AS prefixName";
    if ($lastCol !== null) $sql .= ", `".$lastCol."` AS lastName";
    $sql .= " FROM `".$personTable."` WHERE `".$idCol."` IN (".$inClause.")";

    $map = array();
    $res = @$pconn->query($sql);
    if (!$res) {
        $debugOut['status'] = 'personal_query_failed';
        if ($debug) {
            $debugOut['mysql_error'] = $pconn->error;
            $debugOut['sql'] = $sql;
        }
        return array();
    }
    while ($m = $res->fetch_assoc()) {
        $full = '';
        if (isset($m['prefixName']) && trim((string)$m['prefixName']) !== '') {
            $full .= trim((string)$m['prefixName']);
        }
        if (isset($m['firstName']) && trim((string)$m['firstName']) !== '') {
            $full .= ($full !== '' ? '' : '') . trim((string)$m['firstName']);
        }
        if (isset($m['lastName']) && trim((string)$m['lastName']) !== '') {
            $full .= ($full !== '' ? ' ' : '') . trim((string)$m['lastName']);
        }
        $full = trim($full);
        if ($full === '' && isset($m['firstName'])) {
            $full = trim((string)$m['firstName']);
        }
        if ($full !== '') $map[(string)$m['idv']] = $full;
    }
    $res->free();

    $debugOut['status'] = 'ok';
    $debugOut['mapped_ids'] = count($map);
    return $map;
}

function pl_only_digits($s) {
    $s = preg_replace('/[^0-9]/', '', (string)$s);
    return $s;
}

function pl_looks_like_raw_id_name($name, $id) {
    $n = trim((string)$name);
    if ($n === '') return true;
    if ($n === (string)$id) return true;
    $digitsN = pl_only_digits($n);
    $digitsId = pl_only_digits($id);
    if ($digitsN !== '' && $digitsId !== '' && $digitsN === $digitsId) return true;
    // Long digit-only "names" are almost never human-readable names.
    if (preg_match('/^[0-9]{10,}$/', $n) === 1) return true;
    return false;
}
