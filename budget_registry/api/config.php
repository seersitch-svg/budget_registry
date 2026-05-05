<?php
declare(strict_types=1);

define('APP_NAME',    'Budget Registry System');
define('APP_VERSION', '3.1.0');
define('APP_ENV',     getenv('APP_ENV') ?: 'development');

define('DB_HOST',    getenv('DB_HOST') ?: 'localhost');
define('DB_PORT',    (int)(getenv('DB_PORT') ?: 3306));
define('DB_NAME',    getenv('DB_NAME') ?: 'budget_registry');
define('DB_USER',    getenv('DB_USER') ?: 'root');
define('DB_PASS',    getenv('DB_PASS') ?: '');
define('DB_CHARSET', 'utf8mb4');

if (APP_ENV === 'production') {
    ini_set('display_errors', '0');
    error_reporting(0);
} else {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
}

// ── FIX: Guard against double session_start() ─────────────────
if (session_status() === PHP_SESSION_NONE && $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_strict_mode', '1');
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0, 'path' => '/', 'domain' => '',
            'secure' => false, 'httponly' => true, 'samesite' => 'Lax',
        ]);
    }
    session_start();
}

// ── FIX: CORS must echo specific origin for credentials to work ─
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

if (!empty($origin)) {
    // Echo back the exact requesting origin — required for credentials: 'include'
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
} else {
    // Same-origin request (no Origin header) — no CORS header needed
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function validateCSRF(): void
{
    $method = $_SERVER['REQUEST_METHOD'];
    if (in_array($method, ['GET', 'OPTIONS', 'HEAD'], true)) return;
    $script = basename($_SERVER['SCRIPT_FILENAME'] ?? '');
    if ($script === 'auth.php' && ($_GET['action'] ?? '') === 'login') return;
    $xrw = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (!empty($xrw)) {
        $clientToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!empty($clientToken)) $_SESSION['csrf_token'] = $clientToken;
        return;
    }
    $clientToken  = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $sessionToken = $_SESSION['csrf_token'] ?? '';
    if (empty($sessionToken)) {
        if (!empty($clientToken)) $_SESSION['csrf_token'] = $clientToken;
        return;
    }
    if (empty($clientToken) || !hash_equals($sessionToken, $clientToken)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'CSRF token invalid or missing']);
        exit;
    }
}

function requireAuth(): array
{
    if (empty($_SESSION['user_id'])) respond(false, null, 'Authentication required', 401);
    return ['id' => $_SESSION['user_id'], 'username' => $_SESSION['username'], 'role' => $_SESSION['role']];
}
function requireRole(string ...$roles): array
{
    $user = requireAuth();
    if (!in_array($user['role'], $roles, true))
        respond(false, null, 'Insufficient permissions', 403);
    return $user;
}
function requireEncoder(): array { return requireRole('admin', 'encoder'); }
function requireAdmin(): array   { return requireRole('admin'); }

