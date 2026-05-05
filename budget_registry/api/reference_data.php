<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = getIdParam();
$db     = getDB();

switch ($method) {

    // ── GET: return all ref data grouped by type ─────────────────
    case 'GET':
        $stmt = $db->query("SELECT * FROM reference_data ORDER BY type, sort_order, code");
        $rows = $stmt->fetchAll();

        // Build structured response identical to client-side FUND_DATA / PROJECT_DATA etc.
        $fund_data     = [];
        $project_data  = [];
        $account_codes = [1 => [], 2 => [], 3 => []];
        $rc_activities = [];

        foreach ($rows as $row) {
            $type   = $row['type'];
            $code   = $row['code'];
            $name   = $row['name'];
            $parent = $row['parent_code'];
            $parent2= $row['parent_code2'];
            $ecNum  = (int)$row['expense_class_num'];

            switch ($type) {
                case 'fund_cluster':
                    if (!isset($fund_data[$code])) {
                        $fund_data[$code] = ['name' => $name, 'authCodes' => []];
                    }
                    break;

                case 'auth_code':
                    // parent = fund_cluster code
                    if ($parent && isset($fund_data[$parent])) {
                        $fund_data[$parent]['authCodes'][$code] = ['name' => $name, 'cats' => []];
                    }
                    break;

                case 'fund_category':
                    // parent = auth_code, parent2 = fund_cluster
                    if ($parent && $parent2 && isset($fund_data[$parent2]['authCodes'][$parent])) {
                        $fund_data[$parent2]['authCodes'][$parent]['cats'][$code] = $name;
                    }
                    break;

                case 'project':
                    if (!isset($project_data[$code])) {
                        $project_data[$code] = ['name' => $name, 'cats' => []];
                    }
                    break;

                case 'project_category':
                    // parent = project code
                    if ($parent && isset($project_data[$parent])) {
                        $project_data[$parent]['cats'][$code] = ['name' => $name, 'subs' => []];
                    }
                    break;

                case 'project_sub':
                    // parent = project_category code, parent2 = project code
                    if ($parent && $parent2 && isset($project_data[$parent2]['cats'][$parent])) {
                        $project_data[$parent2]['cats'][$parent]['subs'][$code] = $name;
                    }
                    break;

                case 'account_code':
                    if ($ecNum >= 1 && $ecNum <= 3) {
                        $account_codes[$ecNum][] = $name; // name is the full code string
                    }
                    break;

                case 'activity':
                    // parent = RC name
                    if ($parent) {
                        if (!isset($rc_activities[$parent])) $rc_activities[$parent] = [];
                        $rc_activities[$parent][] = $name;
                    }
                    break;
            }
        }

        respond(true, [
            'fundData'      => $fund_data,
            'projectData'   => $project_data,
            'accountCodes'  => $account_codes,
            'rcActivities'  => $rc_activities,
            'rows'          => $rows, // raw rows for settings panel
        ]);

    // ── POST: create a single ref item ───────────────────────────
    case 'POST':
        $b = getBody();
        if (empty($b['type'])) respond(false, null, 'Type is required', 400);
        if (empty($b['code'])) respond(false, null, 'Code is required', 400);

        // Check for duplicate
        $dup = $db->prepare("SELECT id FROM reference_data WHERE type=? AND code=? AND COALESCE(parent_code,'')=? AND COALESCE(parent_code2,'')=?");
        $dup->execute([$b['type'], $b['code'], $b['parentCode'] ?? '', $b['parentCode2'] ?? '']);
        if ($dup->fetch()) {
            respond(false, null, 'This entry already exists', 409);
        }

        $stmt = $db->prepare("
            INSERT INTO reference_data (type, code, name, parent_code, parent_code2, expense_class_num, sort_order)
            VALUES (?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            $b['type']           ?? null,
            $b['code']           ?? null,
            $b['name']           ?? null,
            $b['parentCode']     ?? null,
            $b['parentCode2']    ?? null,
            $b['expenseClassNum'] ?? null,
            $b['sortOrder']      ?? 0,
        ]);
        respond(true, ['id' => (int)$db->lastInsertId()], 'Reference item created', 201);

    // ── PUT: update a ref item ───────────────────────────────────
    case 'PUT':
        if (!$id) respond(false, null, 'ID required', 400);
        $b = getBody();
        $stmt = $db->prepare("
            UPDATE reference_data SET name=?, sort_order=? WHERE id=?
        ");
        $stmt->execute([$b['name'] ?? null, $b['sortOrder'] ?? 0, $id]);
        respond(true, null, 'Reference item updated');

    // ── DELETE: remove a ref item ────────────────────────────────
    case 'DELETE':
        if (!$id) respond(false, null, 'ID required', 400);
        $db->prepare("DELETE FROM reference_data WHERE id=?")->execute([$id]);
        respond(true, null, 'Reference item deleted');

    // ── PATCH: bulk upsert (used when saving entire FUND_DATA/PROJECT_DATA state) ──
    case 'PATCH':
        $b = getBody();
        $type = $b['type'] ?? '';
        if (empty($type)) respond(false, null, 'Type required', 400);

        $db->beginTransaction();
        try {
            // Delete all entries of this type (full replace)
            $db->prepare("DELETE FROM reference_data WHERE type=?")->execute([$type]);
            $items = $b['items'] ?? [];
            $stmt = $db->prepare("
                INSERT INTO reference_data (type, code, name, parent_code, parent_code2, expense_class_num, sort_order)
                VALUES (?,?,?,?,?,?,?)
            ");
            foreach ($items as $i => $item) {
                $stmt->execute([
                    $type,
                    $item['code']           ?? null,
                    $item['name']           ?? null,
                    $item['parentCode']     ?? null,
                    $item['parentCode2']    ?? null,
                    $item['expenseClassNum'] ?? null,
                    $i,
                ]);
            }
            $db->commit();
            respond(true, null, "Bulk updated $type (" . count($items) . " items)");
        } catch (Exception $e) {
            $db->rollBack();
            respond(false, null, 'Bulk update failed: ' . $e->getMessage(), 500);
        }

    default:
        respond(false, null, 'Method not allowed', 405);
}
