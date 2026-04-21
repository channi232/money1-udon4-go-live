<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_role_json(array('admin'));

echo json_encode(array(
    'ok' => true,
    'api_dir' => __DIR__,
));
