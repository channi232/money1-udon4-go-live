<?php

function send_security_headers_json() {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
}

function init_api_trace($moduleName) {
    $module = trim((string)$moduleName);
    if ($module === '') $module = 'unknown_module';
    $requestId = '';
    if (function_exists('random_bytes')) {
        try {
            $requestId = bin2hex(random_bytes(6));
        } catch (Exception $ex) {
            $requestId = '';
        }
    }
    if ($requestId === '') {
        $requestId = substr(sha1(uniqid('', true)), 0, 12);
    }
    $requestId = $module . '-' . $requestId;
    $GLOBALS['api_trace'] = array(
        'module' => $module,
        'request_id' => $requestId,
        'started_at_ms' => (int)round(microtime(true) * 1000),
    );
    header('X-Request-Id: ' . $requestId);
    return $requestId;
}

function respond_json_with_trace($payload, $debug, $traceExtra = array()) {
    if (!is_array($payload)) $payload = array('ok' => false, 'message' => 'invalid_payload');
    $trace = isset($GLOBALS['api_trace']) && is_array($GLOBALS['api_trace']) ? $GLOBALS['api_trace'] : array();
    $module = isset($trace['module']) ? (string)$trace['module'] : 'unknown_module';
    $requestId = isset($trace['request_id']) ? (string)$trace['request_id'] : '';
    $startedAt = isset($trace['started_at_ms']) ? (int)$trace['started_at_ms'] : null;
    if ($requestId === '') {
        $requestId = init_api_trace($module);
    }
    if (!isset($payload['request_id'])) {
        $payload['request_id'] = $requestId;
    }
    if ($debug) {
        $duration = null;
        if ($startedAt !== null) {
            $duration = (int)round(microtime(true) * 1000) - $startedAt;
            if ($duration < 0) $duration = 0;
        }
        if (!isset($payload['debug']) || !is_array($payload['debug'])) {
            $payload['debug'] = array();
        }
        $payload['debug']['trace'] = array(
            'module' => $module,
            'request_id' => $requestId,
            'duration_ms' => $duration,
        );
        if (is_array($traceExtra) && count($traceExtra) > 0) {
            foreach ($traceExtra as $k => $v) {
                $payload['debug']['trace'][(string)$k] = $v;
            }
        }
    }
    echo json_encode($payload);
    exit;
}

function default_role_map() {
    return array(
        'previewadmin' => 'admin',
        'finance01' => 'finance',
        'personnel01' => 'personnel',
    );
}

function load_role_map_result() {
    static $cached = null;
    if (is_array($cached)) return $cached;

    $defaults = default_role_map();
    $path = __DIR__ . '/role-map.php';
    if (!file_exists($path)) {
        $cached = array(
            'map' => $defaults,
            'source' => 'default',
            'path' => $path,
            'valid' => true,
            'error' => 'role_map_file_not_found',
        );
        return $cached;
    }

    $data = include $path;
    if (!is_array($data)) {
        $cached = array(
            'map' => $defaults,
            'source' => 'default',
            'path' => $path,
            'valid' => false,
            'error' => 'invalid_role_map_payload',
        );
        return $cached;
    }

    $normalized = array();
    foreach ($data as $username => $role) {
        $u = strtolower(trim((string)$username));
        $r = trim((string)$role);
        if ($u === '' || $r === '') continue;
        $normalized[$u] = $r;
    }
    if (count($normalized) === 0) {
        $cached = array(
            'map' => $defaults,
            'source' => 'default',
            'path' => $path,
            'valid' => false,
            'error' => 'empty_role_map',
        );
        return $cached;
    }

    $cached = array(
        'map' => $normalized,
        'source' => 'file',
        'path' => $path,
        'valid' => true,
        'error' => '',
    );
    return $cached;
}

function role_map_status_payload() {
    $result = load_role_map_result();
    $map = isset($result['map']) && is_array($result['map']) ? $result['map'] : array();
    $roles = array();
    foreach ($map as $role) {
        if (!in_array($role, $roles, true)) $roles[] = $role;
    }
    sort($roles);
    return array(
        'source' => isset($result['source']) ? (string)$result['source'] : 'default',
        'valid' => isset($result['valid']) ? (bool)$result['valid'] : false,
        'count' => count($map),
        'roles' => $roles,
        'error' => isset($result['error']) ? (string)$result['error'] : '',
        'path' => isset($result['path']) ? (string)$result['path'] : '',
    );
}

function load_schema_map_result() {
    static $cached = null;
    if (is_array($cached)) return $cached;

    $path = __DIR__ . '/schema-map.php';
    if (!file_exists($path)) {
        $cached = array(
            'map' => array(),
            'source' => 'default',
            'path' => $path,
            'valid' => false,
            'error' => 'schema_map_file_not_found',
        );
        return $cached;
    }

    $data = include $path;
    if (!is_array($data)) {
        $cached = array(
            'map' => array(),
            'source' => 'default',
            'path' => $path,
            'valid' => false,
            'error' => 'invalid_schema_map_payload',
        );
        return $cached;
    }

    $cached = array(
        'map' => $data,
        'source' => 'file',
        'path' => $path,
        'valid' => true,
        'error' => '',
    );
    return $cached;
}

