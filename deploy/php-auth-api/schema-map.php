<?php
// Deterministic schema mapping for legacy databases.
// strict=true: do not auto-fallback to other tables/columns when mapping fails.
return array(
    'money' => array(
        'strict' => true,
        'table_candidates' => array('money_cur_sum', 'money_sum', 'money_cur', 'momey_sum', 'momey'),
        'columns' => array(
            'id' => 'ID_per',
            'name' => 'Name',
            'amount' => 'money',
            'date' => 'Mouth',
        ),
    ),
    'slip' => array(
        'strict' => true,
        'table_candidates' => array('money_cur_sum', 'money_sum', 'money_cur', 'momey_sum', 'momey'),
        'columns' => array(
            'month' => 'Mouth',
            'employeeId' => 'ID_per',
            'fullName' => 'Name',
            'net' => 'money',
        ),
    ),
    'tax' => array(
        'strict' => true,
        'table' => 'money_em_sum',
        'columns' => array(
            'id' => 'ID_per',
            'name' => 'Name',
            'year' => 'Year',
        ),
    ),
);
