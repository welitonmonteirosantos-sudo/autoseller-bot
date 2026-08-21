const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const config = require("../config");

const {
  getProductById,
} = require("../database/products");

function money(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

function createAdminPanel() {
  const rap100 = getProductById("rap_100");
  const rap1000 = getProductById("rap_1000");

  const embed = new EmbedBuilder()
    .setColor(config.brand.color)
    .setTitle("⚙️ Berovenda's — Painel Administrativo")
    .setDescription(
      "Gerencie a loja pelos botões abaixo.\n\n" +
      "🔒 **Acesso exclusivo da administração.**"
    )
    .addFields(
      {
        name: "💎 100 RAP",
        value:
          `💰 R$ ${money(rap100.price)}\n` +
          `📦 Estoque: **${rap100.stock}**`,
        inline: true,
      },
      {
        name: "💎 1.000 RAP",
        value:
          `💰 R$ ${money(rap1000.price)}\n` +
          `📦 Estoque: **${rap1000.stock}**`,
        inline: true,
      }
    )
    .setFooter({
      text: "Berovenda's • Administração",
    })
    .setTimestamp();

  const stock = new ButtonBuilder()
    .setCustomId("admin_stock")
    .setLabel("Estoque")
    .setEmoji("📦")
    .setStyle(ButtonStyle.Danger);

  const prices = new ButtonBuilder()
    .setCustomId("admin_prices")
    .setLabel("Preços")
    .setEmoji("💰")
    .setStyle(ButtonStyle.Danger);

  const coupons = new ButtonBuilder()
    .setCustomId("admin_coupons")
    .setLabel("Cupons")
    .setEmoji("🎟️")
    .setStyle(ButtonStyle.Secondary);

  const waitlist = new ButtonBuilder()
    .setCustomId("admin_waitlist")
    .setLabel("Lista de espera")
    .setEmoji("👥")
    .setStyle(ButtonStyle.Secondary);

  const logs = new ButtonBuilder()
    .setCustomId("admin_logs")
    .setLabel("Logs")
    .setEmoji("📋")
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    stock,
    prices
  );

  const row2 = new ActionRowBuilder().addComponents(
    coupons,
    waitlist,
    logs
  );

  return {
    embeds: [embed],
    components: [row1, row2],
  };
}

async function publishAdminPanel(guild) {
  const channel = guild.channels.cache.find(
    (channel) => channel.name === "⚙️・painel"
  );

  if (!channel) {
    return {
      success: false,
      reason: "ADMIN_CHANNEL_NOT_FOUND",
    };
  }

  const message = await channel.send(
    createAdminPanel()
  );

  return {
    success: true,
    channel,
    message,
  };
}

module.exports = {
  createAdminPanel,
  publishAdminPanel,
};
