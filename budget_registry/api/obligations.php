<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

// ── Auto-migrate: add new columns if not yet present ─────────────────────────
static $ob_migrated = false;
if (!$ob_migrated) {
    $ob_migrated = true;
    foreach ([
        'lot_number'         => 'INT DEFAULT NULL',
        'selected_entries'   => 'JSON DEFAULT NULL',
        'utility_elec_acct'  => "VARCHAR(100) DEFAULT NULL",
        'utility_water_acct' => "VARCHAR(100) DEFAULT NULL",
    ] as $col => $def) {
        try { $db->exec("ALTER TABLE obligations ADD COLUMN IF NOT EXISTS `{$col}` {$def}"); }
        catch (PDOException $e) { /* already exists */ }
    }
    // Also migrate earmarks
    foreach (['obligated_amount' => 'DECIMAL(15,2) DEFAULT 0',
               'remaining_amount'=> 'DECIMAL(15,2) DEFAULT 0'] as $col => $def) {
        try { $db->exec("ALTER TABLE earmarks ADD COLUMN IF NOT EXISTS `{$col}` {$def}"); }
        catch (PDOException $e) { /* already exists */ }
    }
}

// ── Helper: mark/unmark specific earmark lots based on selected entries ───────
function updateEarmarkLots(PDO $db, int $earmarkId, array $selectedEntries,
                            int $obligationId, bool $obligate): void
{
    $stmt = $db->prepare("SELECT lots FROM earmarks WHERE id=?");
    $stmt->execute([$earmarkId]);
    $row = $stmt->fetch();
    if (!$row) return;

    $lots = json_decode($row['lots'] ?? '[]', true) ?: [];

    if (empty($lots)) {
        // No lot structure — whole earmark toggle
        $db->prepare("UPDATE earmarks SET is_obligated=?, obligated_amount=total_amount,
                      remaining_amount = CASE WHEN ? = 0 THEN total_amount ELSE 0 END
                      WHERE id=?")
           ->execute([$obligate ? 1 : 0, $obligate ? 1 : 0, $earmarkId]);
        return;
    }

    // Build set of lot indices from selectedEntries (lotNumber is 1-based)
    $lotIndices = [];
    foreach ($selectedEntries as $entry) {
        $lotNum = (int)($entry['lotNumber'] ?? 0);
        $li     = $lotNum > 0 ? $lotNum - 1 : (int)($entry['lotIdx'] ?? -1);
        if ($li >= 0 && $li < count($lots)) $lotIndices[$li] = true;
    }
    if (empty($lotIndices)) {
        // No specific lots — apply to all
        for ($i = 0; $i < count($lots); $i++) $lotIndices[$i] = true;
    }

    // Apply obligation status to matched lots
    foreach ($lotIndices as $li => $_) {
        if (isset($lots[$li])) {
            $lots[$li]['is_obligated']  = $obligate;
            $lots[$li]['obligation_id'] = $obligate ? $obligationId : null;
        }
    }

    // Recalculate totals
    $total = $obligated = 0.0;
    foreach ($lots as $lot) {
        $lotAmt = array_sum(array_map(
            fn($i) => (float)($i['amount'] ?? $i['totalCost'] ?? 0),
            $lot['items'] ?? []
        ));
        $total += $lotAmt;
        if (!empty($lot['is_obligated'])) $obligated += $lotAmt;
    }
    $allObl = !empty($lots) && array_reduce(
        $lots, fn($c, $l) => $c && !empty($l['is_obligated']), true
    );

    $db->prepare("
        UPDATE earmarks
        SET lots=?, is_obligated=?, obligated_amount=?, remaining_amount=?
        WHERE id=?
    ")->execute([
        json_encode($lots, JSON_UNESCAPED_UNICODE),
        $allObl ? 1 : 0,
        $obligated,
        $total - $obligated,
        $earmarkId,
    ]);
}

