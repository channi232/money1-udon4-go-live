<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');

$debugRequested = isset($_GET['debug']) && $_GET['debug'] === '1';
$username = null;
$authSource = 'none';

if (isset($_SERVER['PHP_AUTH_USER']) && $_SERVER['PHP_AUTH_USER'] !== '') {
    $username = $_SERVER['PHP_AUTH_USER'];
    $authSource = 'PHP_AUTH_USER';
}

if ($username === null && isset($_SERVER['REMOTE_USER']) && $_SERVER['REMOTE_USER'] !== '') {
    $remote = $_SERVER['REMOTE_USER'];
    if (strpos($remote, '\\') !== false) {
        $parts = explode('\\', $remote);
        $remote = end($parts);
    }
    $username = $remote;
    $authSource = 'REMOTE_USER';
}

if ($username === null && isset($_SERVER['REDIRECT_REMOTE_USER']) && $_SERVER['REDIRECT_REMOTE_USER'] !== '') {
    $remote = $_SERVER['REDIRECT_REMOTE_USER'];
    if (strpos($remote, '\\') !== false) {
        $parts = explode('\\', $remote);
        $remote = end($parts);
    }
    $username = $remote;
    $authSource = 'REDIRECT_REMOTE_USER';
}

if ($username === null && isset($_SERVER['HTTP_AUTHORIZATION']) && stripos($_SERVER['HTTP_AUTHORIZATION'], 'Basic ') === 0) {
    $encoded = trim(substr($_SERVER['HTTP_AUTHORIZATION'], 6));
    $decoded = base64_decode($encoded, true);
    if ($decoded !== false && strpos($decoded, ':') !== false) {
        $parts = explode(':', $decoded, 2);
        $username = $parts[0];
        $authSource = 'HTTP_AUTHORIZATION';
    }
}

if ($username !== null) {
    $username = trim($username);
    if ($username === '') $username = null;
}

$roleMapResult = load_role_map_result();
$roleMap = isset($roleMapResult['map']) && is_array($roleMapResult['map'])
    ? $roleMapResult['map']
    : default_role_map();

$role = 'guest';
if ($username !== null) {
    $normalizedUsername = strtolower($username);
    if (isset($roleMap[$normalizedUsername])) {
        $role = $roleMap[$normalizedUsername];
    }
}

$payload = array(
    'authenticated' => $username !== null,
    'username' => $username,
    'role' => $role,
    'auth_source' => $authSource,
);

if ($debugRequested && $role === 'admin') {
    $payload['debug'] = array(
        'has_php_auth_user' => isset($_SERVER['PHP_AUTH_USER']),
        'has_remote_user' => isset($_SERVER['REMOTE_USER']),
        'has_redirect_remote_user' => isset($_SERVER['REDIRECT_REMOTE_USER']),
        'has_http_authorization' => isset($_SERVER['HTTP_AUTHORIZATION']),
    );
}

echo json_encode($payload);
