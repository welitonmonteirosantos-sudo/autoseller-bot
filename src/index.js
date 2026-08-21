const { Client, GatewayIntentBits } = require("discord.js");

const {
  removeOldest,
  getHistoryCount,
} = require("./database/history");

const {
  createProduct,
  getProducts,
  getProductByName,
} = require("./database/products");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`AutoSeller online como ${client.user.tag}`);

  const existingProduct = getProductByName("100 RAP");

  if (!existingProduct) {
    createProduct({
      name: "100 RAP",
      price: 0,
      stock: 0,
      active: true,
    });

    console.log("Produto 100 RAP criado.");
  }
});

function isAdmin(member) {
  if (!member) return false;

  return member.roles.cache.some(
    (role) =>
      role.name === "👑 DONO" ||
      role.name === "🛡️ ADMIN"
  );
}

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "+ping") {
    return message.reply("🏓 Pong!");
  }

  if (message.content === "+produtos") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
    }

    const products = getProducts();

    if (products.length === 0) {
      return message.reply("📦 Nenhum produto cadastrado.");
    }

    const list = products
      .map((product) => {
        const status =
          product.active && product.stock > 0
            ? "🟢 Disponível"
            : "🔴 Sem estoque";

        return (
          `📦 **${product.name}**\n` +
          `💰 Preço: R$ ${product.price.toFixed(2)}\n` +
          `📊 Estoque: ${product.stock}\n` +
          `${status}`
        );
      })
      .join("\n\n");

    return message.reply(list);
  }

  if (message.content.startsWith("+hs")) {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
    }

    const args = message.content.trim().split(/\s+/);

    if (args.length !== 2) {
      return message.reply(
        "❌ Use o comando assim: `+hs 10`"
      );
    }

    const amount = Number(args[1]);

    if (!Number.isInteger(amount) || amount <= 0) {
      return message.reply(
        "❌ Informe uma quantidade válida. Exemplo: `+hs 10`"
      );
    }

    const removed = removeOldest(amount);
    const after = getHistoryCount();

    return message.reply(
      `🗑️ **Histórico limpo**\n\n` +
      `Solicitado: **${amount}**\n` +
      `Removido: **${removed}**\n` +
      `Restante: **${after}**`
    );
  }
});

client.on("error", (error) => {
  console.error("Erro do Discord:", error);
});

client.login(process.env.DISCORD_TOKEN);
