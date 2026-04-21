<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('POST');
require_same_origin_write_json();
require_role_json(array('admin'));

$result = array(
    'ok' => true,
    'opcache_enabled' => function_exists('opcache_get_status'),
    'reset_called' => false,
    'reset_result' => null,
);

if (function_exists('opcache_reset')) {
    $result['reset_called'] = true;
    $result['reset_result'] = @opcache_reset();
}

echo json_encode($result);
