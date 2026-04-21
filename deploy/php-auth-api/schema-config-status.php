<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('schema_config_status', 20, 60)) exit;
require_role_json(array('admin'));

$status = schema_map_status_payload();
echo json_encode(array(
    'ok' => true,
    'schema_config' => $status,
));
