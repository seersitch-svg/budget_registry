<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

// ── Auto-migrate: ensure obligated_amount and remaining_amount columns exist ──
static $em_migrated = false;
if (!$em_migrated) {
    $em_migrated = true;
    $cols = [
        'obligated_amount' => 'DECIMAL(18,2) DEFAULT 0',
        'remaining_amount' => 'DECIMAL(18,2) DEFAULT NULL',
    ];
    foreach ($cols as $col => $def) {
        try {
            $db->exec("ALTER TABLE earmarks ADD COLUMN IF NOT EXISTS `{$col}` {$def}");
        } catch (PDOException $e) {}
    }
}

switch ($method) {

    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM earmarks WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'Earmark not found', 404);
            decodeRow($row, ['lots']);
            respond(true, $row);
        }
        $stmt = $db->query("SELECT * FROM earmarks ORDER BY date DESC, id DESC");
        $rows = $stmt->fetchAll();
        decodeRows($rows, ['lots']);
        respond(true, $rows);

    case 'POST':
        $b = getBody();

        if (empty($b['rcId']))          respond(false, null, 'RC is required', 400);
        if (empty($b['date']))          respond(false, null, 'Date is required', 400);
        if (empty($b['earmarkNumber'])) respond(false, null, 'Earmark number is required', 400);

        $dup = $db->prepare("SELECT id FROM earmarks WHERE earmark_number = ?");
        $dup->execute([$b['earmarkNumber']]);
        if ($dup->fetch()) {
            respond(false, null, 'Earmark number "' . $b['earmarkNumber'] . '" already exists. Refresh the page and try again.', 409);
        }

        try {
            $totalAmt = (float)($b['totalAmount'] ?? 0);
            $stmt = $db->prepare("
                INSERT INTO earmarks
                    (rc_id, date, quarter, earmark_number, particulars, total_amount,
                     lots, is_obligated, obligated_amount, remaining_amount)
                VALUES (?,?,?,?,?,?, ?,0,0,?)
            ");
            $stmt->execute([
                $b['rcId']          ?? null,
                $b['date']          ?? null,
                $b['quarter']       ?? null,
                $b['earmarkNumber'] ?? null,
                $b['particulars']   ?? null,
                $totalAmt,
                jsonCol($b['lots']  ?? []),
                $totalAmt,  // remaining = total on creation
            ]);
            respond(true, ['id' => (int)$db->lastInsertId()], 'Earmark created', 201);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                respond(false, null, 'Duplicate earmark number. Please refresh and try again.', 409);
            }
            respond(false, null, 'Database error: ' . $e->getMessage(), 500);
        }

    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        $check = $db->prepare("SELECT is_obligated, lots FROM earmarks WHERE id=?");
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) respond(false, null, 'Earmark not found', 404);

        // Special handler: updateLotObligations — called by emCancelLot in JS
        if (!empty($b['updateLotObligations'])) {
            $lots = json_decode($existing['lots'] ?? '[]', true) ?: [];
            $updates = $b['lotUpdates'] ?? [];
            foreach ($updates as $upd) {
                $li = (int)$upd['lotIndex'];
                if (isset($lots[$li])) {
                    $lots[$li]['is_obligated']  = !empty($upd['is_obligated']);
                    $lots[$li]['obligation_id'] = $upd['obligation_id'] ?? null;
                }
            }
            $lotsJson = json_encode($lots, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            // Recompute totals
            $totalAmount = (float)(
                $db->prepare("SELECT total_amount FROM earmarks WHERE id=?")
                   ->execute([$id]) ? 0 : 0
            );
            $stmt2 = $db->prepare("SELECT total_amount FROM earmarks WHERE id=?");
            $stmt2->execute([$id]);
            $emRow = $stmt2->fetch();
            $totalAmount = (float)($emRow['total_amount'] ?? 0);

            $obligatedAmount = 0.0;
            $allObligated = count($lots) > 0;
            foreach ($lots as $lot) {
                $lotAmt = 0.0;
                foreach ($lot['items'] ?? [] as $item) {
                    $lotAmt += (float)($item['amount'] ?? $item['totalCost'] ?? 0);
                }
                if (!empty($lot['is_obligated'])) {
                    $obligatedAmount += $lotAmt;
                } else {
                    $allObligated = false;
                }
            }
            $remainingAmount = $totalAmount - $obligatedAmount;

            $db->prepare("
                UPDATE earmarks SET
                    lots=?, is_obligated=?, obligated_amount=?, remaining_amount=?
                WHERE id=?
            ")->execute([
                $lotsJson,
                $allObligated ? 1 : 0,
                $obligatedAmount,
                $remainingAmount,
                $id,
            ]);
            respond(true, null, 'Earmark lots updated');
        }

        // Normal edit — only allow if no lots are obligated
        $lots = json_decode($existing['lots'] ?? '[]', true) ?: [];
        $hasObligatedLots = array_filter($lots, fn($l) => !empty($l['is_obligated']));
        if (!empty($hasObligatedLots)) {
            respond(false, null, 'Cannot edit earmark: some lots are already obligated. Cancel those obligations first.', 403);
        }

        if (!empty($b['earmarkNumber'])) {
            $dup = $db->prepare("SELECT id FROM earmarks WHERE earmark_number = ? AND id != ?");
            $dup->execute([$b['earmarkNumber'], $id]);
            if ($dup->fetch()) {
                respond(false, null, 'Earmark number "' . $b['earmarkNumber'] . '" already used by another record.', 409);
            }
        }

        $totalAmt = (float)($b['totalAmount'] ?? 0);
        $stmt = $db->prepare("
            UPDATE earmarks SET
                rc_id=?, date=?, quarter=?, earmark_number=?,
                particulars=?, total_amount=?, lots=?,
                remaining_amount=?
            WHERE id=?
        ");
        $stmt->execute([
            $b['rcId']          ?? null,
            $b['date']          ?? null,
            $b['quarter']       ?? null,
            $b['earmarkNumber'] ?? null,
            $b['particulars']   ?? null,
            $totalAmt,
            jsonCol($b['lots']  ?? []),
            $totalAmt,  // remaining resets to total since no lots are obligated at this point
            $id,
        ]);
        respond(true, null, 'Earmark updated');

    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);
        $check = $db->prepare("SELECT is_obligated, lots FROM earmarks WHERE id=?");
        $check->execute([$id]);
        $row = $check->fetch();
        if (!$row) respond(false, null, 'Earmark not found', 404);

        // Block delete only if ALL lots are obligated (fully obligated)
        $lots = json_decode($row['lots'] ?? '[]', true) ?: [];
        $hasObligatedLots = !empty(array_filter($lots, fn($l) => !empty($l['is_obligated'])));
        if ($hasObligatedLots) {
            respond(false, null, 'Cannot delete earmark: some lots are already obligated. Cancel those obligations first.', 403);
        }

        $db->prepare("DELETE FROM earmarks WHERE id=?")->execute([$id]);
        respond(true, null, 'Earmark deleted');

    default:
        respond(false, null, 'Method not allowed', 405);
}
