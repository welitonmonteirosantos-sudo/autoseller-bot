const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

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

const {
  handleAdminStockInteraction,
} = require("./adminStock");

const {
  joinWaitlist,
} = require("../database/waitlist");

const {
  getProductById,
} = require("../database/products");

const {
  addHistory,
} = require("../database/history");

async function handleInteraction(interaction) {
  const customId = interaction.customId;

  // ==============================
  // PAINEL ADMIN — ESTOQUE
  // ==============================

  if (
    customId === "admin_stock" ||
    customId.startsWith("admin_stock_product:") ||
    customId.startsWith("admin_stock_add:") ||
    customId.startsWith("admin_stock_set:") ||
    customId.startsWith("admin_stock_modal:")
  ) {
    return handleAdminStockInteraction(interaction);
  }

  if (!interaction.isButton()) {
    return;
  }

  // ==============================
  // ABRIR COMPRA
  // ==============================

  if (customId === "buy_open") {
    const message =
      await createProductSelectionMessage();

    return interaction.reply(message);
  }

  // ==============================
  // ESCOLHER PRODUTO
  // ==============================

  if (customId.startsWith("buy_product:")) {
    const [, productId] =
      customId.split(":");

    const result =
      await openProductQuantity(productId);

    if (!result.success) {
      if (result.reason === "OUT_OF_STOCK") {
        const waitlistButton =
          new ButtonBuilder()
            .setCustomId(
              `waitlist_join:${productId}`
            )
            .setLabel(
              "Entrar na lista de espera"
            )
            .setEmoji("👥")
            .setStyle(ButtonStyle.Danger);

        const row =
          new ActionRowBuilder()
            .addComponents(waitlistButton);

        return interaction.update({
          content:
            `🔴 **${result.product.name} está sem estoque.**\n\n` +
            "Você pode entrar na lista de espera para ser avisado quando houver reposição.",
          components: [row],
        });
      }

      if (
        result.reason === "PRODUCT_DISABLED"
      ) {
        return interaction.update({
          content:
            `⛔ **${result.product.name} está indisponível no momento.**`,
          components: [],
        });
      }

      return interaction.update({
        content:
          "❌ Não foi possível abrir esse produto.",
        components: [],
      });
    }

    return interaction.update(
      result.message
    );
  }

  // ==============================
  // ENTRAR NA LISTA DE ESPERA
  // ==============================

  if (
    customId.startsWith(
      "waitlist_join:"
    )
  ) {
    const [, productId] =
      customId.split(":");

    const product =
      await getProductById(productId);

    if (!product) {
      return interaction.update({
        content:
          "❌ Produto não encontrado.",
        components: [],
      });
    }

    const result =
      await joinWaitlist(
        productId,
        interaction.user
      );

    if (!result.success) {
      if (
        result.reason ===
        "ALREADY_IN_WAITLIST"
      ) {
        return interaction.update({
          content:
            `👥 Você já está na lista de espera de **${product.name}**.\n\n` +
            `Sua posição atual é **#${result.position}**.`,
          components: [],
        });
      }

      if (
        result.reason ===
        "WAITLIST_FULL"
      ) {
        return interaction.update({
          content:
            `🔴 A lista de espera de **${product.name}** está cheia.\n\n` +
            "Limite: **10 pessoas**.",
          components: [],
        });
      }

      return interaction.update({
        content:
          "❌ Não foi possível entrar na lista de espera.",
        components: [],
      });
    }

    await addHistory({
      type: "WAITLIST_JOIN",
      userId: interaction.user.id,
      username:
        interaction.user.username,
      productId: product.id,
      productName: product.name,
      details: {
        position: result.position,
        total: result.total,
      },
    });

    return interaction.update({
      content:
        `✅ Você entrou na lista de espera de **${product.name}**.\n\n` +
        `👥 Posição: **#${result.position}**\n` +
        `📊 Pessoas aguardando: **${result.total}/10**\n\n` +
        "Você será avisado por **DM** e também no **canal de avisos** quando houver reposição.",
      components: [],
    });
  }

  // ==============================
  // AUMENTAR QUANTIDADE
  // ==============================

  if (
    customId.startsWith(
      "qty_increase:"
    )
  ) {
    const [
      ,
      productId,
      currentQuantity,
    ] = customId.split(":");

    const newQuantity =
      changeQuantity(
        currentQuantity,
        "increase"
      );

    const message =
      await createQuantityMessage(
        productId,
        newQuantity
      );

    if (!message) {
      return interaction.update({
        content:
          "❌ Produto não encontrado.",
        components: [],
      });
    }

    return interaction.update(
      message
    );
  }

  // ==============================
  // DIMINUIR QUANTIDADE
  // ==============================

  if (
    customId.startsWith(
      "qty_decrease:"
    )
  ) {
    const [
      ,
      productId,
      currentQuantity,
    ] = customId.split(":");

    const newQuantity =
      changeQuantity(
        currentQuantity,
        "decrease"
      );

    const message =
      await createQuantityMessage(
        productId,
        newQuantity
      );

    if (!message) {
      return interaction.update({
        content:
          "❌ Produto não encontrado.",
        components: [],
      });
    }

    return interaction.update(
      message
    );
  }

  // ==============================
  // QUANTIDADE ATUAL
  // ==============================

  if (
    customId.startsWith(
      "qty_current:"
    )
  ) {
    return interaction.deferUpdate();
  }

  // ==============================
  // CONFIRMAR COMPRA
  // ==============================

  if (
    customId.startsWith(
      "qty_confirm:"
    )
  ) {
    const [
      ,
      productId,
      quantity,
    ] = customId.split(":");

    await interaction.deferUpdate();

    const result =
      await processPurchase({
        guild: interaction.guild,
        user: interaction.user,
        productId,
        quantity:
          Number(quantity),
      });

    if (!result.success) {
      if (
        result.reason ===
        "OUT_OF_STOCK"
      ) {
        const waitlistButton =
          new ButtonBuilder()
            .setCustomId(
              `waitlist_join:${productId}`
            )
            .setLabel(
              "Entrar na lista de espera"
            )
            .setEmoji("👥")
            .setStyle(
              ButtonStyle.Danger
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              waitlistButton
            );

        return interaction.editReply({
          content:
            "🔴 **O produto acabou antes da confirmação.**\n\n" +
            "Você pode entrar na lista de espera.",
          components: [row],
        });
      }

      if (
        result.reason ===
        "PRODUCT_DISABLED"
      ) {
        return interaction.editReply({
          content:
            "⛔ **Este produto está indisponível no momento.**",
          components: [],
        });
      }

      if (
        result.reason ===
        "INVALID_QUANTITY"
      ) {
        return interaction.editReply({
          content:
            "❌ Quantidade inválida. Escolha entre **1 e 10**.",
          components: [],
        });
      }

      if (
        result.reason ===
        "TICKET_CREATION_ERROR"
      ) {
        return interaction.editReply({
          content:
            "❌ Não foi possível criar o ticket da compra.",
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
