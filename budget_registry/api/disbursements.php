<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

switch ($method) {

    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM disbursements WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'Disbursement not found', 404);
            respond(true, $row);
        }
        $stmt = $db->query("SELECT * FROM disbursements ORDER BY date DESC, id DESC");
        respond(true, $stmt->fetchAll());

    case 'POST':
        $b = getBody();

        // Validate required fields
        if (empty($b['obligationId']))  respond(false, null, 'Obligation is required', 400);
        if (empty($b['date']))          respond(false, null, 'Date is required', 400);
        if (empty($b['checkNumber']))   respond(false, null, 'Check/LDDAP-ADA number is required', 400);
        if (!isset($b['netDisbursement']) || $b['netDisbursement'] <= 0)
            respond(false, null, 'Net disbursement must be greater than zero', 400);

        // Verify obligation exists
        $obligCheck = $db->prepare("SELECT id FROM obligations WHERE id=?");
        $obligCheck->execute([$b['obligationId']]);
        if (!$obligCheck->fetch()) {
            respond(false, null, 'Obligation not found', 404);
        }

        try {
            $stmt = $db->prepare("
                INSERT INTO disbursements
                    (obligation_id, obr_number, payee, rc_id, date, check_number,
                     obligation_amount, net_disbursement, tra_amount, total_disbursement)
                VALUES (?,?,?,?,?,?, ?,?,?,?)
            ");
            $stmt->execute([
                $b['obligationId']     ?? null,
                $b['obrNumber']        ?? null,
                $b['payee']            ?? null,
                $b['rcId']             ?? null,
                $b['date']             ?? null,
                $b['checkNumber']      ?? null,
                $b['obligationAmount'] ?? 0,
                $b['netDisbursement']  ?? 0,
                $b['traAmount']        ?? 0,
                $b['totalDisbursement'] ?? 0,
            ]);
            respond(true, ['id' => (int)$db->lastInsertId()], 'Disbursement created', 201);
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        // Validate required fields
        if (empty($b['date']))        respond(false, null, 'Date is required', 400);
        if (empty($b['checkNumber'])) respond(false, null, 'Check/LDDAP-ADA number is required', 400);
        if (!isset($b['netDisbursement']) || $b['netDisbursement'] <= 0)
            respond(false, null, 'Net disbursement must be greater than zero', 400);

        // Check disbursement exists
        $exists = $db->prepare("SELECT id FROM disbursements WHERE id=?");
        $exists->execute([$id]);
        if (!$exists->fetch()) respond(false, null, 'Disbursement not found', 404);

        try {
            $stmt = $db->prepare("
                UPDATE disbursements SET
                    date=?, check_number=?,
                    net_disbursement=?, tra_amount=?, total_disbursement=?
                WHERE id=?
            ");
            $stmt->execute([
                $b['date']             ?? null,
                $b['checkNumber']      ?? null,
                $b['netDisbursement']  ?? 0,
                $b['traAmount']        ?? 0,
                $b['totalDisbursement'] ?? 0,
                $id,
            ]);
            respond(true, null, 'Disbursement updated');
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);

        // Check disbursement exists
        $exists = $db->prepare("SELECT id FROM disbursements WHERE id=?");
        $exists->execute([$id]);
        if (!$exists->fetch()) respond(false, null, 'Disbursement not found', 404);

        try {
            $db->prepare("DELETE FROM disbursements WHERE id=?")->execute([$id]);
            respond(true, null, 'Disbursement deleted');
        } catch (PDOException $e) {
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    default:
        respond(false, null, 'Method not allowed', 405);
}
