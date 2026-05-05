<?php
// ============================================================
// BUDGET REGISTRY — AUDIT LOG API
// Records CREATE/UPDATE/DELETE actions per module
// ============================================================
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

// Auto-create audit_log table if not present
try {
    $db->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        action     ENUM('CREATE','UPDATE','DELETE') NOT NULL,
        module     VARCHAR(50) NOT NULL,
        record_id  INT NOT NULL,
        record_ref VARCHAR(100),
        summary    TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_module (module),
        INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (PDOException $e) { /* already exists */ }

switch ($method) {

    case 'GET':
        $module = $_GET['module'] ?? null;
        $limit  = min((int)($_GET['limit'] ?? 50), 200);
        if ($module) {
            $stmt = $db->prepare(
                "SELECT * FROM audit_log WHERE module=? ORDER BY created_at DESC LIMIT ?"
            );
            $stmt->execute([$module, $limit]);
        } else {
            $stmt = $db->prepare(
                "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?"
            );
            $stmt->execute([$limit]);
        }
        respond(true, $stmt->fetchAll());

    case 'POST':
        $b = getBody();
        if (empty($b['action']) || empty($b['module']) || !isset($b['recordId'])) {
            respond(false, null, 'action, module, recordId required', 400);
        }
        $db->prepare("
            INSERT INTO audit_log (action, module, record_id, record_ref, summary)
            VALUES (?,?,?,?,?)
        ")->execute([
            strtoupper($b['action']),
            $b['module'],
            (int)$b['recordId'],
            $b['recordRef'] ?? null,
            $b['summary']   ?? null,
        ]);
        respond(true, ['id' => (int)$db->lastInsertId()], 'Logged', 201);

    default:
        respond(false, null, 'Method not allowed', 405);
}
