<?php
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_role_json(array('admin'));

echo json_encode(array(
    'ok' => true,
    'script_file' => __FILE__,
    'document_root' => isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : '',
    'script_filename' => isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '',
    'request_uri' => isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '',
    'server_name' => isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '',
));
