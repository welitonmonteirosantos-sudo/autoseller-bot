module.exports = {
  brand: {
    name: "Berovenda's",
    color: 0xed1c24,
  },

  products: {
    rap100: {
      id: "rap_100",
      name: "100 RAP",
      rap: 100,
      price: 3.50,
      maxQuantity: 10,
    },

    rap1000: {
      id: "rap_1000",
      name: "1.000 RAP",
      rap: 1000,
      price: 17.00,
      maxQuantity: 10,
    },
  },

  roles: {
    owner: "👑 DONO",
    admin: "🛡️ ADMIN",
    customer: "👤 CLIENTE",
  },

  channels: {
    buy: "🛒・comprar",
    announcements: "📢・avisos",
  },

  purchase: {
    maxQuantity: 10,
    oneProductPerTicket: true,
  },

  waitlist: {
    enabled: true,
    notificationDelay: 60 * 1000,
  },

  commands: {
    prefix: "+",
  },
};
