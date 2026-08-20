const products = [];

function createProduct(data) {
  const product = {
    id: Date.now().toString(),
    name: data.name,
    price: Number(data.price),
    stock: Number(data.stock),
    active: data.active ?? true,
    maxPerPurchase: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  products.push(product);

  return product;
}

function getProducts() {
  return [...products];
}

function getProductById(id) {
  return products.find((product) => product.id === id);
}

function getProductByName(name) {
  return products.find(
    (product) =>
      product.name.toLowerCase() === name.toLowerCase()
  );
}

function updateProduct(id, changes) {
  const product = getProductById(id);

  if (!product) {
    return null;
  }

  if (changes.name !== undefined) {
    product.name = changes.name;
  }

  if (changes.price !== undefined) {
    product.price = Number(changes.price);
  }

  if (changes.stock !== undefined) {
    product.stock = Math.max(0, Number(changes.stock));
  }

  if (changes.active !== undefined) {
    product.active = Boolean(changes.active);
  }

  product.updatedAt = new Date().toISOString();

  return product;
}

function decreaseStock(id, quantity) {
  const product = getProductById(id);

  if (!product) {
    return null;
  }

  const amount = Number(quantity);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  if (product.stock <= 0) {
    return {
      success: false,
      reason: "OUT_OF_STOCK",
      product,
    };
  }

  const actualQuantity = Math.min(amount, product.stock);

  product.stock -= actualQuantity;
  product.updatedAt = new Date().toISOString();

  return {
    success: true,
    quantity: actualQuantity,
    product,
  };
}

function increaseStock(id, quantity) {
  const product = getProductById(id);

  if (!product) {
    return null;
  }

  const amount = Number(quantity);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  product.stock += amount;
  product.updatedAt = new Date().toISOString();

  return product;
}

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  getProductByName,
  updateProduct,
  decreaseStock,
  increaseStock,
};
