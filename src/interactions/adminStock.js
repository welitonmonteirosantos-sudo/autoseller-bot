const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const {
  getProductById,
  addStock,
  setStock,
} = require("../database/products");

const {
  addAdminLog,
} = require("../database/adminLogs");

const {
  isAdmin,
} = require("../utils/permissions");

function formatStock(product) {
  if (!product) return "Produto não encontrado";

  return (
    `📦 **${product.name}**\n` +
    `Estoque atual: **${product.stock}**`
  );
}

function createStockMenu() {
  const rap100 = getProductById("rap_100");
  const rap1000 = getProductById("rap_1000");

  const button100 = new ButtonBuilder()
    .setCustomId("admin_stock_product:rap_100")
    .setLabel(`100 RAP • ${rap100.stock}`)
    .setEmoji("📦")
    .setStyle(ButtonStyle.Danger);

  const button1000 = new ButtonBuilder()
    .setCustomId("admin_stock_product:rap_1000")
    .setLabel(`1.000 RAP • ${rap1000.stock}`)
    .setEmoji("📦")
    .setStyle(ButtonStyle.Danger);

  return {
    content:
      "📦 **Gerenciamento de estoque**\n\n" +
      `${formatStock(rap100)}\n\n` +
      `${formatStock(rap1000)}\n\n` +
      "Escolha o produto que deseja alterar:",
    components: [
      new ActionRowBuilder().addComponents(
        button100,
        button1000
      ),
    ],
    ephemeral: true,
  };
}

function createStockActionMenu(productId) {
  const product = getProductById(productId);

  if (!product) {
    return null;
  }

  const addButton = new ButtonBuilder()
    .setCustomId(`admin_stock_add:${productId}`)
    .setLabel("Adicionar estoque")
    .setEmoji("➕")
    .setStyle(ButtonStyle.Danger);

  const setButton = new ButtonBuilder()
    .setCustomId(`admin_stock_set:${productId}`)
    .setLabel("Definir estoque")
    .setEmoji("✏️")
    .setStyle(ButtonStyle.Secondary);

  return {
    content:
      `📦 **${product.name}**\n\n` +
      `Estoque atual: **${product.stock}**\n\n` +
      "Escolha o que deseja fazer:",
    components: [
      new ActionRowBuilder().addComponents(
        addButton,
        setButton
      ),
    ],
  };
}

function createStockModal(productId, mode) {
  const product = getProductById(productId);

  if (!product) {
    return null;
  }

  const modal = new ModalBuilder()
    .setCustomId(`admin_stock_modal:${mode}:${productId}`)
    .setTitle(
      mode === "add"
        ? `Adicionar estoque • ${product.name}`
        : `Definir estoque • ${product.name}`
    );

  const quantityInput = new TextInputBuilder()
    .setCustomId("stock_quantity")
    .setLabel(
      mode === "add"
        ? "Quantidade a adicionar"
        : "Novo estoque"
    )
    .setPlaceholder(
      mode === "add"
        ? "Exemplo: 10"
        : "Exemplo: 50"
    )
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(
    new ActionRowBuilder().addComponents(quantityInput)
  );

  return modal;
}

async function handleAdminStockInteraction(interaction) {
  if (!isAdmin(interaction.member)) {
    if (interaction.isButton()) {
      return interaction.reply({
        content:
          "❌ Você não tem permissão para usar o painel administrativo.",
        ephemeral: true,
      });
    }

    if (interaction.isModalSubmit()) {
      return interaction.reply({
        content:
          "❌ Você não tem permissão para usar o painel administrativo.",
        ephemeral: true,
      });
    }

    return;
  }

  if (
    interaction.isButton() &&
    interaction.customId === "admin_stock"
  ) {
    return interaction.reply(createStockMenu());
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      "admin_stock_product:"
    )
  ) {
    const [, productId] =
      interaction.customId.split(":");

    const menu = createStockActionMenu(productId);

    if (!menu) {
      return interaction.update({
        content: "❌ Produto não encontrado.",
        components: [],
      });
    }

    return interaction.update(menu);
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      "admin_stock_add:"
    )
  ) {
    const [, productId] =
      interaction.customId.split(":");

    const modal = createStockModal(
      productId,
      "add"
    );

    if (!modal) {
      return interaction.reply({
        content: "❌ Produto não encontrado.",
        ephemeral: true,
      });
    }

    return interaction.showModal(modal);
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      "admin_stock_set:"
    )
  ) {
    const [, productId] =
      interaction.customId.split(":");

    const modal = createStockModal(
      productId,
      "set"
    );

    if (!modal) {
      return interaction.reply({
        content: "❌ Produto não encontrado.",
        ephemeral: true,
      });
    }

    return interaction.showModal(modal);
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(
      "admin_stock_modal:"
    )
  ) {
    const [, mode, productId] =
      interaction.customId.split(":");

    const quantity = Number(
      interaction.fields.getTextInputValue(
        "stock_quantity"
      )
    );

    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      (mode === "add" && quantity === 0)
    ) {
      return interaction.reply({
        content:
          "❌ Informe uma quantidade inteira válida.",
        ephemeral: true,
      });
    }

    const product = getProductById(productId);

    if (!product) {
      return interaction.reply({
        content: "❌ Produto não encontrado.",
        ephemeral: true,
      });
    }

    const oldStock = product.stock;

    let result;

    if (mode === "add") {
      result = addStock(
        productId,
        quantity
      );
    } else {
      result = setStock(
        productId,
        quantity
      );
    }

    if (!result.success) {
      return interaction.reply({
        content:
          "❌ Não foi possível alterar o estoque.",
        ephemeral: true,
      });
    }

    addAdminLog({
      adminId: interaction.user.id,
      adminName: interaction.user.username,
      action:
        mode === "add"
          ? "ADD_STOCK"
          : "SET_STOCK",
      productId: product.id,
      productName: product.name,
      oldValue: oldStock,
      newValue: product.stock,
      details: {
        quantity,
      },
    });

    return interaction.reply({
      content:
        `✅ **Estoque atualizado**\n\n` +
        `📦 Produto: **${product.name}**\n` +
        `Anterior: **${oldStock}**\n` +
        `Atual: **${product.stock}**`,
      ephemeral: true,
    });
  }
}

module.exports = {
  handleAdminStockInteraction,
};
