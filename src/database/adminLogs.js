const adminLogs = [];

function addAdminLog({
  adminId,
  adminName,
  action,
  productId = null,
  productName = null,
  oldValue = null,
  newValue = null,
  details = null,
}) {
  const log = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    adminId,
    adminName,
    action,
    productId,
    productName,
    oldValue,
    newValue,
    details,
    createdAt: new Date().toISOString(),
  };

  adminLogs.push(log);

  return log;
}

function getAdminLogs() {
  // Mais recentes primeiro.
  return [...adminLogs].reverse();
}

function getAdminLogCount() {
  return adminLogs.length;
}

function filterAdminLogs({
  adminId = null,
  productId = null,
  action = null,
  startDate = null,
  endDate = null,
} = {}) {
  return getAdminLogs().filter((log) => {
    if (adminId && log.adminId !== adminId) {
      return false;
    }

    if (productId && log.productId !== productId) {
      return false;
    }

    if (
      action &&
      !log.action.toLowerCase().includes(action.toLowerCase())
    ) {
      return false;
    }

    const createdAt = new Date(log.createdAt);

    if (startDate && createdAt < new Date(startDate)) {
      return false;
    }

    if (endDate && createdAt > new Date(endDate)) {
      return false;
    }

    return true;
  });
}

/*
 * Não existe função removeAdminLogs().
 *
 * Isso é proposital.
 * O comando +hs nunca terá acesso aos logs administrativos.
 * Eles ficam separados do histórico comum.
 */

module.exports = {
  addAdminLog,
  getAdminLogs,
  getAdminLogCount,
  filterAdminLogs,
};
