const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const {
  getProductById,
} = require("../database/products");

const {
  createQuantityMessage,
} = require("./quantity");

function createProductButtons() {
  const product100Button = new ButtonBuilder()
    .setCustomId("buy_product:rap_100")
    .setLabel("100 RAP • R$ 3,50")
    .setEmoji("🛒")
    .setStyle(ButtonStyle.Danger);

  const product1000Button = new ButtonBuilder()
    .setCustomId("buy_product:rap_1000")
    .setLabel("1.000 RAP • R$ 17,00")
    .setEmoji("🛒")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(
    product100Button,
    product1000Button
  );
}

function createProductSelectionMessage() {
  const product100 = getProductById("rap_100");
  const product1000 = getProductById("rap_1000");

  const stock100 =
    product100 && product100.stock > 0
      ? `🟢 ${product100.stock} disponíveis`
      : "🔴 Sem estoque";

  const stock1000 =
    product1000 && product1000.stock > 0
      ? `🟢 ${product1000.stock} disponíveis`
      : "🔴 Sem estoque";

  return {
    content:
      "🩸 **Berovenda's — Escolha seu produto**\n\n" +
      `💎 **100 RAP**\n` +
      `💰 R$ 3,50\n` +
      `📦 ${stock100}\n\n` +
      `💎 **1.000 RAP**\n` +
      `💰 R$ 17,00\n` +
      `📦 ${stock1000}\n\n` +
      "Selecione uma opção abaixo:",
    components: [createProductButtons()],
    ephemeral: true,
  };
}

function openProductQuantity(productId) {
  const product = getProductById(productId);

  if (!product) {
    return {
      success: false,
      reason: "PRODUCT_NOT_FOUND",
    };
  }

  if (!product.active) {
    return {
      success: false,
      reason: "PRODUCT_DISABLED",
    };
  }

  if (product.stock <= 0) {
    return {
      success: false,
      reason: "OUT_OF_STOCK",
      product,
    };
  }

  const message = createQuantityMessage(productId, 1);

  return {
    success: true,
    product,
    message,
  };
}

module.exports = {
  createProductButtons,
  createProductSelectionMessage,
  openProductQuantity,
};
