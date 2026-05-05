<?php
require_once __DIR__ . '/config.php';
// NO session_start() here — config.php handles it

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();
// ... rest of file unchanged

// Auto-create users table
try {
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','encoder','viewer') DEFAULT 'encoder',
        full_name VARCHAR(150),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // Default admin — password: admin1234
    // Hash generated with: password_hash('admin1234', PASSWORD_DEFAULT)
    $defaultHash = password_hash('admin1234', PASSWORD_DEFAULT);
    $db->exec("INSERT IGNORE INTO users (username,password,role,full_name)
        VALUES ('admin','{$defaultHash}','admin','System Administrator')");
    // If user already exists but with wrong password, reset it
    $checkPw = $db->prepare("SELECT id, password FROM users WHERE username='admin'");
    $checkPw->execute();
    $adminRow = $checkPw->fetch();
    if ($adminRow && !password_verify('admin1234', $adminRow['password'])) {
        $db->prepare("UPDATE users SET password=? WHERE username='admin'")
           ->execute([$defaultHash]);
    }
} catch (PDOException $e) {}

$action = $_GET['action'] ?? '';

if ($action === 'login' && $method === 'POST') {
    $b = getBody();
    $stmt = $db->prepare("SELECT * FROM users WHERE username=? AND is_active=1");
    $stmt->execute([$b['username'] ?? '']);
    $user = $stmt->fetch();
    if ($user && password_verify($b['password'] ?? '', $user['password'])) {
        $_SESSION['user_id']   = $user['id'];
        $_SESSION['username']  = $user['username'];
        $_SESSION['role']      = $user['role'];
        $_SESSION['full_name'] = $user['full_name'];
        respond(true, [
            'id'       => $user['id'],
            'username' => $user['username'],
            'role'     => $user['role'],
            'fullName' => $user['full_name'],
        ], 'Login successful');
    }
    respond(false, null, 'Invalid username or password', 401);
}

if ($action === 'logout') {
    session_destroy();
    respond(true, null, 'Logged out');
}

if ($action === 'me') {
    if (!empty($_SESSION['user_id'])) {
        respond(true, [
            'id'       => $_SESSION['user_id'],
            'username' => $_SESSION['username'],
            'role'     => $_SESSION['role'],
            'fullName' => $_SESSION['full_name'],
        ]);
    }
    respond(false, null, 'Not logged in', 401);
}

if ($action === 'change_password' && $method === 'POST') {
    if (empty($_SESSION['user_id'])) respond(false, null, 'Not logged in', 401);
    $b = getBody();
    $stmt = $db->prepare("SELECT password FROM users WHERE id=?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($b['currentPassword'] ?? '', $user['password'])) {
        respond(false, null, 'Current password is incorrect', 400);
    }
    if (strlen($b['newPassword'] ?? '') < 6) {
        respond(false, null, 'New password must be at least 6 characters', 400);
    }
    $db->prepare("UPDATE users SET password=? WHERE id=?")
       ->execute([password_hash($b['newPassword'], PASSWORD_DEFAULT), $_SESSION['user_id']]);
    respond(true, null, 'Password changed successfully');
}

respond(false, null, 'Unknown action', 400);
