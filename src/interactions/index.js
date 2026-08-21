const {
  createProductSelectionMessage,
  openProductQuantity,
} = require("./buy");

const {
  createQuantityMessage,
  changeQuantity,
} = require("./quantity");

const {
  processPurchase,
} = require("../services/purchase");

async function handleInteraction(interaction) {
  if (!interaction.isButton()) {
    return;
  }

  const customId = interaction.customId;

  // ==============================
  // ABRIR COMPRA
  // ==============================

  if (customId === "buy_open") {
    return interaction.reply(
      createProductSelectionMessage()
    );
  }

  // ==============================
  // ESCOLHER PRODUTO
  // ==============================

  if (customId.startsWith("buy_product:")) {
    const [, productId] = customId.split(":");

    const result = openProductQuantity(productId);

    if (!result.success) {
      if (result.reason === "OUT_OF_STOCK") {
        return interaction.update({
          content:
            `🔴 **${result.product.name} está sem estoque.**\n\n` +
            "A lista de espera será conectada a esse fluxo na próxima etapa.",
          components: [],
        });
      }

      return interaction.update({
        content: "❌ Não foi possível abrir esse produto.",
        components: [],
      });
    }

    return interaction.update(result.message);
  }

  // ==============================
  // AUMENTAR QUANTIDADE
  // ==============================

  if (customId.startsWith("qty_increase:")) {
    const [, productId, currentQuantity] =
      customId.split(":");

    const newQuantity = changeQuantity(
      currentQuantity,
      "increase"
    );

    const message = createQuantityMessage(
      productId,
      newQuantity
    );

    if (!message) {
      return interaction.update({
        content: "❌ Produto não encontrado.",
        components: [],
      });
    }

    return interaction.update(message);
  }

  // ==============================
  // DIMINUIR QUANTIDADE
  // ==============================

  if (customId.startsWith("qty_decrease:")) {
    const [, productId, currentQuantity] =
      customId.split(":");

    const newQuantity = changeQuantity(
      currentQuantity,
      "decrease"
    );

    const message = createQuantityMessage(
      productId,
      newQuantity
    );

    if (!message) {
      return interaction.update({
        content: "❌ Produto não encontrado.",
        components: [],
      });
    }

    return interaction.update(message);
  }

  // ==============================
  // BOTÃO CENTRAL DA QUANTIDADE
  // ==============================

  if (customId.startsWith("qty_current:")) {
    return interaction.deferUpdate();
  }

  // ==============================
  // CONFIRMAR COMPRA
  // ==============================

  if (customId.startsWith("qty_confirm:")) {
    const [, productId, quantity] =
      customId.split(":");

    await interaction.deferUpdate();

    const result = await processPurchase({
      guild: interaction.guild,
      user: interaction.user,
      productId,
      quantity: Number(quantity),
    });

    if (!result.success) {
      if (result.reason === "OUT_OF_STOCK") {
        return interaction.editReply({
          content:
            "🔴 **O produto acabou antes da confirmação.**\n\n" +
            "A lista de espera será conectada na próxima etapa.",
          components: [],
        });
      }

      if (result.reason === "INVALID_QUANTITY") {
        return interaction.editReply({
          content:
            "❌ Quantidade inválida. Escolha entre **1 e 10**.",
          components: [],
        });
      }

      return interaction.editReply({
        content:
          "❌ Não foi possível concluir a compra.",
        components: [],
      });
    }

    let adjustedText = "";

    if (result.adjusted) {
      adjustedText =
        `\n⚠️ Você pediu **${result.requestedQuantity}**, ` +
        `mas havia somente **${result.quantity}** disponíveis.`;
    }

    return interaction.editReply({
      content:
        `✅ **Pedido criado!**\n\n` +
        `📦 Produto: **${result.product.name}**\n` +
        `🔢 Quantidade: **${result.quantity}**\n` +
        `💰 Total: **R$ ${result.total
          .toFixed(2)
          .replace(".", ",")}**\n` +
        `${adjustedText}\n\n` +
        `🎫 Ticket: ${result.ticket}`,
      components: [],
    });
  }
}

module.exports = {
  handleInteraction,
};