validateCSRF();

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_PERSISTENT         => false,
        PDO::MYSQL_ATTR_FOUND_ROWS   => true,
    ];
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        ensureTables($pdo);
        ensureIndexes($pdo);
    } catch (PDOException $e) {
        $detail = APP_ENV === 'production' ? 'A database error occurred.' : $e->getMessage();
        http_response_code(503);
        echo json_encode(['success' => false, 'error' => 'Database connection failed', 'detail' => $detail], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $pdo;
}

function ensureTables(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS responsibility_centers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE, auth_type VARCHAR(10), auth_reference VARCHAR(100),
        payee VARCHAR(255), particulars TEXT,
        fund_cluster VARCHAR(50), financing_source VARCHAR(255),
        auth_code VARCHAR(50), fund_category VARCHAR(100), full_funding_source VARCHAR(255),
        dept_code VARCHAR(100), agency_code VARCHAR(100),
        operating_unit VARCHAR(100), lower_unit VARCHAR(100),
        responsibility_center VARCHAR(255), project_program VARCHAR(255),
        project_category VARCHAR(255), project_sub_category VARCHAR(255),
        activity_levels JSON, expense_classes JSON, account_codes JSON, signatories JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS allotments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rc_id INT NOT NULL, fund_cluster VARCHAR(50), auth_code VARCHAR(50),
        fund_category VARCHAR(100), rc_name VARCHAR(255), project_program VARCHAR(255),
        authorized_appropriation DECIMAL(18,2) DEFAULT 0, adjustment DECIMAL(18,2) DEFAULT 0,
        adjusted_appropriation DECIMAL(18,2) DEFAULT 0, allotment_received DECIMAL(18,2) DEFAULT 0,
        unreleased_appropriation DECIMAL(18,2) DEFAULT 0,
        account_allocations JSON, activity_allocations JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS earmarks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rc_id INT NOT NULL, date DATE, quarter VARCHAR(20),
        earmark_number VARCHAR(50) UNIQUE, particulars TEXT,
        total_amount DECIMAL(18,2) DEFAULT 0, lots JSON,
        is_obligated TINYINT(1) DEFAULT 0,
        obligated_amount DECIMAL(18,2) DEFAULT 0,
        remaining_amount DECIMAL(18,2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS obligations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rc_id INT, earmark_id INT, date DATE, quarter VARCHAR(20),
        obr_number VARCHAR(50), obligation_type VARCHAR(30),
        payee VARCHAR(255), pojo_number VARCHAR(100), particulars TEXT,
        obligation_incurred DECIMAL(18,2) DEFAULT 0,
        account_code VARCHAR(255), expense_class VARCHAR(100), activity VARCHAR(255),
        lot_number INT DEFAULT NULL, selected_entries JSON DEFAULT NULL,
        utility_elec_acct VARCHAR(100) DEFAULT NULL,
        utility_water_acct VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS disbursements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        obligation_id INT NOT NULL, obr_number VARCHAR(50),
        payee VARCHAR(255), rc_id INT, date DATE, check_number VARCHAR(100),
        obligation_amount DECIMAL(18,2) DEFAULT 0,
        net_disbursement DECIMAL(18,2) DEFAULT 0,
        tra_amount DECIMAL(18,2) DEFAULT 0,
        total_disbursement DECIMAL(18,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS reference_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL, code VARCHAR(255), name TEXT,
        parent_code VARCHAR(255), parent_code2 VARCHAR(255),
        expense_class_num TINYINT, sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','encoder','viewer') DEFAULT 'encoder',
        full_name VARCHAR(150), is_active TINYINT(1) DEFAULT 1,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action ENUM('CREATE','UPDATE','DELETE') NOT NULL,
        module VARCHAR(50) NOT NULL, record_id INT NOT NULL,
        record_ref VARCHAR(100), summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Seed default admin
    $count = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($count === 0) {
        $hash = password_hash('admin1234', PASSWORD_DEFAULT);
        $pdo->prepare("INSERT IGNORE INTO users (username,password,role,full_name) VALUES (?,?,'admin','System Administrator')")
            ->execute(['admin', $hash]);
    }
}

function ensureIndexes(PDO $pdo): void
{
    $indexes = [
        ['obligations',   'idx_ob_rc_id',        'rc_id'],
        ['obligations',   'idx_ob_earmark_id',    'earmark_id'],
        ['obligations',   'idx_ob_date',          'date'],
        ['obligations',   'idx_ob_type',          'obligation_type'],
        ['disbursements', 'idx_db_obligation_id', 'obligation_id'],
        ['disbursements', 'idx_db_date',          'date'],
        ['earmarks',      'idx_em_rc_id',         'rc_id'],
        ['earmarks',      'idx_em_date',          'date'],
        ['allotments',    'idx_al_rc_id',         'rc_id'],
        ['audit_log',     'idx_audit_module',     'module'],
    ];
    foreach ($indexes as [$table, $idxName, $col]) {
        try {
            $exists = $pdo->query("SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE table_schema=DATABASE() AND table_name='$table' AND index_name='$idxName'")->fetchColumn();
            if (!$exists) $pdo->exec("ALTER TABLE `$table` ADD INDEX `$idxName` (`$col`)");
        } catch (PDOException $e) {}
    }
}

function respond(bool $success, mixed $data = null, string $message = '', int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['success'=>$success,'data'=>$data,'message'=>$message,'timestamp'=>date('Y-m-d H:i:s')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function respondError(string $message, int $code = 400): void { respond(false, null, $message, $code); }
function getBody(): array
{
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) respondError('Invalid JSON: '.json_last_error_msg(), 400);
    return $decoded ?? [];
}
function getIdParam(string $key = 'id'): ?int
{
    if (!isset($_GET[$key])) return null;
    $val = filter_var($_GET[$key], FILTER_VALIDATE_INT);
    return ($val !== false && $val > 0) ? (int)$val : null;
}
function jsonCol(mixed $val): ?string
{
    if ($val === null) return null;
    if (is_string($val)) return $val;
    $e = json_encode($val, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $e !== false ? $e : null;
}
function decodeRow(array &$row, array $jsonCols): void
{
    foreach ($jsonCols as $col) {
        if (isset($row[$col]) && is_string($row[$col])) {
            $d = json_decode($row[$col], true);
            $row[$col] = json_last_error() === JSON_ERROR_NONE ? $d : [];
        }
    }
}
function decodeRows(array &$rows, array $jsonCols): void
{
    foreach ($rows as &$row) decodeRow($row, $jsonCols);
    unset($row);
}
function requireFields(array $body, array $fields): void
{
    foreach ($fields as $f) {
        if (!isset($body[$f]) || ($body[$f] === '' && $body[$f] !== 0))
            respondError("Field '{$f}' is required.", 400);
    }
}
function floatField(array $body, string $key, float $default = 0.0): float
{ return isset($body[$key]) ? (float)$body[$key] : $default; }
function strField(array $body, string $key, ?string $default = null): ?string
{ return isset($body[$key]) ? trim((string)$body[$key]) : $default; }
function intField(array $body, string $key): ?int
{
    if (!isset($body[$key]) || $body[$key] === '' || $body[$key] === null) return null;
    $val = filter_var($body[$key], FILTER_VALIDATE_INT);
    return $val !== false ? (int)$val : null;
}