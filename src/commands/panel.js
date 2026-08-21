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

function formatMoney(value) {
  return Number(value)
    .toFixed(2)
    .replace(".", ",");
}

function stockStatus(product) {
  if (!product || !product.active || product.stock <= 0) {
    return "🔴 Sem estoque";
  }

  return `🟢 ${product.stock} disponíveis`;
}

async function createPurchasePanel() {
  const product100 = await getProductById("rap_100");
  const product1000 = await getProductById("rap_1000");

  if (!product100 || !product1000) {
    throw new Error("Produtos principais não encontrados.");
  }

  const embed = new EmbedBuilder()
    .setColor(config.brand.color)
    .setTitle("Berovenda's — Central de Compras")
    .setDescription(
      "Compre **RAP do Blade Ball** de forma rápida e segura.\n\n" +
      "Clique no botão abaixo para iniciar sua compra."
    )
    .addFields(
      {
        name: "💎 100 RAP",
        value:
          `💰 **R$ ${formatMoney(product100.price)}**\n` +
          `📦 ${stockStatus(product100)}`,
        inline: true,
      },
      {
        name: "💎 1.000 RAP",
        value:
          `💰 **R$ ${formatMoney(product1000.price)}**\n` +
          `📦 ${stockStatus(product1000)}`,
        inline: true,
      },
      {
        name: "📋 Informações",
        value:
          "• Escolha de **1 a 10 unidades**\n" +
          "• **1 produto por ticket**\n" +
          "• Estoque atualizado automaticamente",
        inline: false,
      }
    )
    .setFooter({
      text: "Berovenda's • Blade Ball RAP",
    })
    .setTimestamp();

  if (process.env.PANEL_IMAGE_URL) {
    embed.setImage(process.env.PANEL_IMAGE_URL);
  }

  const buyButton = new ButtonBuilder()
    .setCustomId("buy_open")
    .setLabel("Comprar")
    .setEmoji("🛒")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(
    buyButton
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

async function publishPurchasePanel(guild) {
  const channel = guild.channels.cache.find(
    (item) => item.name === config.channels.buy
  );

  if (!channel) {
    return {
      success: false,
      reason: "BUY_CHANNEL_NOT_FOUND",
    };
  }

  const panel = await createPurchasePanel();

  const message = await channel.send(panel);

  return {
    success: true,
    channel,
    message,
  };
}

module.exports = {
  createPurchasePanel,
  publishPurchasePanel,
};
