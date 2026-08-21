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

  const ticket = await createPurchaseTicket({
    guild,
    user,
    product: updatedProduct,
    quantity: finalQuantity,
    total,
  });

  addHistory({
    type: "PURCHASE",
    userId: user.id,
    username: user.username,
    productId: updatedProduct.id,
    productName: updatedProduct.name,
    quantity: finalQuantity,
    details: {
      requestedQuantity,
      adjusted: finalQuantity !== requestedQuantity,
      total,
      ticketId: ticket.id,
      oldStock: stockResult.oldStock,
      newStock: stockResult.newStock,
    },
  });

  let removedFromWaitlist = false;

  if (isInWaitlist(productId, user.id)) {
    const waitlistResult = removeAfterPurchase(
      productId,
      user.id
    );

    if (waitlistResult.success) {
      removedFromWaitlist = true;

      addHistory({
        type: "WAITLIST_REMOVED",
        userId: user.id,
        username: user.username,
        productId: updatedProduct.id,
        productName: updatedProduct.name,
        details: {
          reason: "PURCHASE_COMPLETED",
        },
      });
    }
  }

  return {
    success: true,
    product: updatedProduct,
    requestedQuantity,
    quantity: finalQuantity,
    adjusted: finalQuantity !== requestedQuantity,
    total,
    ticket,
    removedFromWaitlist,
  };
}

module.exports = {
  processPurchase,
};
