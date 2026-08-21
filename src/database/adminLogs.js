const { pool } = require("./db");

function mapAdminLog(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    adminId: row.admin_id,
    adminName: row.admin_name,
    action: row.action,
    productId: row.product_id,
    productName: row.product_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    details: row.details,
    createdAt: row.created_at,
  };
}

async function addAdminLog({
  adminId,
  adminName,
  action,
  productId = null,
  productName = null,
  oldValue = null,
  newValue = null,
  details = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO admin_logs (
        admin_id,
        admin_name,
        action,
        product_id,
        product_name,
        old_value,
        new_value,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      adminId,
      adminName,
      action,
      productId,
      productName,
      oldValue === null ? null : String(oldValue),
      newValue === null ? null : String(newValue),
      details ? JSON.stringify(details) : null,
    ]
  );

  return mapAdminLog(result.rows[0]);
}

async function getAdminLogs() {
  const result = await pool.query(
    `
      SELECT *
      FROM admin_logs
      ORDER BY created_at DESC, id DESC
    `
  );

  return result.rows.map(mapAdminLog);
}

async function getAdminLogCount() {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM admin_logs
    `
  );

  return result.rows[0].total;
}

async function filterAdminLogs({
  adminId = null,
  productId = null,
  action = null,
  startDate = null,
  endDate = null,
} = {}) {
  const conditions = [];
  const values = [];

  if (adminId) {
    values.push(adminId);
    conditions.push(`admin_id = $${values.length}`);
  }

  if (productId) {
    values.push(productId);
    conditions.push(`product_id = $${values.length}`);
  }

  if (action) {
    values.push(`%${action}%`);
    conditions.push(`action ILIKE $${values.length}`);
  }

  if (startDate) {
    values.push(startDate);
    conditions.push(`created_at >= $${values.length}`);
  }

  if (endDate) {
    values.push(endDate);
    conditions.push(`created_at <= $${values.length}`);
  }

  const where =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const result = await pool.query(
    `
      SELECT *
      FROM admin_logs
      ${where}
      ORDER BY created_at DESC, id DESC
    `,
    values
  );

  return result.rows.map(mapAdminLog);
}

/*
  IMPORTANTE:

  Não existe função para apagar logs administrativos.

  O comando +hs limpa apenas a tabela "history".
  Os logs administrativos continuam separados e protegidos.
*/

module.exports = {
  addAdminLog,
  getAdminLogs,
  getAdminLogCount,
  filterAdminLogs,
};
