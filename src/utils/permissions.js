const config = require("../config");

function isAdmin(member) {
  if (!member) {
    return false;
  }

  return member.roles.cache.some(
    (role) =>
      role.name === config.roles.owner ||
      role.name === config.roles.admin
  );
}

function isOwner(member) {
  if (!member) {
    return false;
  }

  return member.roles.cache.some(
    (role) => role.name === config.roles.owner
  );
}

function isCustomer(member) {
  if (!member) {
    return false;
  }

  return member.roles.cache.some(
    (role) => role.name === config.roles.customer
  );
}

module.exports = {
  isAdmin,
  isOwner,
  isCustomer,
};
