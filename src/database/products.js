const { pool } = require("./db");
const config = require("../config");

async function initializeProducts() {
  for (const productConfig of Object.values(config.products)) {
    await pool.query(
      `
        INSERT INTO products (
          id,
          name,
          rap,
          price,
          stock,
          active,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 0, TRUE, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          rap = EXCLUDED.rap,
          updated_at = NOW()
      `,
      [
        productConfig.id,
        productConfig.name,
        productConfig.rap,
        productConfig.price,
      ]
    );
  }
}

function mapProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    rap: Number(row.rap),
    price: Number(row.price),
    stock: Number(row.stock),
    active: Boolean(row.active),
    maxQuantity: config.purchase.maxQuantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProducts() {
  const result = await pool.query(
    `
      SELECT *
      FROM products
      ORDER BY rap ASC
    `
  );

  return result.rows.map(mapProduct);
}

async function getProductById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM products
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return mapProduct(result.rows[0]);
}

async function getProductByName(name) {
  if (!name) return null;

  const result = await pool.query(
    `
      SELECT *
      FROM products
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [name]
  );

  return mapProduct(result.rows[0]);
}

async function setPrice(id, price) {
  const newPrice = Number(price);

  if (!Number.isFinite(newPrice) || newPrice < 0) {
    return {
      success: false,
      reason: "INVALID_PRICE",
    };
  }

  const current = await getProductById(id);

  if (!current) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const result = await pool.query(
    `
      UPDATE products
      SET
        price = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, newPrice]
  );

  return {
    success: true,
    oldPrice: current.price,
    newPrice,
    product: mapProduct(result.rows[0]),
  };
}

async function setStock(id, quantity) {
  const newStock = Number(quantity);

  if (!Number.isInteger(newStock) || newStock < 0) {
    return {
      success: false,
      reason: "INVALID_STOCK",
    };
  }

  const current = await getProductById(id);

  if (!current) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const result = await pool.query(
    `
      UPDATE products
      SET
        stock = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, newStock]
  );

  return {
    success: true,
    oldStock: current.stock,
    newStock,
    product: mapProduct(result.rows[0]),
  };
}

async function addStock(id, quantity) {
  const amount = Number(quantity);

  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      success: false,
      reason: "INVALID_QUANTITY",
    };
  }

  const current = await getProductById(id);

  if (!current) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const result = await pool.query(
    `
      UPDATE products
      SET
        stock = stock + $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, amount]
  );

  const product = mapProduct(result.rows[0]);

  return {
    success: true,
    added: amount,
    oldStock: current.stock,
    newStock: product.stock,
    product,
  };
}

async function removeStock(id, requestedQuantity) {
  const requested = Number(requestedQuantity);

  if (!Number.isInteger(requested) || requested <= 0) {
    return {
      success: false,
      reason: "INVALID_QUANTITY",
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT *
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    const product = mapProduct(result.rows[0]);

    if (!product) {
      await client.query("ROLLBACK");

      return {
        success: false,
        reason: "PRODUCT_NOT_FOUND",
      };
    }

    if (!product.active) {
      await client.query("ROLLBACK");

      return {
        success: false,
        reason: "PRODUCT_DISABLED",
        product,
      };
    }

    if (product.stock <= 0) {
      await client.query("ROLLBACK");

      return {
        success: false,
        reason: "OUT_OF_STOCK",
        available: 0,
        product,
      };
    }

    const quantity = Math.min(
      requested,
      product.stock,
      config.purchase.maxQuantity
    );

    const update = await client.query(
      `
        UPDATE products
        SET
          stock = stock - $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id, quantity]
    );

    await client.query("COMMIT");

    const updatedProduct = mapProduct(update.rows[0]);

    return {
      success: true,
      requested,
      quantity,
      adjusted: quantity !== requested,
      oldStock: product.stock,
      newStock: updatedProduct.stock,
      product: updatedProduct,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setActive(id, active) {
  const current = await getProductById(id);

  if (!current) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const result = await pool.query(
    `
      UPDATE products
      SET
        active = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id, Boolean(active)]
  );

  return {
    success: true,
    oldStatus: current.active,
    newStatus: Boolean(active),
    product: mapProduct(result.rows[0]),
  };
}

async function isAvailable(id) {
  const product = await getProductById(id);

  return Boolean(
    product &&
    product.active &&
    product.stock > 0
  );
}

async function calculateTotal(id, quantity) {
  const amount = Number(quantity);

  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > config.purchase.maxQuantity
  ) {
    return null;
  }

  const product = await getProductById(id);

  if (!product) {
    return null;
  }

  return Number(
    (product.price * amount).toFixed(2)
  );
}

module.exports = {
  initializeProducts,
  getProducts,
  getProductById,
  getProductByName,
  setPrice,
  setStock,
  addStock,
  removeStock,
  setActive,
  isAvailable,
  calculateTotal,
};
