const {
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const config = require("../config");

function sanitizeChannelName(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function createPurchaseTicket({
  guild,
  user,
  product,
  quantity,
  total,
}) {
  const adminRole = guild.roles.cache.find(
    (role) => role.name === config.roles.admin
  );

  const ownerRole = guild.roles.cache.find(
    (role) => role.name === config.roles.owner
  );

  const botMember = guild.members.me;

  const channelName = sanitizeChannelName(
    `compra-${product.name}-${user.username}`
  );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (adminRole) {
    overwrites.push({
      id: adminRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (ownerRole) {
    overwrites.push({
      id: ownerRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (botMember) {
    overwrites.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    reason: `Ticket de compra de ${user.tag}`,
  });

  await channel.send(
    `🛒 **Novo pedido — Berovenda's**\n\n` +
    `👤 Cliente: <@${user.id}>\n` +
    `📦 Produto: **${product.name}**\n` +
    `🔢 Quantidade: **${quantity}**\n` +
    `💰 Total: **R$ ${total.toFixed(2).replace(".", ",")}**\n\n` +
    `⏳ Aguarde as próximas instruções para pagamento e entrega.`
  );

  return channel;
}

module.exports = {
  createPurchaseTicket,
};
