const history = [];

function addHistory({
  type,
  userId = null,
  username = null,
  productId = null,
  productName = null,
  quantity = null,
  details = null,
}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    userId,
    username,
    productId,
    productName,
    quantity,
    details,
    createdAt: new Date().toISOString(),
  };

  history.push(entry);

  return entry;
}

function getHistory() {
  // Mais recentes primeiro
  return [...history].reverse();
}

function getHistoryCount() {
  return history.length;
}

function removeOldest(amount) {
  const quantity = Number(amount);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  const totalToRemove = Math.min(
    quantity,
    history.length
  );

  // O array original guarda os mais antigos no início.
  history.splice(0, totalToRemove);

  return totalToRemove;
}

function filterHistory({
  type = null,
  userId = null,
  productId = null,
} = {}) {
  return getHistory().filter((entry) => {
    if (type && entry.type !== type) {
      return false;
    }

    if (userId && entry.userId !== userId) {
      return false;
    }

    if (productId && entry.productId !== productId) {
      return false;
    }

    return true;
  });
}

module.exports = {
  addHistory,
  getHistory,
  getHistoryCount,
  removeOldest,
  filterHistory,
};
