<?php
/**
 * สรุปเชิงปฏิบัติการก่อน/หลังเปิด — ไม่มี secret, admin เท่านั้น
 */
require_once __DIR__ . '/security-common.php';
send_security_headers_json();
require_request_method_json('GET');
require_once __DIR__ . '/rate-limit.php';
if (!apply_rate_limit('ops_snapshot', 30, 60)) exit;
require_role_json(array('admin'));

$hints = array(
    array(
        'id' => 'mysql_main',
        'title' => 'ฐานข้อมูลหลัก (db-config.php)',
        'action' => 'สำรองตามนโยบายองค์กร (mysqldump / snapshot)',
    ),
    array(
        'id' => 'table_workflow',
        'title' => 'ตาราง platform_workflow_state',
        'action' => 'เก็บสถานะ workflow overlay; สำรองร่วมกับฐานข้อมูลหลัก',
    ),
    array(
        'id' => 'file_audit_log',
        'title' => 'ไฟล์ logs/audit.log',
        'action' => 'สำรองและหมุนไฟล์ตามขนาด (append-only)',
    ),
    array(
        'id' => 'file_workflow_state',
        'title' => 'ไฟล์ logs/workflow-state.json',
        'action' => 'ใช้เมื่อ persistence=file หรือ fallback; ควรสำรอง',
    ),
    array(
        'id' => 'file_workflow_transition',
        'title' => 'ไฟล์ logs/workflow-transition.log',
        'action' => 'บันทึก transition ทุกครั้ง; สำรองร่วมกับ logs',
    ),
    array(
        'id' => 'file_audit_review',
        'title' => 'ไฟล์ logs/audit-review.json',
        'action' => 'สถานะ review ของ audit; สำรองร่วมกับ logs',
    ),
);

echo json_encode(array(
    'ok' => true,
    'generated_at' => date('c'),
    'backup_hints' => $hints,
    'probes' => array(
        'workflow_state' => '/api/workflow-state.php',
        'workflow_transitions' => '/api/workflow-transition-view.php?limit=1',
        'audit_view' => '/api/audit-view.php?limit=1',
    ),
));
