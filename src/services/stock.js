const {
  addStock,
  getProductById,
} = require("../database/products");

const {
  getWaitlist,
  markNotified,
} = require("../database/waitlist");

const {
  addHistory,
} = require("../database/history");

const {
  notifyWaitlistUser,
} = require("./notifications");

async function restockProduct({
  client,
  guild,
  productId,
  quantity,
}) {
  const result = addStock(productId, quantity);

  if (!result.success) {
    return result;
  }

  const product = getProductById(productId);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const waitlist = getWaitlist(productId);

  if (waitlist.length === 0) {
    return {
      success: true,
      product,
      notified: 0,
    };
  }

  let notified = 0;

  for (let index = 0; index < waitlist.length; index++) {
    const entry = waitlist[index];
    const position = index + 1;

    const notification = await notifyWaitlistUser({
      client,
      guild,
      userId: entry.userId,
      productName: product.name,
      position,
    });

    markNotified(productId, entry.userId);

    addHistory({
      type: "WAITLIST_NOTIFY",
      userId: entry.userId,
      username: entry.username,
      productId: product.id,
      productName: product.name,
      details: {
        position,
        dmSent: notification.dmSent,
        announcementSent: notification.announcementSent,
      },
    });

    notified++;
  }

  return {
    success: true,
    product,
    notified,
  };
}

module.exports = {
  restockProduct,
};
