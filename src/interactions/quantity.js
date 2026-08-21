const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const {
  getProductById,
  calculateTotal,
} = require("../database/products");

function createQuantityButtons(productId, selectedQuantity = 1) {
  const decreaseButton = new ButtonBuilder()
    .setCustomId(`qty_decrease:${productId}:${selectedQuantity}`)
    .setLabel("−")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(selectedQuantity <= 1);

  const quantityButton = new ButtonBuilder()
    .setCustomId(`qty_current:${productId}:${selectedQuantity}`)
    .setLabel(`${selectedQuantity}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);

  const increaseButton = new ButtonBuilder()
    .setCustomId(`qty_increase:${productId}:${selectedQuantity}`)
    .setLabel("+")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(selectedQuantity >= 10);

  const confirmButton = new ButtonBuilder()
    .setCustomId(`qty_confirm:${productId}:${selectedQuantity}`)
    .setLabel("Confirmar compra")
    .setEmoji("🛒")
    .setStyle(ButtonStyle.Danger);

  return [
    new ActionRowBuilder().addComponents(
      decreaseButton,
      quantityButton,
      increaseButton
    ),
    new ActionRowBuilder().addComponents(confirmButton),
  ];
}

async function createQuantityMessage(productId, selectedQuantity = 1) {
  const product = await getProductById(productId);

  if (!product) {
    return null;
  }

  const total = await calculateTotal(
    productId,
    selectedQuantity
  );

  if (total === null) {
    return null;
  }

  return {
    content:
      `🩸 **Berovenda's — ${product.name}**\n\n` +
      `💰 Preço unitário: **R$ ${product.price
        .toFixed(2)
        .replace(".", ",")}**\n` +
      `🔢 Quantidade: **${selectedQuantity}**\n` +
      `💵 Total: **R$ ${total
        .toFixed(2)
        .replace(".", ",")}**\n` +
      `📦 Estoque atual: **${product.stock}**\n\n` +
      `Escolha de **1 a 10 unidades**.`,
    components: createQuantityButtons(
      productId,
      selectedQuantity
    ),
  };
}

function changeQuantity(currentQuantity, direction) {
  let quantity = Number(currentQuantity);

  if (!Number.isInteger(quantity)) {
    quantity = 1;
  }

  if (direction === "increase") {
    quantity++;
  }

  if (direction === "decrease") {
    quantity--;
  }

  return Math.max(1, Math.min(10, quantity));
}

module.exports = {
  createQuantityButtons,
  createQuantityMessage,
  changeQuantity,
};
