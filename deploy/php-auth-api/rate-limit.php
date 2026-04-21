<?php
function maybe_cleanup_logs() {
    static $done = false;
    if ($done) return;
    $done = true;

    // Run occasionally to avoid overhead on every request.
    if (mt_rand(1, 200) !== 1) return;

    $logsDir = __DIR__ . '/logs';
    if (!is_dir($logsDir)) return;

    cleanup_jsonl_log_file($logsDir . '/audit.log', 90);
    cleanup_jsonl_log_file($logsDir . '/security.log', 90);
    cleanup_ratelimit_state_files($logsDir . '/ratelimit', 2);
}

function cleanup_jsonl_log_file($filePath, $retainDays) {
    if (!file_exists($filePath)) return;
    $lines = @file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || count($lines) === 0) return;

    $keepSince = time() - ($retainDays * 24 * 60 * 60);
    $kept = array();
    foreach ($lines as $line) {
        $row = json_decode($line, true);
        if (!is_array($row) || !isset($row['ts'])) continue;
        $ts = strtotime((string)$row['ts']);
        if ($ts === false) continue;
        if ($ts >= $keepSince) $kept[] = $line;
    }

    // Keep file compact; if everything is expired, leave empty file.
    $newContent = '';
    if (count($kept) > 0) $newContent = implode(PHP_EOL, $kept) . PHP_EOL;
    @file_put_contents($filePath, $newContent, LOCK_EX);
}

function cleanup_ratelimit_state_files($dirPath, $maxAgeDays) {
    if (!is_dir($dirPath)) return;
    $maxAge = $maxAgeDays * 24 * 60 * 60;
    $now = time();
    $entries = @scandir($dirPath);
    if (!is_array($entries)) return;
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..' || $name === '.htaccess') continue;
        $path = $dirPath . '/' . $name;
        if (!is_file($path)) continue;
        $mtime = @filemtime($path);
        if ($mtime === false) continue;
        if (($now - $mtime) > $maxAge) {
            @unlink($path);
        }
    }
}

function client_ip_for_rate_limit() {
    if (isset($_SERVER['REMOTE_ADDR']) && $_SERVER['REMOTE_ADDR'] !== '') {
        return (string)$_SERVER['REMOTE_ADDR'];
    }
    return 'unknown';
}

function log_rate_limit_event($bucket, $ip, $retryAfter, $maxRequests, $windowSeconds) {
    $logsDir = __DIR__ . '/logs';
    if (!is_dir($logsDir)) {
        @mkdir($logsDir, 0755, true);
    }
    $logFile = $logsDir . '/security.log';
    $line = json_encode(array(
        'ts' => date('c'),
        'event' => 'rate_limited',
        'bucket' => $bucket,
        'ip' => $ip,
        'retry_after_seconds' => $retryAfter,
        'max_requests' => $maxRequests,
        'window_seconds' => $windowSeconds,
        'request_uri' => isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '',
        'ua' => isset($_SERVER['HTTP_USER_AGENT']) ? (string)$_SERVER['HTTP_USER_AGENT'] : '',
    ), JSON_UNESCAPED_UNICODE);
    @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

function apply_rate_limit($bucket, $maxRequests, $windowSeconds) {
    maybe_cleanup_logs();
    $ip = client_ip_for_rate_limit();
    $key = $bucket . '|' . $ip;
    $dir = __DIR__ . '/logs/ratelimit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $file = $dir . '/' . md5($key) . '.json';
    $now = time();

    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        return true;
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return true;
    }

    $raw = stream_get_contents($fp);
    $state = json_decode($raw, true);
    if (!is_array($state) || !isset($state['start']) || !isset($state['count'])) {
        $state = array('start' => $now, 'count' => 0);
    }

    $start = (int)$state['start'];
    $count = (int)$state['count'];
    if (($now - $start) >= $windowSeconds) {
        $start = $now;
        $count = 0;
    }

    $count++;
    $allowed = $count <= $maxRequests;
    $retryAfter = max(1, $windowSeconds - ($now - $start));

    $newState = json_encode(array('start' => $start, 'count' => $count));
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $newState);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    if (!$allowed) {
        log_rate_limit_event($bucket, $ip, $retryAfter, $maxRequests, $windowSeconds);
        http_response_code(429);
        header('Retry-After: ' . $retryAfter);
        echo json_encode(array(
            'ok' => false,
            'message' => 'rate_limited',
            'retry_after_seconds' => $retryAfter,
        ));
        return false;
    }

    return true;
}