switch ($method) {

    case 'GET':
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM obligations WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) respond(false, null, 'Obligation not found', 404);
            respond(true, $row);
        }
        $stmt = $db->query("SELECT * FROM obligations ORDER BY date DESC, id DESC");
        respond(true, $stmt->fetchAll());

    case 'POST':
        $b = getBody();

        if (empty($b['date']))           respond(false, null, 'Date is required', 400);
        if (empty($b['obligationType'])) respond(false, null, 'Obligation type is required', 400);
        if (empty($b['payee']))          respond(false, null, 'Payee is required', 400);
        if (empty($b['particulars']))    respond(false, null, 'Particulars are required', 400);
        if (!isset($b['obligationIncurred']) || $b['obligationIncurred'] <= 0)
            respond(false, null, 'Obligation incurred must be greater than zero', 400);

        $type = $b['obligationType'];
        if (($type === 'Mandatory' || $type === 'Claims') && empty($b['rcId']))
            respond(false, null, 'Responsibility Center is required for ' . $type . ' obligations', 400);
        if ($type === 'Creditor' && empty($b['earmarkId']))
            respond(false, null, 'Earmark is required for Creditor obligations', 400);

        // For partial lot support: don't block if earmark is partially obligated
        // (remaining lots are still available)
        if (!empty($b['earmarkId'])) {
            $emCheck = $db->prepare(
                "SELECT is_obligated, remaining_amount FROM earmarks WHERE id=?"
            );
            $emCheck->execute([$b['earmarkId']]);
            $emRow = $emCheck->fetch();
            if ($emRow && $emRow['is_obligated'] && ($emRow['remaining_amount'] ?? 0) <= 0) {
                respond(false, null,
                    'This earmark is fully obligated — no remaining lots.', 409);
            }
        }

        $db->beginTransaction();
        try {
            // Compute total obligation incurred from per-lot data in selectedEntriesJson
        // This is more accurate than the client-side ob_amount field
        $selectedEntries = [];
        if (!empty($b['selectedEntriesJson'])) {
            $selectedEntries = json_decode($b['selectedEntriesJson'], true) ?: [];
        }
        $perLotTotal = 0.0;
        $processedLotIdxs = [];
        foreach ($selectedEntries as $en) {
            $lotIdx = $en['lotIdx'] ?? null;
            if ($lotIdx !== null && !in_array($lotIdx, $processedLotIdxs)) {
                if (isset($en['obligationIncurred']) && $en['obligationIncurred'] !== null) {
                    $perLotTotal += (float)$en['obligationIncurred'];
                    $processedLotIdxs[] = $lotIdx;
                }
            }
        }
        // Use per-lot total if available, otherwise fall back to submitted amount
        $finalIncurred = $perLotTotal > 0 ? $perLotTotal : ((float)($b['obligationIncurred'] ?? 0));
        if ($finalIncurred <= 0) {
            respond(false, null, 'Obligation incurred must be greater than zero', 400);
        }

        $stmt = $db->prepare("
                INSERT INTO obligations
                    (rc_id, earmark_id, date, quarter, obr_number, obligation_type,
                     payee, pojo_number, particulars, obligation_incurred,
                     account_code, expense_class, activity, lot_number, selected_entries,
                     utility_elec_acct, utility_water_acct)
                VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?)
            ");
            $stmt->execute([
                $b['rcId']                ?? null,
                $b['earmarkId']           ?? null,
                $b['date']                ?? null,
                $b['quarter']             ?? null,
                $b['obrNumber']           ?? null,
                $b['obligationType']      ?? null,
                $b['payee']               ?? null,
                $b['pojoNumber']          ?? null,
                $b['particulars']         ?? null,
                $finalIncurred,
                $b['accountCode']         ?? null,
                $b['expenseClass']        ?? null,
                $b['activity']            ?? null,
                isset($b['lotNumber']) ? (int)$b['lotNumber'] : null,
                $b['selectedEntriesJson'] ?? null,
                $b['utilityElecAcct']     ?? null,
                $b['utilityWaterAcct']    ?? null,
            ]);
            $newId = (int)$db->lastInsertId();

            // Mark specific lots as obligated (partial support)
            if (!empty($b['earmarkId'])) {
                $selectedEntries = [];
                if (!empty($b['selectedEntriesJson'])) {
                    $selectedEntries = json_decode($b['selectedEntriesJson'], true) ?: [];
                }
                updateEarmarkLots($db, (int)$b['earmarkId'],
                                  $selectedEntries, $newId, true);
            }

            $db->commit();
            respond(true, ['id' => $newId], 'Obligation created', 201);
        } catch (Exception $e) {
            $db->rollBack();
            respond(false, null, 'Failed to create obligation: ' . $e->getMessage(), 500);
        }

    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();

        if (empty($b['date']))           respond(false, null, 'Date is required', 400);
        if (empty($b['obligationType'])) respond(false, null, 'Obligation type is required', 400);
        if (empty($b['payee']))          respond(false, null, 'Payee is required', 400);

        $db->beginTransaction();
        try {
            $old = $db->prepare("SELECT earmark_id, selected_entries FROM obligations WHERE id=?");
            $old->execute([$id]);
            $oldRow = $old->fetch();
            if (!$oldRow) { $db->rollBack(); respond(false, null, 'Obligation not found', 404); }

            $oldEarmarkId = $oldRow['earmark_id'] ?? null;
            $newEarmarkId = !empty($b['earmarkId']) ? (int)$b['earmarkId'] : null;

            $stmt = $db->prepare("
                UPDATE obligations SET
                    rc_id=?, earmark_id=?, date=?, quarter=?, obr_number=?,
                    obligation_type=?, payee=?, pojo_number=?, particulars=?,
                    obligation_incurred=?, account_code=?, expense_class=?, activity=?,
                    lot_number=?, selected_entries=?, utility_elec_acct=?, utility_water_acct=?
                WHERE id=?
            ");
            $stmt->execute([
                $b['rcId']                ?? null,
                $newEarmarkId,
                $b['date']                ?? null,
                $b['quarter']             ?? null,
                $b['obrNumber']           ?? null,
                $b['obligationType']      ?? null,
                $b['payee']               ?? null,
                $b['pojoNumber']          ?? null,
                $b['particulars']         ?? null,
                $b['obligationIncurred']  ?? 0,
                $b['accountCode']         ?? null,
                $b['expenseClass']        ?? null,
                $b['activity']            ?? null,
                isset($b['lotNumber']) ? (int)$b['lotNumber'] : null,
                $b['selectedEntriesJson'] ?? null,
                $b['utilityElecAcct']     ?? null,
                $b['utilityWaterAcct']    ?? null,
                $id,
            ]);

            // Un-obligate old earmark lots
            if ($oldEarmarkId) {
                $oldEntries = json_decode($oldRow['selected_entries'] ?? '[]', true) ?: [];
                updateEarmarkLots($db, $oldEarmarkId, $oldEntries, $id, false);
            }
            // Mark new earmark lots
            if ($newEarmarkId) {
                $newEntries = [];
                if (!empty($b['selectedEntriesJson'])) {
                    $newEntries = json_decode($b['selectedEntriesJson'], true) ?: [];
                }
                updateEarmarkLots($db, $newEarmarkId, $newEntries, $id, true);
            }

            $db->commit();
            respond(true, null, 'Obligation updated');
        } catch (Exception $e) {
            $db->rollBack();
            respond(false, null, 'Failed to update obligation: ' . $e->getMessage(), 500);
        }

    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);
        $db->beginTransaction();
        try {
            $row = $db->prepare(
                "SELECT earmark_id, selected_entries FROM obligations WHERE id=?"
            );
            $row->execute([$id]);
            $data = $row->fetch();
            if (!$data) { $db->rollBack(); respond(false, null, 'Obligation not found', 404); }

            $disbCheck = $db->prepare(
                "SELECT COUNT(*) FROM disbursements WHERE obligation_id=?"
            );
            $disbCheck->execute([$id]);
            if ($disbCheck->fetchColumn() > 0) {
                $db->rollBack();
                respond(false, null,
                    'Cannot delete: this obligation has linked disbursements. Delete disbursements first.',
                    409);
            }

            $db->prepare("DELETE FROM obligations WHERE id=?")->execute([$id]);

            // Un-obligate the specific lots that were obligated by this obligation
            if ($data['earmark_id']) {
                $entries = json_decode($data['selected_entries'] ?? '[]', true) ?: [];
                updateEarmarkLots($db, (int)$data['earmark_id'], $entries, $id, false);
            }

            $db->commit();
            respond(true, null, 'Obligation deleted');
        } catch (Exception $e) {
            $db->rollBack();
            respond(false, null, 'Failed to delete obligation: ' . $e->getMessage(), 500);
        }

    default:
        respond(false, null, 'Method not allowed', 405);
}
