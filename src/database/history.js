const history = [];

function addHistory(data) {
  const entry = {
    id: Date.now(),
    ...data,
    createdAt: new Date().toISOString(),
  };

  history.push(entry);

  return entry;
}

function getHistory() {
  return [...history].reverse();
}

function removeOldest(amount) {
  const quantity = Number(amount);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  const removed = Math.min(quantity, history.length);

  history.splice(0, removed);

  return removed;
}

function getHistoryCount() {
  return history.length;
}

module.exports = {
  addHistory,
  getHistory,
  removeOldest,
  getHistoryCount,
};
