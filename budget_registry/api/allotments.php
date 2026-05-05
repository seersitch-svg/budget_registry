<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

switch ($method) {

    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM allotments WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'Allotment not found', 404);
            decodeRow($row, ['account_allocations','activity_allocations']);
            respond(true, $row);
        }
        $stmt = $db->query("
            SELECT a.*, rc.responsibility_center
            FROM allotments a
            LEFT JOIN responsibility_centers rc ON a.rc_id = rc.id
            ORDER BY a.created_at DESC
        ");
        $rows = $stmt->fetchAll();
        decodeRows($rows, ['account_allocations','activity_allocations']);
        respond(true, $rows);

    case 'POST':
        $b = getBody();

        // Validate required fields
        if (empty($b['rcId']))
            respond(false, null, 'Responsibility Center is required', 400);
        if (!isset($b['authorizedAppropriation']) || $b['authorizedAppropriation'] <= 0)
            respond(false, null, 'Authorized appropriation must be greater than zero', 400);
        if (!isset($b['allotmentReceived']))
            respond(false, null, 'Allotment received is required', 400);

        // Prevent duplicate RC allotment
        $check = $db->prepare("SELECT id FROM allotments WHERE rc_id=?");
        $check->execute([$b['rcId']]);
        if ($check->fetch()) {
            respond(false, null, 'This RC already has an allotment. Edit the existing one instead.', 409);
        }

        // Verify RC exists
        $rcCheck = $db->prepare("SELECT id FROM responsibility_centers WHERE id=?");
        $rcCheck->execute([$b['rcId']]);
        if (!$rcCheck->fetch()) {
            respond(false, null, 'Responsibility Center not found', 404);
        }

        try {
            $stmt = $db->prepare("
                INSERT INTO allotments
                    (rc_id, fund_cluster, auth_code, fund_category, rc_name, project_program,
                     authorized_appropriation, adjustment, adjusted_appropriation,
                     allotment_received, unreleased_appropriation,
                     account_allocations, activity_allocations)
                VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?)
            ");
            $stmt->execute([
                $b['rcId']                     ?? null,
                $b['fundCluster']              ?? null,
                $b['authCode']                 ?? null,
                $b['fundCategory']             ?? null,
                $b['rcName']                   ?? null,
                $b['projectProgram']           ?? null,
                $b['authorizedAppropriation']  ?? 0,
                $b['adjustment']               ?? 0,
                $b['adjustedAppropriation']    ?? 0,
                $b['allotmentReceived']        ?? 0,
                $b['unreleasedAppropriation']  ?? 0,
                jsonCol($b['accountAllocations']  ?? []),
                jsonCol($b['activityAllocations'] ?? []),
            ]);
            respond(true, ['id' => (int)$db->lastInsertId()], 'Allotment created', 201);
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        // Validate
        if (!isset($b['authorizedAppropriation']) || $b['authorizedAppropriation'] <= 0)
            respond(false, null, 'Authorized appropriation must be greater than zero', 400);

        // Check allotment exists
        $exists = $db->prepare("SELECT id FROM allotments WHERE id=?");
        $exists->execute([$id]);
        if (!$exists->fetch()) respond(false, null, 'Allotment not found', 404);

        try {
            $stmt = $db->prepare("
                UPDATE allotments SET
                    authorized_appropriation=?, adjustment=?, adjusted_appropriation=?,
                    allotment_received=?, unreleased_appropriation=?,
                    account_allocations=?, activity_allocations=?
                WHERE id=?
            ");
            $stmt->execute([
                $b['authorizedAppropriation']  ?? 0,
                $b['adjustment']               ?? 0,
                $b['adjustedAppropriation']    ?? 0,
                $b['allotmentReceived']        ?? 0,
                $b['unreleasedAppropriation']  ?? 0,
                jsonCol($b['accountAllocations']  ?? []),
                jsonCol($b['activityAllocations'] ?? []),
                $id,
            ]);
            respond(true, null, 'Allotment updated');
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);

        // Check allotment exists
        $exists = $db->prepare("SELECT rc_id FROM allotments WHERE id=?");
        $exists->execute([$id]);
        $row = $exists->fetch();
        if (!$row) respond(false, null, 'Allotment not found', 404);

        // Check for linked earmarks
        $emCheck = $db->prepare("SELECT COUNT(*) FROM earmarks WHERE rc_id=?");
        $emCheck->execute([$row['rc_id']]);
        if ($emCheck->fetchColumn() > 0) {
            respond(false, null, 'Cannot delete: this RC has linked earmarks. Delete earmarks first.', 409);
        }

        try {
            $db->prepare("DELETE FROM allotments WHERE id=?")->execute([$id]);
            respond(true, null, 'Allotment deleted');
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    default:
        respond(false, null, 'Method not allowed', 405);
}
