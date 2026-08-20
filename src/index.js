const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`AutoSeller online como ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "+ping") {
  message.reply("🏓 Pong!");
}

if (message.content === "+hs") {
  const member = message.member;

  const autorizado =
    member.roles.cache.some((role) => role.name === "👑 DONO") ||
    member.roles.cache.some((role) => role.name === "🛡️ ADMIN");

  if (!autorizado) {
    return message.reply("❌ Você não tem permissão para usar este comando.");
  }

  message.reply("✅ Você tem permissão administrativa.");
}
});

client.login(process.env.DISCORD_TOKEN);
