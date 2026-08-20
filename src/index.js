const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`AutoSeller conectado como ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("Erro do Discord:", error);
});

client.login(process.env.DISCORD_TOKEN);
