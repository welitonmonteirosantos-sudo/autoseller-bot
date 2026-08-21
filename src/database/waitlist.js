const MAX_WAITLIST = 10;

const waitlists = new Map();

function getList(productId) {
  if (!waitlists.has(productId)) {
    waitlists.set(productId, []);
  }

  return waitlists.get(productId);
}

function joinWaitlist(productId, user) {
  const list = getList(productId);

  const existing = list.find(
    (entry) => entry.userId === user.id
  );

  if (existing) {
    return {
      success: false,
      reason: "ALREADY_IN_WAITLIST",
      position: list.indexOf(existing) + 1,
    };
  }

  if (list.length >= MAX_WAITLIST) {
    return {
      success: false,
      reason: "WAITLIST_FULL",
    };
  }

  const entry = {
    userId: user.id,
    username: user.username,
    joinedAt: new Date().toISOString(),
    notifiedAt: null,
  };

  list.push(entry);

  return {
    success: true,
    entry,
    position: list.length,
    total: list.length,
  };
}

function leaveWaitlist(productId, userId) {
  const list = getList(productId);

  const index = list.findIndex(
    (entry) => entry.userId === userId
  );

  if (index === -1) {
    return {
      success: false,
      reason: "NOT_IN_WAITLIST",
    };
  }

  const [removed] = list.splice(index, 1);

  return {
    success: true,
    removed,
    total: list.length,
  };
}

function removeAfterPurchase(productId, userId) {
  return leaveWaitlist(productId, userId);
}

function isInWaitlist(productId, userId) {
  return getList(productId).some(
    (entry) => entry.userId === userId
  );
}

function getPosition(productId, userId) {
  const list = getList(productId);

  const index = list.findIndex(
    (entry) => entry.userId === userId
  );

  return index === -1 ? null : index + 1;
}

function getWaitlist(productId) {
  return [...getList(productId)];
}

function getWaitlistCount(productId) {
  return getList(productId).length;
}

function getNext(productId) {
  const list = getList(productId);

  return list.length > 0 ? list[0] : null;
}

function markNotified(productId, userId) {
  const list = getList(productId);

  const entry = list.find(
    (item) => item.userId === userId
  );

  if (!entry) {
    return null;
  }

  entry.notifiedAt = new Date().toISOString();

  return entry;
}

function clearWaitlist(productId) {
  const list = getList(productId);
  const total = list.length;

  list.splice(0, list.length);

  return total;
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
