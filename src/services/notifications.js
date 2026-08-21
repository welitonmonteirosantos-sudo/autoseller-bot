const config = require("../config");

async function notifyWaitlistUser({
  client,
  guild,
  userId,
  productName,
  position,
}) {
  const user = await client.users.fetch(userId).catch(() => null);

  if (!user) {
    return {
      dmSent: false,
      announcementSent: false,
    };
  }

  let dmSent = false;
  let announcementSent = false;

  try {
    await user.send(
      `📦 **${productName} voltou ao estoque!**\n\n` +
      `Você está na posição **#${position}** da lista de espera.\n` +
      `Você tem **1 minuto** para aproveitar a oportunidade.\n\n` +
      `⚠️ O estoque não fica reservado.`
    );

    dmSent = true;
  } catch (error) {
    console.error("Erro ao enviar DM:", error);
  }

  const announcementChannel = guild.channels.cache.find(
    (channel) => channel.name === config.channels.announcements
  );

  if (announcementChannel) {
    try {
      await announcementChannel.send(
        `📢 <@${userId}> **${productName} voltou ao estoque!**\n` +
        `Você está na posição **#${position}** da lista de espera e tem **1 minuto** para comprar.\n` +
        `⚠️ O estoque não fica reservado.`
      );

      announcementSent = true;
    } catch (error) {
      console.error("Erro ao enviar aviso:", error);
    }
  }

  return {
    dmSent,
    announcementSent,
  };
}

module.exports = {
  notifyWaitlistUser,
};
