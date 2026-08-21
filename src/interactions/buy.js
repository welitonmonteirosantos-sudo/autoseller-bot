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

async function createProductSelectionMessage() {
  const product100 = await getProductById("rap_100");
  const product1000 = await getProductById("rap_1000");

  if (!product100 || !product1000) {
    return {
      content:
        "❌ Não foi possível carregar os produtos.",
      components: [],
      ephemeral: true,
    };
  }

  const stock100 =
    product100.active && product100.stock > 0
      ? `🟢 ${product100.stock} disponíveis`
      : "🔴 Sem estoque";

  const stock1000 =
    product1000.active && product1000.stock > 0
      ? `🟢 ${product1000.stock} disponíveis`
      : "🔴 Sem estoque";

  return {
    content:
      "🩸 **Berovenda's — Escolha seu produto**\n\n" +
      `💎 **100 RAP**\n` +
      `💰 R$ ${product100.price
        .toFixed(2)
        .replace(".", ",")}\n` +
      `📦 ${stock100}\n\n` +
      `💎 **1.000 RAP**\n` +
      `💰 R$ ${product1000.price
        .toFixed(2)
        .replace(".", ",")}\n` +
      `📦 ${stock1000}\n\n` +
      "Selecione uma opção abaixo:",
    components: [createProductButtons()],
    ephemeral: true,
  };
}

async function openProductQuantity(productId) {
  const product = await getProductById(productId);

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
      product,
    };
  }

  if (product.stock <= 0) {
    return {
      success: false,
      reason: "OUT_OF_STOCK",
      product,
    };
  }

  const message = await createQuantityMessage(
    productId,
    1
  );

  if (!message) {
    return {
      success: false,
      reason: "QUANTITY_MESSAGE_ERROR",
      product,
    };
  }

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
