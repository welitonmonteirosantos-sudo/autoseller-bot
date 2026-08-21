const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

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

// ==============================
// CONFIGURAÇÕES
// ==============================

const BUY_CHANNEL_NAME = "🛒・comprar";

// ==============================
// PERMISSÕES
// ==============================

function isAdmin(member) {
  if (!member) return false;

  return member.roles.cache.some(
    (role) =>
      role.name === "👑 DONO" ||
      role.name === "🛡️ ADMIN"
  );
}

// ==============================
// BOT ONLINE
// ==============================

client.once("ready", () => {
  console.log(`AutoSeller online como ${client.user.tag}`);

  // Produto inicial: 100 RAP
  if (!getProductByName("100 RAP")) {
    createProduct({
      name: "100 RAP",
      price: 3.5,
      stock: 0,
      active: true,
    });
  }

  // Produto inicial: 1000 RAP
  if (!getProductByName("1000 RAP")) {
    createProduct({
      name: "1000 RAP",
      price: 17.0,
      stock: 0,
      active: true,
    });
  }

  console.log("Produtos iniciais carregados.");
});

// ==============================
// COMANDOS
// ==============================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.trim();

  // ------------------------------
  // +ping
  // ------------------------------

  if (content === "+ping") {
    return message.reply("🏓 Pong!");
  }

  // ------------------------------
  // +painel
  // ------------------------------

  if (content === "+painel") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
    }

    const buyChannel = message.guild.channels.cache.find(
      (channel) => channel.name === BUY_CHANNEL_NAME
    );

    if (!buyChannel) {
      return message.reply(
        `❌ Não encontrei o canal ${BUY_CHANNEL_NAME}.`
      );
    }

    const product100 = getProductByName("100 RAP");
    const product1000 = getProductByName("1000 RAP");

    const status100 =
      product100 && product100.stock > 0
        ? `🟢 ${product100.stock} disponíveis`
        : "🔴 Sem estoque";

    const status1000 =
      product1000 && product1000.stock > 0
        ? `🟢 ${product1000.stock} disponíveis`
        : "🔴 Sem estoque";

    const embed = new EmbedBuilder()
      .setTitle("🩸 Berovenda's — Central de Compras")
      .setDescription(
        "Compre **RAP do Blade Ball** de forma rápida e segura.\n\n" +
        "Escolha seu produto pelo botão abaixo."
      )
      .addFields(
        {
          name: "💎 100 RAP",
          value:
            `💰 **R$ ${product100.price
              .toFixed(2)
              .replace(".", ",")}**\n` +
            `📦 ${status100}`,
          inline: true,
        },
        {
          name: "💎 1.000 RAP",
          value:
            `💰 **R$ ${product1000.price
              .toFixed(2)
              .replace(".", ",")}**\n` +
            `📦 ${status1000}`,
          inline: true,
        },
        {
          name: "📋 Informações",
          value:
            "• Máximo de **10 unidades por compra**\n" +
            "• Apenas **1 produto por ticket**\n" +
            "• Estoque atualizado automaticamente",
          inline: false,
        }
      )
      .setFooter({
        text: "Berovenda's • Blade Ball RAP",
      })
      .setTimestamp();

    // Quando configurarmos a URL do banner no Railway,
    // ele aparecerá automaticamente no painel.
    if (process.env.PANEL_IMAGE_URL) {
      embed.setImage(process.env.PANEL_IMAGE_URL);
    }

    const comprarButton = new ButtonBuilder()
      .setCustomId("buy_open")
      .setLabel("Comprar")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(
      comprarButton
    );

    await buyChannel.send({
      embeds: [embed],
      components: [row],
    });

    return message.reply(
      `✅ Painel publicado em ${buyChannel}.`
    );
  }

  // ------------------------------
  // +produtos
  // ------------------------------

  if (content === "+produtos") {
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
          `💰 Preço: R$ ${product.price
            .toFixed(2)
            .replace(".", ",")}\n` +
          `📊 Estoque: ${product.stock}\n` +
          `${status}`
        );
      })
      .join("\n\n");

    return message.reply(list);
  }

  // ------------------------------
  // +hs quantidade
  // ------------------------------

  if (content.startsWith("+hs")) {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
    }

    const args = content.split(/\s+/);

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
    const remaining = getHistoryCount();

    return message.reply(
      `🗑️ **Histórico limpo**\n\n` +
      `Solicitado: **${amount}**\n` +
      `Removido: **${removed}**\n` +
      `Restante: **${remaining}**`
    );
  }
});

// ==============================
// BOTÕES
// ==============================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "buy_open") {
    return interaction.reply({
      content:
        "🛒 O sistema de seleção de **100 RAP** e **1.000 RAP** será conectado neste botão na próxima etapa.",
      ephemeral: true,
    });
  }
});

// ==============================
// ERROS
// ==============================

client.on("error", (error) => {
  console.error("Erro do Discord:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Erro não tratado:", error);
});

// ==============================
// LOGIN
// ==============================

client.login(process.env.DISCORD_TOKEN);
