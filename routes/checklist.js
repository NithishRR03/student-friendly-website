const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');

const router = express.Router();

const VALID_ITEMS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

router.get('/', requireUser, (req, res) => {
  const rows = db
    .prepare('SELECT item_id, checked FROM checklist_items WHERE user_id = ?')
    .all(req.user.id);
  const state = {};
  for (const row of rows) state[row.item_id] = !!row.checked;
  res.json({ state });
});

router.put('/:itemId', requireUser, (req, res) => {
  const { itemId } = req.params;
  const { checked } = req.body || {};
  if (!VALID_ITEMS.includes(itemId)) {
    return res.status(400).json({ error: 'unknown_item' });
  }
  db.prepare(
    `INSERT INTO checklist_items (user_id, item_id, checked, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, item_id) DO UPDATE SET checked = excluded.checked, updated_at = datetime('now')`
  ).run(req.user.id, itemId, checked ? 1 : 0);
  res.json({ ok: true });
});

module.exports = router;
