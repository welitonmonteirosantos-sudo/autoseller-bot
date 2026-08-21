const { pool } = require("./db");

const MAX_WAITLIST = 10;

function mapEntry(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    productId: row.product_id,
    userId: row.user_id,
    username: row.username,
    joinedAt: row.joined_at,
    notifiedAt: row.notified_at,
  };
}

async function joinWaitlist(productId, user) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT *
        FROM waitlist
        WHERE product_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [productId, user.id]
    );

    if (existing.rows.length > 0) {
      const positionResult = await client.query(
        `
          SELECT COUNT(*)::int AS position
          FROM waitlist
          WHERE product_id = $1
            AND joined_at <= $2
        `,
        [
          productId,
          existing.rows[0].joined_at,
        ]
      );

      await client.query("ROLLBACK");

      return {
        success: false,
        reason: "ALREADY_IN_WAITLIST",
        position: positionResult.rows[0].position,
      };
    }

    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM waitlist
        WHERE product_id = $1
      `,
      [productId]
    );

    const total = countResult.rows[0].total;

    if (total >= MAX_WAITLIST) {
      await client.query("ROLLBACK");

      return {
        success: false,
        reason: "WAITLIST_FULL",
      };
    }

    const insertResult = await client.query(
      `
        INSERT INTO waitlist (
          product_id,
          user_id,
          username
        )
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [
        productId,
        user.id,
        user.username,
      ]
    );

    await client.query("COMMIT");

    const entry = mapEntry(insertResult.rows[0]);

    return {
      success: true,
      entry,
      position: total + 1,
      total: total + 1,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function leaveWaitlist(productId, userId) {
  const result = await pool.query(
    `
      DELETE FROM waitlist
      WHERE product_id = $1
        AND user_id = $2
      RETURNING *
    `,
    [productId, userId]
  );

  if (result.rows.length === 0) {
    return {
      success: false,
      reason: "NOT_IN_WAITLIST",
    };
  }

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM waitlist
      WHERE product_id = $1
    `,
    [productId]
  );

  return {
    success: true,
    removed: mapEntry(result.rows[0]),
    total: countResult.rows[0].total,
  };
}

async function removeAfterPurchase(productId, userId) {
  return leaveWaitlist(productId, userId);
}

async function isInWaitlist(productId, userId) {
  const result = await pool.query(
    `
      SELECT 1
      FROM waitlist
      WHERE product_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [productId, userId]
  );

  return result.rows.length > 0;
}

async function getPosition(productId, userId) {
  const target = await pool.query(
    `
      SELECT joined_at
      FROM waitlist
      WHERE product_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [productId, userId]
  );

  if (target.rows.length === 0) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS position
      FROM waitlist
      WHERE product_id = $1
        AND joined_at <= $2
    `,
    [
      productId,
      target.rows[0].joined_at,
    ]
  );

  return result.rows[0].position;
}

async function getWaitlist(productId) {
  const result = await pool.query(
    `
      SELECT *
      FROM waitlist
      WHERE product_id = $1
      ORDER BY joined_at ASC, id ASC
    `,
    [productId]
  );

  return result.rows.map(mapEntry);
}

async function getWaitlistCount(productId) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM waitlist
      WHERE product_id = $1
    `,
    [productId]
  );

  return result.rows[0].total;
}

async function getNext(productId) {
  const result = await pool.query(
    `
      SELECT *
      FROM waitlist
      WHERE product_id = $1
      ORDER BY joined_at ASC, id ASC
      LIMIT 1
    `,
    [productId]
  );

  return mapEntry(result.rows[0]);
}

async function markNotified(productId, userId) {
  const result = await pool.query(
    `
      UPDATE waitlist
      SET notified_at = NOW()
      WHERE product_id = $1
        AND user_id = $2
      RETURNING *
    `,
    [productId, userId]
  );

  return mapEntry(result.rows[0]);
}

async function clearWaitlist(productId) {
  const result = await pool.query(
    `
      DELETE FROM waitlist
      WHERE product_id = $1
      RETURNING id
    `,
    [productId]
  );

  return result.rowCount;
}

module.exports = {
  MAX_WAITLIST,
  joinWaitlist,
  leaveWaitlist,
  removeAfterPurchase,
  isInWaitlist,
  getPosition,
  getWaitlist,
  getWaitlistCount,
  getNext,
  markNotified,
  clearWaitlist,
};
