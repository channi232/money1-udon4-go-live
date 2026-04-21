<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('personal_schema', 10, 60)) exit;
require_role_json(array('admin'));

$debug = isset($_GET['debug']) && $_GET['debug'] === '1';
if (!$debug) {
    echo json_encode(array(
        'ok' => false,
        'message' => 'debug flag required',
    ));
    exit;
}

$configPath = __DIR__ . '/personal-db-config.php';
if (!file_exists($configPath)) {
    echo json_encode(array('ok' => false, 'message' => 'personal-db-config.php not found'));
    exit;
}

$db = include $configPath;
if (!is_array($db) || !isset($db['host']) || !isset($db['user']) || !isset($db['pass']) || !isset($db['name'])) {
    echo json_encode(array('ok' => false, 'message' => 'invalid personal-db-config.php'));
    exit;
}

$conn = @new mysqli($db['host'], $db['user'], $db['pass'], $db['name']);
if ($conn->connect_errno) {
    echo json_encode(array(
        'ok' => false,
        'message' => 'connect failed',
        'connect_errno' => $conn->connect_errno,
        'connect_error' => $conn->connect_error,
    ));
    exit;
}
$conn->set_charset('utf8');

$tables = array();
$res = @$conn->query("SHOW TABLES");
if ($res) {
    while ($r = $res->fetch_array(MYSQLI_NUM)) {
        $tables[] = $r[0];
    }
    $res->free();
}

$tableDetails = array();
foreach ($tables as $tb) {
    $cols = array();
    $cRes = @$conn->query("SHOW COLUMNS FROM `".$conn->real_escape_string($tb)."`");
    if ($cRes) {
        while ($c = $cRes->fetch_assoc()) {
            $cols[] = $c['Field'];
        }
        $cRes->free();
    }
    $tableDetails[] = array(
        'table' => $tb,
        'columns' => $cols,
    );
}

$conn->close();

echo json_encode(array(
    'ok' => true,
    'db' => $db['name'],
    'table_count' => count($tableDetails),
    'tables' => $tableDetails,
));