function get_module_schema_override($module) {
    $result = load_schema_map_result();
    if (!isset($result['map']) || !is_array($result['map'])) return null;
    $module = strtolower(trim((string)$module));
    if ($module === '') return null;
    if (!isset($result['map'][$module]) || !is_array($result['map'][$module])) return null;
    return $result['map'][$module];
}

function schema_map_status_payload() {
    $result = load_schema_map_result();
    $map = isset($result['map']) && is_array($result['map']) ? $result['map'] : array();
    $modules = array();
    foreach ($map as $module => $cfg) {
        if (!is_array($cfg)) continue;
        $modules[] = array(
            'module' => (string)$module,
            'strict' => isset($cfg['strict']) ? (bool)$cfg['strict'] : false,
            'table' => isset($cfg['table']) ? (string)$cfg['table'] : '',
            'has_columns' => isset($cfg['columns']) && is_array($cfg['columns']),
        );
    }
    return array(
        'source' => isset($result['source']) ? (string)$result['source'] : 'default',
        'valid' => isset($result['valid']) ? (bool)$result['valid'] : false,
        'count' => count($modules),
        'modules' => $modules,
        'error' => isset($result['error']) ? (string)$result['error'] : '',
    );
}

function current_username_from_server() {
    if (isset($_SERVER['PHP_AUTH_USER']) && $_SERVER['PHP_AUTH_USER'] !== '') {
        return trim((string)$_SERVER['PHP_AUTH_USER']);
    }
    if (isset($_SERVER['REMOTE_USER']) && $_SERVER['REMOTE_USER'] !== '') {
        $remote = (string)$_SERVER['REMOTE_USER'];
        if (strpos($remote, '\\') !== false) {
            $parts = explode('\\', $remote);
            $remote = end($parts);
        }
        return trim($remote);
    }
    if (isset($_SERVER['REDIRECT_REMOTE_USER']) && $_SERVER['REDIRECT_REMOTE_USER'] !== '') {
        $remote = (string)$_SERVER['REDIRECT_REMOTE_USER'];
        if (strpos($remote, '\\') !== false) {
            $parts = explode('\\', $remote);
            $remote = end($parts);
        }
        return trim($remote);
    }
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && stripos($_SERVER['HTTP_AUTHORIZATION'], 'Basic ') === 0) {
        $encoded = trim(substr($_SERVER['HTTP_AUTHORIZATION'], 6));
        $decoded = base64_decode($encoded, true);
        if ($decoded !== false && strpos($decoded, ':') !== false) {
            $parts = explode(':', $decoded, 2);
            return trim((string)$parts[0]);
        }
    }
    return '';
}

function current_role_from_server($roleMap = null) {
    if (!is_array($roleMap)) {
        $loaded = load_role_map_result();
        $roleMap = isset($loaded['map']) && is_array($loaded['map']) ? $loaded['map'] : default_role_map();
    }
    $username = current_username_from_server();
    if ($username === '') return 'guest';
    $normalized = strtolower($username);
    if (isset($roleMap[$normalized])) return (string)$roleMap[$normalized];
    return 'guest';
}

function deny_forbidden_json($message) {
    http_response_code(403);
    echo json_encode(array('ok' => false, 'message' => $message));
    exit;
}

function deny_bad_request_json($message) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'message' => $message));
    exit;
}

function deny_method_not_allowed_json($allowedMethod) {
    http_response_code(405);
    header('Allow: ' . $allowedMethod);
    echo json_encode(array('ok' => false, 'message' => 'method_not_allowed'));
    exit;
}

function require_authenticated_user_json() {
    if (current_username_from_server() === '') {
        deny_forbidden_json('authentication_required');
    }
}

function require_request_method_json($allowedMethod) {
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string)$_SERVER['REQUEST_METHOD']) : '';
    if ($method !== strtoupper((string)$allowedMethod)) {
        deny_method_not_allowed_json(strtoupper((string)$allowedMethod));
    }
}

function require_same_origin_write_json() {
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(trim((string)$_SERVER['HTTP_HOST'])) : '';
    if ($host === '') return;

    $origin = '';
    if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== '') {
        $origin = (string)$_SERVER['HTTP_ORIGIN'];
    } elseif (isset($_SERVER['HTTP_REFERER']) && $_SERVER['HTTP_REFERER'] !== '') {
        $origin = (string)$_SERVER['HTTP_REFERER'];
    }
    if ($origin === '') return;

    $originHost = parse_url($origin, PHP_URL_HOST);
    if (!is_string($originHost) || trim($originHost) === '') {
        deny_bad_request_json('invalid_origin');
    }
    $originHost = strtolower(trim($originHost));
    if ($originHost !== $host) {
        deny_forbidden_json('cross_origin_forbidden');
    }
}

function require_role_json($allowedRoles, $roleMap = null) {
    if (!is_array($allowedRoles)) $allowedRoles = array();
    $role = current_role_from_server($roleMap);
    if (!in_array($role, $allowedRoles, true)) {
        deny_forbidden_json('forbidden');
    }
}
