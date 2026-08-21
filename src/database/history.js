const { pool } = require("./db");

function mapHistory(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    type: row.type,
    userId: row.user_id,
    username: row.username,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity === null ? null : Number(row.quantity),
    details: row.details,
    createdAt: row.created_at,
  };
}

async function addHistory({
  type,
  userId = null,
  username = null,
  productId = null,
  productName = null,
  quantity = null,
  details = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO history (
        type,
        user_id,
        username,
        product_id,
        product_name,
        quantity,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      type,
      userId,
      username,
      productId,
      productName,
      quantity,
      details ? JSON.stringify(details) : null,
    ]
  );

  return mapHistory(result.rows[0]);
}

async function getHistory() {
  const result = await pool.query(
    `
      SELECT *
      FROM history
      ORDER BY created_at DESC, id DESC
    `
  );

  return result.rows.map(mapHistory);
}

async function getHistoryCount() {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM history
    `
  );

  return result.rows[0].total;
}

async function removeOldest(amount) {
  const quantity = Number(amount);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  const result = await pool.query(
    `
      DELETE FROM history
      WHERE id IN (
        SELECT id
        FROM history
        ORDER BY created_at ASC, id ASC
        LIMIT $1
      )
      RETURNING id
    `,
    [quantity]
  );

  return result.rowCount;
}

async function filterHistory({
  type = null,
  userId = null,
  productId = null,
} = {}) {
  const conditions = [];
  const values = [];

  if (type) {
    values.push(type);
    conditions.push(`type = $${values.length}`);
  }

  if (userId) {
    values.push(userId);
    conditions.push(`user_id = $${values.length}`);
  }

  if (productId) {
    values.push(productId);
    conditions.push(`product_id = $${values.length}`);
  }

  const where =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `
      SELECT *
      FROM history
      ${where}
      ORDER BY created_at DESC, id DESC
    `,
    values
  );

  return result.rows.map(mapHistory);
}

module.exports = {
  addHistory,
  getHistory,
  getHistoryCount,
  removeOldest,
  filterHistory,
};
