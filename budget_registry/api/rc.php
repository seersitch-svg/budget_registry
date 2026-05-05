<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

// Auto-migrate: ensure all new columns exist (safe for existing installations)
$migrate_cols = [
    'signatories'      => 'JSON',
    'financing_source' => 'VARCHAR(255) DEFAULT NULL',
    'dept_code'        => 'VARCHAR(100) DEFAULT NULL',
    'agency_code'      => 'VARCHAR(100) DEFAULT NULL',
    'operating_unit'   => 'VARCHAR(100) DEFAULT NULL',
    'lower_unit'       => 'VARCHAR(100) DEFAULT NULL',
];
foreach ($migrate_cols as $col => $def) {
    try {
        $db->exec("ALTER TABLE responsibility_centers ADD COLUMN IF NOT EXISTS `{$col}` {$def}");
    } catch (PDOException $e) { /* already exists or unsupported — ignore */ }
}

switch ($method) {

    // ── GET: list all or single ──────────────────────────────
    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM responsibility_centers WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'RC not found', 404);
            decodeRow($row, ['activity_levels','expense_classes','account_codes','signatories']);
            respond(true, $row);
        }
        $stmt = $db->query("SELECT * FROM responsibility_centers ORDER BY created_at DESC");
        $rows = $stmt->fetchAll();
        decodeRows($rows, ['activity_levels','expense_classes','account_codes','signatories']);
        respond(true, $rows);

    // ── POST: create ─────────────────────────────────────────
    case 'POST':
        $b = getBody();

        // Validate required fields
        if (empty($b['date']))                  respond(false, null, 'Date is required', 400);
        if (empty($b['authType']))              respond(false, null, 'Authorization type is required', 400);
        if (empty($b['payee']))                 respond(false, null, 'Payee is required', 400);
        if (empty($b['fundCluster']))           respond(false, null, 'Fund cluster is required', 400);
        if (empty($b['authCode']))              respond(false, null, 'Authorization code is required', 400);
        if (empty($b['fundCategory']))          respond(false, null, 'Fund category is required', 400);
        if (empty($b['responsibilityCenter']))  respond(false, null, 'Responsibility center name is required', 400);
        if (empty($b['projectProgram']))        respond(false, null, 'Project/Program is required', 400);

        if ($b['authType'] === 'SARO' && empty($b['authReference']))
            respond(false, null, 'SARO number is required', 400);
        if ($b['authType'] === 'ASA' && empty($b['authReference']))
            respond(false, null, 'ASA number is required', 400);

        try {
            $stmt = $db->prepare("
                INSERT INTO responsibility_centers
                    (date, auth_type, auth_reference, payee, particulars,
                     fund_cluster, financing_source, auth_code, fund_category, full_funding_source,
                     dept_code, agency_code, operating_unit, lower_unit,
                     responsibility_center, project_program, project_category,
                     project_sub_category, activity_levels, expense_classes, account_codes, signatories)
                VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?)
            ");
            $stmt->execute([
                $b['date']                 ?? null,
                $b['authType']             ?? null,
                $b['authReference']        ?? null,
                $b['payee']                ?? null,
                $b['particulars']          ?? null,
                $b['fundCluster']          ?? null,
                $b['financingSource']      ?? null,
                $b['authCode']             ?? null,
                $b['fundCategory']         ?? null,
                $b['fullFundingSource']    ?? null,
                $b['deptCode']             ?? null,
                $b['agencyCode']           ?? null,
                $b['operatingUnit']        ?? null,
                $b['lowerUnit']            ?? null,
                $b['responsibilityCenter'] ?? null,
                $b['projectProgram']       ?? null,
                $b['projectCategory']      ?? null,
                $b['projectSubCategory']   ?? null,
                jsonCol($b['activityLevels'] ?? []),
                jsonCol($b['expenseClasses'] ?? []),
                jsonCol($b['accountCodes']   ?? []),
                jsonCol($b['signatories']    ?? []),
            ]);
            respond(true, ['id' => (int)$db->lastInsertId()], 'RC created', 201);
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    // ── PUT: update ──────────────────────────────────────────
    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        if (empty($b['date']))                  respond(false, null, 'Date is required', 400);
        if (empty($b['authType']))              respond(false, null, 'Authorization type is required', 400);
        if (empty($b['payee']))                 respond(false, null, 'Payee is required', 400);
        if (empty($b['responsibilityCenter']))  respond(false, null, 'Responsibility center name is required', 400);

        $exists = $db->prepare("SELECT id FROM responsibility_centers WHERE id=?");
        $exists->execute([$id]);
        if (!$exists->fetch()) respond(false, null, 'RC not found', 404);

        try {
            $stmt = $db->prepare("
                UPDATE responsibility_centers SET
                    date=?, auth_type=?, auth_reference=?, payee=?, particulars=?,
                    fund_cluster=?, financing_source=?, auth_code=?, fund_category=?, full_funding_source=?,
                    dept_code=?, agency_code=?, operating_unit=?, lower_unit=?,
                    responsibility_center=?, project_program=?, project_category=?,
                    project_sub_category=?, activity_levels=?, expense_classes=?, account_codes=?, signatories=?
                WHERE id=?
            ");
            $stmt->execute([
                $b['date']                 ?? null,
                $b['authType']             ?? null,
                $b['authReference']        ?? null,
                $b['payee']                ?? null,
                $b['particulars']          ?? null,
                $b['fundCluster']          ?? null,
                $b['financingSource']      ?? null,
                $b['authCode']             ?? null,
                $b['fundCategory']         ?? null,
                $b['fullFundingSource']    ?? null,
                $b['deptCode']             ?? null,
                $b['agencyCode']           ?? null,
                $b['operatingUnit']        ?? null,
                $b['lowerUnit']            ?? null,
                $b['responsibilityCenter'] ?? null,
                $b['projectProgram']       ?? null,
                $b['projectCategory']      ?? null,
                $b['projectSubCategory']   ?? null,
                jsonCol($b['activityLevels'] ?? []),
                jsonCol($b['expenseClasses'] ?? []),
                jsonCol($b['accountCodes']   ?? []),
                jsonCol($b['signatories']    ?? []),
                $id,
            ]);

            // Cascade changes to linked allotments
            $db->prepare("
                UPDATE allotments SET
                    fund_cluster=?, auth_code=?, fund_category=?, rc_name=?, project_program=?
                WHERE rc_id=?
            ")->execute([
                $b['fundCluster']          ?? null,
                $b['authCode']             ?? null,
                $b['fundCategory']         ?? null,
                $b['responsibilityCenter'] ?? null,
                $b['projectProgram']       ?? null,
                $id,
            ]);

            respond(true, null, 'RC updated');
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    // ── DELETE ───────────────────────────────────────────────
    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);

        $exists = $db->prepare("SELECT id FROM responsibility_centers WHERE id=?");
        $exists->execute([$id]);
        if (!$exists->fetch()) respond(false, null, 'RC not found', 404);

        try {
            $db->prepare("DELETE FROM responsibility_centers WHERE id=?")->execute([$id]);
            respond(true, null, 'RC deleted');
        } catch (PDOException $e) {
            respond(false, null, 'Cannot delete RC: ' . $e->getMessage(), 409);
        }

    default:
        respond(false, null, 'Method not allowed', 405);
}
