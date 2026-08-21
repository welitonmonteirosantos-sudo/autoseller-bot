const {
  Client,
  GatewayIntentBits,
} = require("discord.js");

const {
  initializeProducts,
} = require("./database/products");

const {
  handleInteraction,
} = require("./interactions");

const {
  publishPurchasePanel,
} = require("./commands/panel");

const {
  publishAdminPanel,
} = require("./commands/adminPanel");

const {
  removeOldest,
  getHistoryCount,
} = require("./database/history");

const {
  addAdminLog,
} = require("./database/adminLogs");

const {
  isAdmin,
} = require("./utils/permissions");

const {
  testConnection,
} = require("./database/db");

const {
  setupDatabase,
} = require("./database/setup");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ==============================
// BOT ONLINE
// ==============================

client.once("ready", async () => {
  try {
    const databaseConnected = await testConnection();

    if (!databaseConnected) {
      console.error(
        "Falha na conexão com o PostgreSQL."
      );

      return;
    }

    console.log(
      "Banco de dados PostgreSQL funcionando."
    );

    await setupDatabase();

    console.log(
      "Banco de dados preparado com sucesso."
    );

    await initializeProducts();

    console.log(
      "Produtos carregados no PostgreSQL."
    );

    console.log(
      `Berovenda's AutoSeller online como ${client.user.tag}`
    );
  } catch (error) {
    console.error(
      "Erro durante a inicialização do bot:",
      error
    );
  }
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

    try {
      const result = await publishPurchasePanel(
        message.guild
      );

      if (!result.success) {
        return message.reply(
          "❌ Não encontrei o canal de compras."
        );
      }

      await addAdminLog({
        adminId: message.author.id,
        adminName: message.author.username,
        action: "PUBLISH_PURCHASE_PANEL",
        details: {
          channelId: result.channel.id,
          messageId: result.message.id,
        },
      });

      return message.reply(
        `✅ Painel de compras publicado em ${result.channel}.`
      );
    } catch (error) {
      console.error(
        "Erro ao publicar painel de compras:",
        error
      );

      return message.reply(
        "❌ Não foi possível publicar o painel de compras."
      );
    }
  }

  // ------------------------------
  // +admin
  // ------------------------------

  if (content === "+admin") {
    if (!isAdmin(message.member)) {
      return message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
    }

    try {
      const result = await publishAdminPanel(
        message.guild
      );

      if (!result.success) {
        return message.reply(
          "❌ Não encontrei o canal administrativo `⚙️・painel`."
        );
      }

      await addAdminLog({
        adminId: message.author.id,
        adminName: message.author.username,
        action: "PUBLISH_ADMIN_PANEL",
        details: {
          channelId: result.channel.id,
          messageId: result.message.id,
        },
      });

      return message.reply(
        `✅ Painel administrativo publicado em ${result.channel}.`
      );
    } catch (error) {
      console.error(
        "Erro ao publicar painel administrativo:",
        error
      );

      return message.reply(
        "❌ Não foi possível publicar o painel administrativo."
      );
    }
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
        "❌ Use: `+hs 10`"
      );
    }

    const amount = Number(args[1]);

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "❌ Informe uma quantidade válida."
      );
    }

    try {
      const removed = await removeOldest(amount);
      const remaining = await getHistoryCount();

      await addAdminLog({
        adminId: message.author.id,
        adminName: message.author.username,
        action: "CLEAR_HISTORY",
        details: {
          requested: amount,
          removed,
          remaining,
        },
      });

      return message.reply(
        `🗑️ **Histórico limpo**\n\n` +
        `Solicitado: **${amount}**\n` +
        `Removido: **${removed}**\n` +
        `Restante: **${remaining}**`
      );
    } catch (error) {
      console.error(
        "Erro ao limpar histórico:",
        error
      );

      return message.reply(
        "❌ Não foi possível limpar o histórico."
      );
    }
  }
});

// ==============================
// INTERAÇÕES
// ==============================

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error(
        "Erro na interação:",
        error
      );

      if (!interaction.isRepliable()) {
        return;
      }

      const response = {
        content:
          "❌ Ocorreu um erro ao processar essa ação.",
        ephemeral: true,
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp(response)
          .catch(() => {});
      } else {
        await interaction
          .reply(response)
          .catch(() => {});
      }
    }
  }
);

// ==============================
// ERROS
// ==============================

client.on("error", (error) => {
  console.error(
    "Erro do Discord:",
    error
  );
});

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Erro não tratado:",
      error
    );
  }
);

// ==============================
// LOGIN
// ==============================

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "DISCORD_TOKEN não configurado."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
