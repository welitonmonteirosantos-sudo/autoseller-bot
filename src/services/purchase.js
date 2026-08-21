const { pool } = require("../database/db");

const {
  getProductById,
  removeStock,
  calculateTotal,
} = require("../database/products");

const {
  removeAfterPurchase,
  isInWaitlist,
} = require("../database/waitlist");

const {
  addHistory,
} = require("../database/history");

const {
  createPurchaseTicket,
} = require("./tickets");

async function savePurchase({
  user,
  product,
  quantity,
  total,
  ticketId,
}) {
  const result = await pool.query(
    `
      INSERT INTO purchases (
        user_id,
        username,
        product_id,
        product_name,
        quantity,
        unit_price,
        total,
        ticket_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [
      user.id,
      user.username,
      product.id,
      product.name,
      quantity,
      product.price,
      total,
      ticketId,
      "PENDING",
    ]
  );

  return result.rows[0];
}

async function processPurchase({
  guild,
  user,
  productId,
  quantity,
}) {
  const product = await getProductById(productId);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!product.active) {
    return {
      success: false,
      reason: "PRODUCT_DISABLED",
    };
  }

  const requestedQuantity = Number(quantity);

  if (
    !Number.isInteger(requestedQuantity) ||
    requestedQuantity < 1 ||
    requestedQuantity > 10
  ) {
    return {
      success: false,
      reason: "INVALID_QUANTITY",
    };
  }

  if (product.stock <= 0) {
    return {
      success: false,
      reason: "OUT_OF_STOCK",
    };
  }

  const stockResult = await removeStock(
    productId,
    requestedQuantity
  );

  if (!stockResult.success) {
    return stockResult;
  }

  const finalQuantity = stockResult.quantity;

  const total = await calculateTotal(
    productId,
    finalQuantity
  );

  if (total === null) {
    return {
      success: false,
      reason: "CALCULATION_ERROR",
    };
  }

  const updatedProduct = stockResult.product;

  let ticket;

  try {
    ticket = await createPurchaseTicket({
      guild,
      user,
      product: updatedProduct,
      quantity: finalQuantity,
      total,
    });
  } catch (error) {
    console.error("Erro ao criar ticket:", error);

    await pool.query(
      `
        UPDATE products
        SET
          stock = stock + $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [productId, finalQuantity]
    );

    return {
      success: false,
      reason: "TICKET_CREATION_ERROR",
    };
  }

  let purchase;

  try {
    purchase = await savePurchase({
      user,
      product: updatedProduct,
      quantity: finalQuantity,
      total,
      ticketId: ticket.id,
    });
  } catch (error) {
    console.error(
      "Erro ao salvar compra no PostgreSQL:",
      error
    );

    return {
      success: false,
      reason: "PURCHASE_SAVE_ERROR",
    };
  }

  await addHistory({
    type: "PURCHASE",
    userId: user.id,
    username: user.username,
    productId: updatedProduct.id,
    productName: updatedProduct.name,
    quantity: finalQuantity,
    details: {
      purchaseId: purchase.id,
      requestedQuantity,
      adjusted: finalQuantity !== requestedQuantity,
      unitPrice: updatedProduct.price,
      total,
      ticketId: ticket.id,
      oldStock: stockResult.oldStock,
      newStock: stockResult.newStock,
      status: "PENDING",
    },
  });

  let removedFromWaitlist = false;

  const waiting = await isInWaitlist(
    productId,
    user.id
  );

  if (waiting) {
    const waitlistResult =
      await removeAfterPurchase(
        productId,
        user.id
      );

    if (waitlistResult.success) {
      removedFromWaitlist = true;

      await addHistory({
        type: "WAITLIST_REMOVED",
        userId: user.id,
        username: user.username,
        productId: updatedProduct.id,
        productName: updatedProduct.name,
        details: {
          reason: "PURCHASE_COMPLETED",
          purchaseId: purchase.id,
        },
      });
    }
  }

  return {
    success: true,
    purchaseId: Number(purchase.id),
    product: updatedProduct,
    requestedQuantity,
    quantity: finalQuantity,
    adjusted:
      finalQuantity !== requestedQuantity,
    total,
    ticket,
    removedFromWaitlist,
    status: "PENDING",
  };
}

module.exports = {
  processPurchase,
};
