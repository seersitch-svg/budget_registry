<?php
// ============================================================
// BUDGET REGISTRY — USER MANAGEMENT API
// Admin-only: list, create, update, deactivate users
// ============================================================
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

// All user management requires admin role
requireAdmin();

// Auto-create users table (idempotent)
try {
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(50)  NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        role       ENUM('admin','encoder','viewer') DEFAULT 'encoder',
        full_name  VARCHAR(150),
        is_active  TINYINT(1) DEFAULT 1,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_users_username (username),
        INDEX idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (PDOException $e) {}

switch ($method) {

    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT id, username, role, full_name, is_active, last_login, created_at FROM users WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'User not found', 404);
            respond(true, $row);
        }
        $stmt = $db->query("SELECT id, username, role, full_name, is_active, last_login, created_at FROM users ORDER BY created_at DESC");
        respond(true, $stmt->fetchAll());

    case 'POST':
        $b = getBody();
        if (empty($b['username']))    respond(false, null, 'Username is required', 400);
        if (empty($b['password']))    respond(false, null, 'Password is required', 400);
        if (strlen($b['password']) < 6) respond(false, null, 'Password must be at least 6 characters', 400);
        if (!in_array($b['role'] ?? 'encoder', ['admin','encoder','viewer'], true))
            respond(false, null, 'Invalid role', 400);

        // Check duplicate
        $dup = $db->prepare("SELECT id FROM users WHERE username=?");
        $dup->execute([$b['username']]);
        if ($dup->fetch()) respond(false, null, "Username '{$b['username']}' already exists", 409);

        $stmt = $db->prepare("INSERT INTO users (username, password, role, full_name, is_active) VALUES (?,?,?,?,1)");
        $stmt->execute([
            trim($b['username']),
            password_hash($b['password'], PASSWORD_DEFAULT),
            $b['role']      ?? 'encoder',
            trim($b['fullName'] ?? ''),
        ]);
        respond(true, ['id' => (int)$db->lastInsertId()], 'User created', 201);

    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        $exists = $db->prepare("SELECT id, username FROM users WHERE id=?");
        $exists->execute([$id]);
        $user = $exists->fetch();
        if (!$user) respond(false, null, 'User not found', 404);

        // Prevent demoting the only admin
        if (isset($b['role']) && $b['role'] !== 'admin') {
            $adminCount = $db->query("SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=1")->fetchColumn();
            $isAdmin = $db->prepare("SELECT role FROM users WHERE id=?");
            $isAdmin->execute([$id]);
            $curRole = $isAdmin->fetchColumn();
            if ($curRole === 'admin' && (int)$adminCount <= 1) {
                respond(false, null, 'Cannot demote the only active admin', 400);
            }
        }

        // Build update query
        $sets = [];
        $params = [];

        if (!empty($b['fullName'])) { $sets[] = 'full_name=?'; $params[] = trim($b['fullName']); }
        if (isset($b['role']))      { $sets[] = 'role=?';      $params[] = $b['role']; }
        if (isset($b['isActive']))  { $sets[] = 'is_active=?'; $params[] = (int)(bool)$b['isActive']; }
        if (!empty($b['password'])) {
            if (strlen($b['password']) < 6) respond(false, null, 'Password must be at least 6 characters', 400);
            $sets[] = 'password=?';
            $params[] = password_hash($b['password'], PASSWORD_DEFAULT);
        }

        if (empty($sets)) respond(false, null, 'No fields to update', 400);
        $params[] = $id;
        $db->prepare("UPDATE users SET " . implode(',', $sets) . " WHERE id=?")->execute($params);
        respond(true, null, 'User updated');

    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);

        // Prevent deleting yourself
        if ($id == $_SESSION['user_id']) respond(false, null, 'Cannot delete your own account', 400);

        // Prevent deleting last admin
        $adminCheck = $db->prepare("SELECT role FROM users WHERE id=?");
        $adminCheck->execute([$id]);
        $row = $adminCheck->fetch();
        if (!$row) respond(false, null, 'User not found', 404);
        if ($row['role'] === 'admin') {
            $adminCount = $db->query("SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=1")->fetchColumn();
            if ((int)$adminCount <= 1) respond(false, null, 'Cannot delete the only admin', 400);
        }

        // Soft-delete (deactivate) instead of hard delete to preserve audit trail
        $db->prepare("UPDATE users SET is_active=0 WHERE id=?")->execute([$id]);
        respond(true, null, 'User deactivated');

    default:
        respond(false, null, 'Method not allowed', 405);
}
