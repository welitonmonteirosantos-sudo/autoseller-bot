const config = require("../config");

const products = new Map();

function initializeProducts() {
  for (const productConfig of Object.values(config.products)) {
    if (!products.has(productConfig.id)) {
      products.set(productConfig.id, {
        ...productConfig,
        stock: 0,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return getProducts();
}

function getProducts() {
  return Array.from(products.values());
}

function getProductById(id) {
  return products.get(id) || null;
}

function getProductByName(name) {
  if (!name) return null;

  return (
    getProducts().find(
      (product) =>
        product.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
}

function setPrice(id, price) {
  const product = getProductById(id);
  const newPrice = Number(price);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!Number.isFinite(newPrice) || newPrice < 0) {
    return {
      success: false,
      reason: "INVALID_PRICE",
    };
  }

  const oldPrice = product.price;

  product.price = newPrice;
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    oldPrice,
    newPrice,
    product,
  };
}

function setStock(id, quantity) {
  const product = getProductById(id);
  const newStock = Number(quantity);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!Number.isInteger(newStock) || newStock < 0) {
    return {
      success: false,
      reason: "INVALID_STOCK",
    };
  }

  const oldStock = product.stock;

  product.stock = newStock;
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    oldStock,
    newStock,
    product,
  };
}

function addStock(id, quantity) {
  const product = getProductById(id);
  const amount = Number(quantity);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      success: false,
      reason: "INVALID_QUANTITY",
    };
  }

  const oldStock = product.stock;

  product.stock += amount;
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    added: amount,
    oldStock,
    newStock: product.stock,
    product,
  };
}

function removeStock(id, requestedQuantity) {
  const product = getProductById(id);
  const requested = Number(requestedQuantity);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!Number.isInteger(requested) || requested <= 0) {
    return {
      success: false,
      reason: "INVALID_QUANTITY",
    };
  }

  if (product.stock <= 0) {
    return {
      success: false,
      reason: "OUT_OF_STOCK",
      available: 0,
      product,
    };
  }

  // Regra que definimos:
  // se pedir mais que o estoque, vende somente o disponível.
  const quantity = Math.min(
    requested,
    product.stock,
    config.purchase.maxQuantity
  );

  const oldStock = product.stock;

  product.stock -= quantity;
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    requested,
    quantity,
    adjusted: quantity !== requested,
    oldStock,
    newStock: product.stock,
    product,
  };
}

function setActive(id, active) {
  const product = getProductById(id);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  const oldStatus = product.active;

  product.active = Boolean(active);
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    oldStatus,
    newStatus: product.active,
    product,
  };
}

function isAvailable(id) {
  const product = getProductById(id);

  return Boolean(
    product &&
    product.active &&
    product.stock > 0
  );
}

function calculateTotal(id, quantity) {
  const product = getProductById(id);
  const amount = Number(quantity);

  if (!product) return null;

  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > config.purchase.maxQuantity
  ) {
    return null;
  }

  return Number((product.price * amount).toFixed(2));
}

initializeProducts();

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
