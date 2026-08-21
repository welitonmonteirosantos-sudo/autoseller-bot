const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} = require('discord.js');
const { Pool } = require('pg');
const crypto = require('crypto');

const CONFIG = {
  brand: { name: "Berovenda's", color: 0xed1c24 },
  products: {
    rap_100: { id: 'rap_100', name: '100 RAP', rap: 100, defaultPrice: 3.50 },
    rap_1000: { id: 'rap_1000', name: '1.000 RAP', rap: 1000, defaultPrice: 17.00 },
  },
  maxQuantity: 10,
  waitlistMax: 10,
  waitlistOpportunityMs: 60_000,
  roles: {
    owner: '👑 DONO',
    admin: '🛡️ ADMIN',
    mod: '🔧 MOD',
    bot: '🤖 BOT',
    customer: '👤 CLIENTE',
    verified: '✅・Verificado',
    visitor: '🚪・Visitante',
    depressed: '🌧️・Depressivo',
    male: '♂️・Homem',
    female: '♀️・Mulher',
    adult: '🔞・+18',
    minor: '🧸・-18',
    lucky: '🍀・Sortudo',
  },
  categories: {
    public: 'AUTSELLER',
    admin: 'ADMINISTRAÇÃO',
    purchases: '🛒 COMPRAS',
    support: '🛠️ SUPORTE',
    entry: '🚪 ENTRADA',
    trades: '🔄 TROCAS',
  },
  channels: {
    announcements: '📢・avisos',
    buy: '🛒・comprar',
    supportPanel: '🎫・meu-ticket',
    waitlist: '👥・lista-de-espera',
    terms: '📜・termos-e-regras',
    feedback: '⭐・feedback',
    admin: '⚙️・painel',
    logs: '📋・logs',
    history: '📊・histórico',
    sales: '🛒・vendas',
    adminChat: '💬・chat-admin',
    commands: '📚・comandos',
    welcome: '👋・boas-vindas',
    verification: '✅・verificação',
    selfRoles: '🎭・escolha-seus-cargos',
    inactive: '🌧️・inativos',
    general: '💬・geral',
    steam: '🎮・steam',
    revenue: '💰・arrecadação',
    adminManual: '📘・manual-dos-adms',
    giveaways: '🎉・sorteios',
    trades: '🔄・trocas',
  },
};

const SELF_ROLES = [
  { key: 'otaku', name: '⚔️・Otaku', emoji: '⚔️' },
  { key: 'roblox', name: '🎮・Roblox', emoji: '🎮' },
  { key: 'freefire', name: '🔥・Free Fire', emoji: '🔥' },
  { key: 'emo', name: '🖤・Emo', emoji: '🖤' },
  { key: 'calmo', name: '🌸・Calmo', emoji: '🌸' },
  { key: 'noturno', name: '🌙・Noturno', emoji: '🌙' },
  { key: 'musica', name: '🎧・Música', emoji: '🎧' },
  { key: 'competitivo', name: '🏆・Competitivo', emoji: '🏆' },
];

const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN não configurado.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const waitlistTimers = new Map();
const money = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const isAdmin = (member) => member?.roles?.cache?.some((r) => [CONFIG.roles.owner, CONFIG.roles.admin].includes(r.name));
const isOwner = (member) => member?.roles?.cache?.some((r) => r.name === CONFIG.roles.owner);
const findChannel = (guild, name) => guild.channels.cache.find((c) => c.name === name);
const findRole = (guild, name) => guild.roles.cache.find((r) => r.name === name);
const unix = (d = new Date()) => Math.floor(new Date(d).getTime() / 1000);

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rap INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id BIGSERIAL PRIMARY KEY,
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notified_at TIMESTAMPTZ,
      opportunity_expires_at TIMESTAMPTZ,
      UNIQUE(product_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS history (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      product_id TEXT,
      product_name TEXT,
      quantity INTEGER,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      old_value TEXT,
      new_value TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL,
      subtotal NUMERIC(10,2),
      discount NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL,
      ticket_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      coupon_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED')),
      discount_value NUMERIC(10,2) NOT NULL,
      product_id TEXT,
      max_uses INTEGER,
      max_uses_per_user INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS coupon_uses (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      purchase_id BIGINT,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id BIGSERIAL PRIMARY KEY,
      purchase_id BIGINT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY(guild_id, key)
    );

    CREATE TABLE IF NOT EXISTS carts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      coupon_code TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS member_profiles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      gender TEXT,
      age_group TEXT,
      terms_accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS member_activity (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ,
      depressed_applied_at TIMESTAMPTZ,
      PRIMARY KEY(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS steam_accounts (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      game_title TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      added_by TEXT NOT NULL,
      reserved_by TEXT,
      buyer_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reserved_at TIMESTAMPTZ,
      sold_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS revenue_ledger (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      purchase_id BIGINT,
      mediator_user_id TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(entry_type, purchase_id)
    );

    CREATE TABLE IF NOT EXISTS giveaways (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prize TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      ends_at TIMESTAMPTZ,
      winner_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      drawn_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(giveaway_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      advertiser_id TEXT NOT NULL,
      advertiser_name TEXT NOT NULL,
      offer_text TEXT NOT NULL,
      want_text TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      channel_id TEXT,
      message_id TEXT,
      accepted_offer_id BIGINT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS trade_offers (
      id BIGSERIAL PRIMARY KEY,
      trade_id BIGINT NOT NULL,
      offerer_id TEXT NOT NULL,
      offerer_name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS trade_drafts (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      trade_id BIGINT,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trade_tickets (
      trade_id BIGINT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      advertiser_id TEXT NOT NULL,
      offerer_id TEXT NOT NULL,
      mediator_user_id TEXT,
      mediation_fee NUMERIC(10,2) NOT NULL DEFAULT 10,
      mediation_paid BOOLEAN NOT NULL DEFAULT FALSE,
      risk_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS mediation_earnings (
      id BIGSERIAL PRIMARY KEY,
      trade_id BIGINT UNIQUE NOT NULL,
      guild_id TEXT NOT NULL,
      mediator_user_id TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS opportunity_expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS guild_id TEXT`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS coupon_code TEXT`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ticket_id TEXT`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING'`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_id TEXT`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses_per_user INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_by TEXT`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS source TEXT`);

  await pool.query(`ALTER TABLE carts ADD COLUMN IF NOT EXISTS roblox_username TEXT`);

  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS roblox_username TEXT`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_type TEXT NOT NULL DEFAULT 'RAP'`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS steam_account_id BIGINT`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_steam_available ON steam_accounts(guild_id,status,created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trades_active ON trades(guild_id,status,expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(guild_id,status,ends_at)`);

  for (const p of Object.values(CONFIG.products)) {
    await pool.query(
      `INSERT INTO products(id,name,rap,price,stock,active)
       VALUES($1,$2,$3,$4,0,TRUE)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, rap=EXCLUDED.rap`,
      [p.id, p.name, p.rap, p.defaultPrice],
    );
  }
}

async function getProduct(id) {
  const r = await pool.query('SELECT * FROM products WHERE id=$1 LIMIT 1', [id]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], price: Number(r.rows[0].price), stock: Number(r.rows[0].stock) };
}

async function allProducts() {
  const r = await pool.query('SELECT * FROM products ORDER BY rap ASC');
  return r.rows.map((x) => ({ ...x, price: Number(x.price), stock: Number(x.stock) }));
}

async function addHistory(type, data = {}) {
  await pool.query(
    `INSERT INTO history(type,user_id,username,product_id,product_name,quantity,details)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      type,
      data.userId || null,
      data.username || null,
      data.productId || null,
      data.productName || null,
      data.quantity ?? null,
      data.details ? JSON.stringify(data.details) : null,
    ],
  );
}

async function adminLog(guild, user, action, data = {}) {
  await pool.query(
    `INSERT INTO admin_logs(admin_id,admin_name,action,product_id,product_name,old_value,new_value,details)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      user.id,
      user.username,
      action,
      data.productId || null,
      data.productName || null,
      data.oldValue == null ? null : String(data.oldValue),
      data.newValue == null ? null : String(data.newValue),
      data.details ? JSON.stringify(data.details) : null,
    ],
  );

  const ch = findChannel(guild, CONFIG.channels.logs);
  if (ch) {
    const embed = new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle('🛡️ Log administrativo')
      .addFields(
        { name: 'Administrador', value: `<@${user.id}>`, inline: true },
        { name: 'Ação', value: action, inline: true },
        { name: 'Produto', value: data.productName || 'Sistema', inline: true },
      )
      .setTimestamp();
    if (data.oldValue != null || data.newValue != null) {
      embed.addFields({ name: 'Alteração', value: `Anterior: **${data.oldValue ?? '-'}**\nNovo: **${data.newValue ?? '-'}**` });
    }
    await ch.send({ embeds: [embed] }).catch(() => {});
  }
}

async function setSetting(guildId, key, value) {
  await pool.query(
    `INSERT INTO settings(guild_id,key,value) VALUES($1,$2,$3)
     ON CONFLICT(guild_id,key) DO UPDATE SET value=EXCLUDED.value`,
    [guildId, key, value],
  );
}

async function getSetting(guildId, key) {
  const r = await pool.query('SELECT value FROM settings WHERE guild_id=$1 AND key=$2', [guildId, key]);
  return r.rows[0]?.value || null;
}

async function createPurchasePanel() {
  const [a, b] = await Promise.all([getProduct('rap_100'), getProduct('rap_1000')]);
  const stock = (p) => (p?.active && p.stock > 0 ? `🟢 ${p.stock} disponíveis` : '🔴 Sem estoque');
  const embed = new EmbedBuilder()
    .setColor(CONFIG.brand.color)
    .setTitle("Berovenda's — Central de Compras")
    .setDescription('Compre **RAP do Blade Ball** de forma rápida e segura.\n\nClique no botão abaixo para iniciar sua compra.')
    .addFields(
      { name: '💎 100 RAP', value: `💰 **${money(a.price)}**\n📦 ${stock(a)}`, inline: true },
      { name: '💎 1.000 RAP', value: `💰 **${money(b.price)}**\n📦 ${stock(b)}`, inline: true },
      { name: '📋 Informações', value: '• Escolha de **1 a 10 unidades**\n• **1 produto por ticket**\n• Estoque atualizado automaticamente\n• Cupons podem ser aplicados antes da confirmação', inline: false },
    )
    .setFooter({ text: "Berovenda's • Blade Ball RAP" })
    .setTimestamp();
  embed.setImage('attachment://vendarapdis.png');
  return {
    embeds: [embed],
    files: [{
      attachment: path.join(__dirname, '..', 'vendarapdis.png'),
      name: 'vendarapdis.png',
    }],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_open').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

async function createAdminPanel() {
  const [a, b] = await Promise.all([getProduct('rap_100'), getProduct('rap_1000')]);
  const embed = new EmbedBuilder()
    .setColor(CONFIG.brand.color)
    .setTitle("⚙️ Berovenda's — Painel Administrativo")
    .setDescription('Gerencie a loja pelos botões abaixo.\n\n🔒 **Acesso exclusivo da administração.**')
    .addFields(
      { name: '💎 100 RAP', value: `💰 ${money(a.price)}\n📦 Estoque: **${a.stock}**`, inline: true },
      { name: '💎 1.000 RAP', value: `💰 ${money(b.price)}\n📦 Estoque: **${b.stock}**`, inline: true },
    )
    .setTimestamp();
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admin_prices').setLabel('Preços').setEmoji('💰').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admin_coupons').setLabel('Cupons').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_waitlist').setLabel('Lista de espera').setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin_logs').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin_history').setLabel('Histórico').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_orders').setLabel('Pedidos').setEmoji('🛒').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin_steam').setLabel('Steam').setEmoji('🎮').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admin_revenue').setLabel('Arrecadação').setEmoji('💰').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admin_giveaways').setLabel('Sorteios').setEmoji('🎉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin_refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function sendOrUpdatePanel(guild, type) {
  const isPurchase = type === 'purchase';
  const channelName = isPurchase ? CONFIG.channels.buy : CONFIG.channels.admin;
  const ch = findChannel(guild, channelName);
  if (!ch) return null;
  const payload = isPurchase ? await createPurchasePanel() : await createAdminPanel();
  const key = isPurchase ? 'purchase_panel_message_id' : 'admin_panel_message_id';
  const oldId = await getSetting(guild.id, key);
  if (oldId) {
    const old = await ch.messages.fetch(oldId).catch(() => null);
    if (old) {
      await old.edit(payload);
      return old;
    }
  }
  const m = await ch.send(payload);
  await setSetting(guild.id, key, m.id);
  return m;
}

async function refreshPanels(guild) {
  await Promise.allSettled([sendOrUpdatePanel(guild, 'purchase'), sendOrUpdatePanel(guild, 'admin')]);
}

function productButtons(products) {
  return new ActionRowBuilder().addComponents(
    ...products.map((p) =>
      new ButtonBuilder()
        .setCustomId(`buy_product:${p.id}`)
        .setLabel(`${p.name} • ${money(p.price)}`)
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Danger),
    ),
  );
}

async function setCart(guildId, userId, productId, quantity = 1, couponCode = null) {
  await pool.query(
    `INSERT INTO carts(guild_id,user_id,product_id,quantity,coupon_code,updated_at)
     VALUES($1,$2,$3,$4,$5,NOW())
     ON CONFLICT(guild_id,user_id) DO UPDATE SET product_id=EXCLUDED.product_id,quantity=EXCLUDED.quantity,coupon_code=EXCLUDED.coupon_code,updated_at=NOW()`,
    [guildId, userId, productId, quantity, couponCode],
  );
}

async function getCart(guildId, userId) {
  const r = await pool.query('SELECT * FROM carts WHERE guild_id=$1 AND user_id=$2', [guildId, userId]);
  return r.rows[0] || null;
}

async function validateCoupon(code, userId, productId, subtotal) {
  if (!code) return { valid: true, code: null, discount: 0, total: subtotal };
  const normalized = String(code).trim().toUpperCase();
  const r = await pool.query('SELECT * FROM coupons WHERE code=$1 LIMIT 1', [normalized]);
  const c = r.rows[0];
  if (!c || !c.active) return { valid: false, reason: 'Cupom inexistente ou inativo.' };
  if (c.owner_user_id && c.owner_user_id !== userId) return { valid: false, reason: 'Este cupom pertence a outro cliente.' };
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return { valid: false, reason: 'Cupom expirado.' };
  if (c.product_id && c.product_id !== productId) return { valid: false, reason: 'Cupom não é válido para este produto.' };
  if (c.max_uses != null && Number(c.used_count) >= Number(c.max_uses)) return { valid: false, reason: 'Cupom atingiu o limite total de usos.' };
  const uses = await pool.query('SELECT COUNT(*)::int n FROM coupon_uses WHERE code=$1 AND user_id=$2', [normalized, userId]);
  if (Number(uses.rows[0].n) >= Number(c.max_uses_per_user)) return { valid: false, reason: 'Você já atingiu o limite de uso deste cupom.' };
  let discount = c.discount_type === 'PERCENT' ? subtotal * (Number(c.discount_value) / 100) : Number(c.discount_value);
  discount = Math.max(0, Math.min(subtotal, Number(discount.toFixed(2))));
  return { valid: true, code: normalized, coupon: c, discount, total: Number((subtotal - discount).toFixed(2)) };
}

async function cartMessage(guildId, userId) {
  const cart = await getCart(guildId, userId);
  if (!cart) return null;
  const p = await getProduct(cart.product_id);
  if (!p) return null;
  const q = Math.max(1, Math.min(CONFIG.maxQuantity, Number(cart.quantity)));
  const subtotal = Number((p.price * q).toFixed(2));
  const coupon = await validateCoupon(cart.coupon_code, userId, p.id, subtotal);
  const couponText = cart.coupon_code
    ? coupon.valid
      ? `🎟️ Cupom: **${coupon.code}** (-${money(coupon.discount)})`
      : `🎟️ Cupom: **${cart.coupon_code}** (inválido: ${coupon.reason})`
    : '🎟️ Cupom: **nenhum**';
  const total = coupon.valid ? coupon.total : subtotal;

  return {
    content:
      `🩸 **Berovenda's — ${p.name}**\n\n` +
      `💰 Preço unitário: **${money(p.price)}**\n` +
      `🔢 Quantidade: **${q}**\n` +
      `📦 Estoque atual: **${p.stock}**\n` +
      `🎮 Roblox: **${cart.roblox_username || 'não informado'}**\n` +
      `${couponText}\n` +
      `💵 Total: **${money(total)}**\n\n` +
      `Escolha de **1 a 10 unidades**. Se a quantidade for maior que o estoque no momento da confirmação, o pedido será ajustado ao estoque disponível.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cart_dec').setLabel('−').setStyle(ButtonStyle.Secondary).setDisabled(q <= 1),
        new ButtonBuilder().setCustomId('cart_qty').setLabel(String(q)).setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId('cart_inc').setLabel('+').setStyle(ButtonStyle.Secondary).setDisabled(q >= CONFIG.maxQuantity),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cart_roblox').setLabel('Usuário Roblox').setEmoji('🎮').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cart_coupon').setLabel('Aplicar cupom').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cart_coupon_remove').setLabel('Remover cupom').setStyle(ButtonStyle.Secondary).setDisabled(!cart.coupon_code),
        new ButtonBuilder().setCustomId('cart_confirm').setLabel('Confirmar compra').setEmoji('🛒').setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

async function joinWaitlist(productId, user) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const ex = await c.query('SELECT * FROM waitlist WHERE product_id=$1 AND user_id=$2', [productId, user.id]);
    if (ex.rowCount) {
      const pos = await c.query(
        `SELECT COUNT(*)::int p FROM waitlist
         WHERE product_id=$1 AND (joined_at,id) <= ($2,$3)`,
        [productId, ex.rows[0].joined_at, ex.rows[0].id],
      );
      await c.query('ROLLBACK');
      return { success: false, reason: 'ALREADY', position: pos.rows[0].p };
    }
    const count = await c.query('SELECT COUNT(*)::int n FROM waitlist WHERE product_id=$1', [productId]);
    if (count.rows[0].n >= CONFIG.waitlistMax) {
      await c.query('ROLLBACK');
      return { success: false, reason: 'FULL' };
    }
    await c.query('INSERT INTO waitlist(product_id,user_id,username) VALUES($1,$2,$3)', [productId, user.id, user.username]);
    await c.query('COMMIT');
    return { success: true, position: count.rows[0].n + 1, total: count.rows[0].n + 1 };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function leaveWaitlist(productId, userId) {
  const r = await pool.query('DELETE FROM waitlist WHERE product_id=$1 AND user_id=$2 RETURNING *', [productId, userId]);
  return r.rows[0] || null;
}

function timerKey(guildId, productId) {
  return `${guildId}:${productId}`;
}

async function resetWaitlistCycle(productId) {
  await pool.query('UPDATE waitlist SET notified_at=NULL, opportunity_expires_at=NULL WHERE product_id=$1', [productId]);
}

async function notifyNextWaitlist(guild, productId) {
  const p = await getProduct(productId);
  if (!p || p.stock <= 0) return;
  const next = await pool.query(
    `SELECT * FROM waitlist WHERE product_id=$1 AND notified_at IS NULL ORDER BY joined_at ASC,id ASC LIMIT 1`,
    [productId],
  );
  if (!next.rowCount) return;
  const row = next.rows[0];
  const expiresAt = new Date(Date.now() + CONFIG.waitlistOpportunityMs);
  await pool.query(
    'UPDATE waitlist SET notified_at=NOW(), opportunity_expires_at=$3 WHERE product_id=$1 AND user_id=$2',
    [productId, row.user_id, expiresAt],
  );

  const user = await client.users.fetch(row.user_id).catch(() => null);
  if (user) {
    await user.send(
      `📦 **${p.name} voltou ao estoque!**\n\n` +
      `Você tem **1 minuto** antes de o aviso passar para a próxima pessoa da fila.\n` +
      `⚠️ O estoque **não fica reservado**; qualquer cliente ainda pode comprar.`,
    ).catch(() => {});
  }
  const announcements = findChannel(guild, CONFIG.channels.announcements);
  if (announcements) {
    await announcements.send(
      `📢 <@${row.user_id}> **${p.name} voltou ao estoque!** Você tem **1 minuto** nesta rodada da fila. O estoque não fica reservado.`,
    ).catch(() => {});
  }
  await addHistory('WAITLIST_NOTIFY', {
    userId: row.user_id,
    username: row.username,
    productId: p.id,
    productName: p.name,
    details: { expiresAt: expiresAt.toISOString() },
  });

  const key = timerKey(guild.id, productId);
  if (waitlistTimers.has(key)) clearTimeout(waitlistTimers.get(key));
  const timer = setTimeout(async () => {
    waitlistTimers.delete(key);
    const still = await pool.query('SELECT 1 FROM waitlist WHERE product_id=$1 AND user_id=$2', [productId, row.user_id]);
    if (still.rowCount) {
      await addHistory('WAITLIST_EXPIRED', {
        userId: row.user_id,
        username: row.username,
        productId: p.id,
        productName: p.name,
      });
    }
    const current = await getProduct(productId);
    if (current?.stock > 0) await notifyNextWaitlist(guild, productId);
  }, CONFIG.waitlistOpportunityMs);
  waitlistTimers.set(key, timer);
}

async function startRestockNotifications(guild, productId) {
  await resetWaitlistCycle(productId);
  await notifyNextWaitlist(guild, productId);
}

async function resumeWaitlistTimers(guild) {
  for (const p of await allProducts()) {
    if (p.stock <= 0) continue;
    const active = await pool.query(
      `SELECT * FROM waitlist WHERE product_id=$1 AND opportunity_expires_at > NOW()
       ORDER BY opportunity_expires_at ASC LIMIT 1`,
      [p.id],
    );
    if (active.rowCount) {
      const ms = Math.max(1000, new Date(active.rows[0].opportunity_expires_at).getTime() - Date.now());
      const key = timerKey(guild.id, p.id);
      const timer = setTimeout(async () => {
        waitlistTimers.delete(key);
        await notifyNextWaitlist(guild, p.id);
      }, ms);
      waitlistTimers.set(key, timer);
    } else {
      const unnotified = await pool.query('SELECT 1 FROM waitlist WHERE product_id=$1 AND notified_at IS NULL LIMIT 1', [p.id]);
      if (unnotified.rowCount) await notifyNextWaitlist(guild, p.id);
    }
  }
}

async function ensureCategory(guild, name, overwrites = undefined) {
  let c = guild.channels.cache.find((x) => x.type === ChannelType.GuildCategory && x.name === name);
  if (!c) c = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
  else if (overwrites) await c.permissionOverwrites.set(overwrites).catch(() => {});
  return c;
}

async function ensureTextChannel(guild, name, parent, overwrites = undefined) {
  let c = findChannel(guild, name);
  if (!c) c = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parent?.id, permissionOverwrites: overwrites });
  else {
    if (parent && c.parentId !== parent.id) await c.setParent(parent.id, { lockPermissions: false }).catch(() => {});
    if (overwrites) await c.permissionOverwrites.set(overwrites).catch(() => {});
    else if (parent) await c.lockPermissions().catch(() => {});
  }
  return c;
}

async function ensureRole(guild, name, color = 0x2b2d31) {
  let role = findRole(guild, name);
  if (!role) role = await guild.roles.create({ name, color, reason: "Berovenda's setup" });
  return role;
}

async function seedMemberActivity(guild) {
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  for (const member of members.values()) {
    if (member.user.bot) continue;
    await pool.query(
      `INSERT INTO member_activity(guild_id,user_id,username,joined_at,last_message_at)
       VALUES($1,$2,$3,$4,NOW())
       ON CONFLICT(guild_id,user_id) DO UPDATE SET username=EXCLUDED.username`,
      [guild.id, member.id, member.user.username, member.joinedAt || new Date()],
    );
  }
}

async function recordMemberActivity(member) {
  if (!member || member.user.bot) return;
  await pool.query(
    `INSERT INTO member_activity(guild_id,user_id,username,joined_at,last_message_at,depressed_applied_at)
     VALUES($1,$2,$3,$4,NOW(),NULL)
     ON CONFLICT(guild_id,user_id) DO UPDATE SET username=EXCLUDED.username,last_message_at=NOW(),depressed_applied_at=NULL`,
    [member.guild.id, member.id, member.user.username, member.joinedAt || new Date()],
  );
  const depressed = findRole(member.guild, CONFIG.roles.depressed);
  if (depressed && member.roles.cache.has(depressed.id)) await member.roles.remove(depressed).catch(() => {});
}

async function checkInactiveMembers() {
  for (const guild of client.guilds.cache.values()) {
    const depressed = findRole(guild, CONFIG.roles.depressed);
    if (!depressed) continue;
    const rows = (await pool.query(
      `SELECT * FROM member_activity
       WHERE guild_id=$1 AND depressed_applied_at IS NULL
       AND COALESCE(last_message_at, joined_at) <= NOW() - INTERVAL '3 days'`,
      [guild.id],
    )).rows;
    for (const row of rows) {
      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (!member || member.user.bot || isAdmin(member)) continue;
      if (!member.roles.cache.has(depressed.id)) await member.roles.add(depressed).catch(() => {});
      await pool.query('UPDATE member_activity SET depressed_applied_at=NOW() WHERE guild_id=$1 AND user_id=$2', [guild.id, row.user_id]);
      const ch = findChannel(guild, CONFIG.channels.inactive);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🌧️ Novo membro do clube dos sumidos')
          .setDescription(`Anão... após <@${member.id}> ficar **3 dias sem conversar**, se tornou ${depressed}.`)
          .setImage('attachment://tristekawai.png')
          .setTimestamp();
        await ch.send({
          content: '||@everyone||',
          embeds: [embed],
          files: [{ attachment: path.join(__dirname, '..', 'tristekawai.png'), name: 'tristekawai.png' }],
          allowedMentions: { parse: ['everyone', 'users', 'roles'] },
        }).catch(() => {});
      }
    }
  }
}

async function ensureServerStructure(guild) {
  const ownerRole = await ensureRole(guild, CONFIG.roles.owner, 0xed1c24);
  const adminRole = await ensureRole(guild, CONFIG.roles.admin, 0xed1c24);
  const modRole = await ensureRole(guild, CONFIG.roles.mod, 0xffffff);
  await ensureRole(guild, CONFIG.roles.bot, 0x2b2d31);
  const customerRole = await ensureRole(guild, CONFIG.roles.customer, 0xffffff);
  const verifiedRole = await ensureRole(guild, CONFIG.roles.verified, 0xed1c24);
  const visitorRole = await ensureRole(guild, CONFIG.roles.visitor, 0x808080);
  await ensureRole(guild, CONFIG.roles.depressed, 0x5865f2);
  await ensureRole(guild, CONFIG.roles.male, 0x3498db);
  await ensureRole(guild, CONFIG.roles.female, 0xff69b4);
  await ensureRole(guild, CONFIG.roles.adult, 0xed1c24);
  await ensureRole(guild, CONFIG.roles.minor, 0xffffff);
  await ensureRole(guild, CONFIG.roles.lucky, 0x57f287);
  for (const item of SELF_ROLES) await ensureRole(guild, item.name, 0x2b2d31);

  const adminAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];
  const adminOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: adminRole.id, allow: adminAllow },
    { id: ownerRole.id, allow: adminAllow },
    { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const entryOverwrites = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: adminRole.id, allow: adminAllow },
    { id: ownerRole.id, allow: adminAllow },
  ];

  const publicOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: verifiedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: adminRole.id, allow: adminAllow },
    { id: ownerRole.id, allow: adminAllow },
    { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const entryCat = await ensureCategory(guild, CONFIG.categories.entry, entryOverwrites);
  const publicCat = await ensureCategory(guild, CONFIG.categories.public, publicOverwrites);
  const adminCat = await ensureCategory(guild, CONFIG.categories.admin, adminOverwrites);
  const purchaseCat = await ensureCategory(guild, CONFIG.categories.purchases, [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]);
  const supportCat = await ensureCategory(guild, CONFIG.categories.support, [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]);
  const tradeCat = await ensureCategory(guild, CONFIG.categories.trades, [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: adminRole.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerRole.id, allow: adminAllow },
  ]);

  await ensureTextChannel(guild, CONFIG.channels.welcome, entryCat, entryOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.terms, entryCat, entryOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.verification, entryCat, entryOverwrites);

  await ensureTextChannel(guild, CONFIG.channels.announcements, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.buy, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.supportPanel, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.waitlist, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.selfRoles, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.inactive, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.general, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.steam, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.giveaways, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.trades, publicCat);

  const feedbackOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: customerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: adminRole.id, allow: adminAllow },
    { id: ownerRole.id, allow: adminAllow },
  ];
  await ensureTextChannel(guild, CONFIG.channels.feedback, publicCat, feedbackOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.admin, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.adminChat, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.commands, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.logs, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.history, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.sales, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.revenue, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.adminManual, adminCat, adminOverwrites);

  await seedMemberActivity(guild);
  return { entryCat, publicCat, adminCat, purchaseCat, supportCat, tradeCat, verifiedRole, visitorRole };
}

async function publishStaticPanels(guild) {
  const supportCh = findChannel(guild, CONFIG.channels.supportPanel);
  if (supportCh) {
    const oldId = await getSetting(guild.id, 'support_panel_message_id');
    const payload = {
      files: [{ attachment: path.join(__dirname, '..', 'kawai.png'), name: 'kawai.png' }],
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('🛠️ Suporte — Berovenda\'s').setDescription('Precisa de ajuda? Abra um ticket privado de suporte pelo botão abaixo.').setImage('attachment://kawai.png')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('support_open').setLabel('Abrir suporte').setEmoji('🎫').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('game_order_open').setLabel('Encomendar jogo').setEmoji('🎮').setStyle(ButtonStyle.Secondary),
      )],
    };
    const old = oldId ? await supportCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await supportCh.send(payload);
    await setSetting(guild.id, 'support_panel_message_id', msg.id);
  }

  const waitCh = findChannel(guild, CONFIG.channels.waitlist);
  if (waitCh) {
    const oldId = await getSetting(guild.id, 'waitlist_panel_message_id');
    const payload = {
      files: [{ attachment: path.join(__dirname, '..', 'kawai1.png'), name: 'kawai1.png' }],
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('👥 Lista de espera').setDescription('Quando um produto estiver sem estoque, entre na fila pelo painel de compras. Use os botões abaixo para consultar sua posição ou sair da fila.').setImage('attachment://kawai1.png')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wait_my_position').setLabel('Minha posição').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('wait_leave_menu').setLabel('Sair da espera').setStyle(ButtonStyle.Secondary),
      )],
    };
    const old = oldId ? await waitCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await waitCh.send(payload);
    await setSetting(guild.id, 'waitlist_panel_message_id', msg.id);
  }

  const verifyCh = findChannel(guild, CONFIG.channels.verification);
  if (verifyCh) {
    const oldId = await getSetting(guild.id, 'verification_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle("✅ Berovenda's — Verificação")
        .setDescription('Para liberar o servidor, escolha seu perfil e depois aceite os termos.\n\n**1. Gênero**\nEscolha Homem ou Mulher.\n\n**2. Faixa etária**\nEscolha +18 ou -18.\n\n**3. Termos**\nLeia o canal de termos e clique em **Concordo com os termos**.')],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_gender:male').setLabel('Homem').setEmoji('♂️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('verify_gender:female').setLabel('Mulher').setEmoji('♀️').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_age:adult').setLabel('+18').setEmoji('🔞').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('verify_age:minor').setLabel('-18').setEmoji('🧸').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_accept').setLabel('Concordo com os termos').setEmoji('✅').setStyle(ButtonStyle.Danger),
        ),
      ],
    };
    const old = oldId ? await verifyCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await verifyCh.send(payload);
    await setSetting(guild.id, 'verification_message_id', msg.id);
  }

  const rolesCh = findChannel(guild, CONFIG.channels.selfRoles);
  if (rolesCh) {
    const oldId = await getSetting(guild.id, 'self_roles_message_id');
    const rows = [];
    for (let i = 0; i < SELF_ROLES.length; i += 4) {
      rows.push(new ActionRowBuilder().addComponents(...SELF_ROLES.slice(i, i + 4).map((item) =>
        new ButtonBuilder().setCustomId(`selfrole:${item.key}`).setLabel(item.name.replace(/^.+?・/, '')).setEmoji(item.emoji).setStyle(ButtonStyle.Secondary)
      )));
    }
    const payload = {
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('🎭 Escolha seus cargos').setDescription(
        'Clique para **adicionar ou remover** seus cargos.\n\n' +
        SELF_ROLES.map((x) => `${x.emoji} ${x.name}`).join('\n') +
        `\n\n🌧️ **${CONFIG.roles.depressed}** é automático: aparece após 3 dias sem conversar e sai quando você volta a falar.`
      )],
      components: rows,
    };
    const old = oldId ? await rolesCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await rolesCh.send(payload);
    await setSetting(guild.id, 'self_roles_message_id', msg.id);
  }

  const commandsCh = findChannel(guild, CONFIG.channels.commands);
  if (commandsCh) {
    const oldId = await getSetting(guild.id, 'commands_message_id');
    const payload = { embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('📚 Comandos administrativos').setDescription(
      '`+ping` — testa o bot.\n' +
      '`+setup` — cria/verifica cargos, canais, permissões e painéis.\n' +
      '`+painel` — atualiza o painel de compras.\n' +
      '`+admin` — atualiza o painel administrativo.\n' +
      '`+hs 10` — apaga 10 registros mais antigos do histórico comum.\n' +
      '`+excluir 1` até `+excluir 100` — apaga mensagens recentes do canal atual.\n' +
      '`+setup` também publica Steam, sorteios, trocas, manual de ADMs e arrecadação.\n\n🔒 Comandos administrativos: **DONO/ADMIN**.'
    ).setTimestamp()] };
    const old = oldId ? await commandsCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await commandsCh.send(payload);
    await setSetting(guild.id, 'commands_message_id', msg.id);
  }


  const steamCh = findChannel(guild, CONFIG.channels.steam);
  if (steamCh) {
    const oldId = await getSetting(guild.id, 'steam_panel_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle("🎮 Berovenda's — Contas Steam")
        .setDescription('Contas Steam compartilhadas disponíveis para entrega automática após a confirmação do pagamento.\n\nAs credenciais ficam protegidas e só são enviadas ao comprador.')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('steam_browse').setLabel('Ver contas disponíveis').setEmoji('🎮').setStyle(ButtonStyle.Danger),
      )],
    };
    const old = oldId ? await steamCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await steamCh.send(payload);
    await setSetting(guild.id, 'steam_panel_message_id', msg.id);
  }

  const giveawayCh = findChannel(guild, CONFIG.channels.giveaways);
  if (giveawayCh) {
    const oldId = await getSetting(guild.id, 'giveaway_panel_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle('🎉 Sorteios — Berovenda\'s')
        .setDescription('Os sorteios ativos aparecem neste canal. Clique em **Participar** no sorteio desejado. O vencedor recebe automaticamente o cargo **🍀・Sortudo**.')],
    };
    const old = oldId ? await giveawayCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await giveawayCh.send(payload);
    await setSetting(guild.id, 'giveaway_panel_message_id', msg.id);
  }

  const tradesCh = findChannel(guild, CONFIG.channels.trades);
  if (tradesCh) {
    const oldId = await getSetting(guild.id, 'trades_panel_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle('🔄 Trocas entre membros')
        .setDescription(
          'Publique uma troca de conta/item com **foto obrigatória**. O anúncio fica ativo por **30 minutos**.\n\n' +
          'Quem tiver interesse pode clicar em **Oferta** e enviar foto + descrição opcional. Se uma oferta for aceita, o bot abre um ticket privado visível somente pelos dois participantes, o **DONO** e, se solicitado, o mediador escolhido.'
        )],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('trade_create').setLabel('Criar anúncio').setEmoji('🔄').setStyle(ButtonStyle.Danger),
      )],
    };
    const old = oldId ? await tradesCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await tradesCh.send(payload);
    await setSetting(guild.id, 'trades_panel_message_id', msg.id);
  }

  const revenueCh = findChannel(guild, CONFIG.channels.revenue);
  if (revenueCh) {
    const splitOwner = Number((await getSetting(guild.id, 'owner_share_percent')) || 60);
    const splitAdmin = Number((await getSetting(guild.id, 'admin_pool_percent')) || 40);
    const oldId = await getSetting(guild.id, 'revenue_info_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle('💰 Arrecadação e divisão')
        .setDescription(
          `A arrecadação soma automaticamente as vendas concluídas.\n\n` +
          `👑 DONO: **${splitOwner}%**\n` +
          `🛡️ Pool dos ADMs: **${splitAdmin}%** (dividido igualmente entre ADMs)\n` +
          `🤝 Mediação: **R$ 10,00** por mediação concluída, **100% do mediador**.\n\n` +
          'As porcentagens podem ser alteradas pelo DONO no painel administrativo.'
        )],
    };
    const old = oldId ? await revenueCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await revenueCh.send(payload);
    await setSetting(guild.id, 'revenue_info_message_id', msg.id);
  }

  const manualCh = findChannel(guild, CONFIG.channels.adminManual);
  if (manualCh) {
    const ownerPct = Number((await getSetting(guild.id, 'owner_share_percent')) || 60);
    const adminPct = Number((await getSetting(guild.id, 'admin_pool_percent')) || 40);
    const oldId = await getSetting(guild.id, 'admin_manual_message_id');
    const payload = {
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle('📘 Manual dos ADMs — Berovenda\'s')
        .setDescription(
          '**Salário / participação**\n' +
          `• Pool atual da equipe: **${adminPct}%** das vendas concluídas, dividido entre ADMs.\n` +
          `• DONO: **${ownerPct}%**.\n` +
          '• Mediações concluídas: **R$ 10,00**, 100% do ADM mediador.\n\n' +
          '**Regras para manter o cargo**\n' +
          '• Não compartilhar dados de clientes, credenciais ou informações internas.\n' +
          '• Não confirmar pagamento sem conferir.\n' +
          '• Não marcar pedido como entregue sem a entrega real.\n' +
          '• Não usar comandos de moderação para benefício próprio.\n' +
          '• Não entrar em tickets de troca privados sem ter sido chamado como mediador.\n' +
          '• Manter respeito com clientes e equipe.\n\n' +
          '**Comandos importantes**\n' +
          '`+setup`, `+painel`, `+admin`, `+hs N`, `+excluir N`.\n\n' +
          'Quebras graves dessas regras podem resultar na remoção do cargo.'
        )],
    };
    const old = oldId ? await manualCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await manualCh.send(payload);
    await setSetting(guild.id, 'admin_manual_message_id', msg.id);
  }

  const termsCh = findChannel(guild, CONFIG.channels.terms);
  if (termsCh) {
    const oldId = await getSetting(guild.id, 'terms_message_id');
    const embed = new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle("📜 Berovenda's — Termos, regras e reembolso")
      .setDescription(
        '**Regras gerais**\n' +
        '• Confira produto e quantidade antes de confirmar.\n' +
        '• Não envie senhas, códigos de autenticação ou dados sensíveis em tickets.\n' +
        '• Tentativas de fraude, chargeback indevido ou abuso do suporte podem resultar em bloqueio.\n\n' +
        '**Reembolso**\n' +
        '• Pedidos cancelados antes da entrega podem ser analisados pela administração.\n' +
        '• Após a entrega marcada como concluída, pedidos de reembolso são analisados quando houver erro de entrega atribuível à loja.\n' +
        '• Pagamentos e estornos dependem também das regras do intermediador utilizado.\n\n' +
        'Ao comprar, o cliente declara estar de acordo com estas condições.'
      );
    const payload = { embeds: [embed] };
    const old = oldId ? await termsCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await termsCh.send(payload);
    await setSetting(guild.id, 'terms_message_id', msg.id);
  }
}

async function createPrivateTicket(guild, user, type, purchase = null) {
  const adminRole = findRole(guild, CONFIG.roles.admin);
  const ownerRole = findRole(guild, CONFIG.roles.owner);
  const categoryName = type === 'purchase' ? CONFIG.categories.purchases : CONFIG.categories.support;
  const category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === categoryName);
  const safe = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'cliente';
  const name = type === 'purchase' ? `compra-${purchase.id}-${safe}` : `suporte-${safe}-${user.id.slice(-4)}`;
  if (type === 'support') {
    const existing = guild.channels.cache.find((c) => c.name === name);
    if (existing) return existing;
  }
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ...(ownerRole ? [{ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
  ];
  return guild.channels.create({ name, type: ChannelType.GuildText, parent: category?.id, permissionOverwrites: overwrites });
}

async function createPurchase(user, guild, productId, requestedQuantity) {
  const db = await pool.connect();
  let purchase = null;
  let couponUsed = null;
  try {
    await db.query('BEGIN');
    const prodRes = await db.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [productId]);
    if (!prodRes.rowCount) { await db.query('ROLLBACK'); return { success: false, reason: 'NOT_FOUND' }; }
    const p = { ...prodRes.rows[0], price: Number(prodRes.rows[0].price), stock: Number(prodRes.rows[0].stock) };
    if (!p.active) { await db.query('ROLLBACK'); return { success: false, reason: 'DISABLED' }; }
    if (p.stock <= 0) { await db.query('ROLLBACK'); return { success: false, reason: 'OUT' }; }
    const q = Math.min(Math.max(1, requestedQuantity), CONFIG.maxQuantity, p.stock);
    const subtotal = Number((p.price * q).toFixed(2));
    const cart = await db.query('SELECT coupon_code,roblox_username FROM carts WHERE guild_id=$1 AND user_id=$2', [guild.id, user.id]);
    const couponCode = cart.rows[0]?.coupon_code || null;
    const robloxUsername = cart.rows[0]?.roblox_username || null;
    if (!robloxUsername) {
      await db.query('ROLLBACK');
      return { success: false, reason: 'ROBLOX_REQUIRED' };
    }

    let discount = 0;
    let total = subtotal;
    if (couponCode) {
      const couponRes = await db.query('SELECT * FROM coupons WHERE code=$1 FOR UPDATE', [couponCode]);
      const c = couponRes.rows[0];
      if (c && c.active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (!c.product_id || c.product_id === productId)) {
        const userUses = await db.query('SELECT COUNT(*)::int n FROM coupon_uses WHERE code=$1 AND user_id=$2', [couponCode, user.id]);
        const totalOkay = c.max_uses == null || Number(c.used_count) < Number(c.max_uses);
        const userOkay = Number(userUses.rows[0].n) < Number(c.max_uses_per_user);
        if (totalOkay && userOkay) {
          discount = c.discount_type === 'PERCENT' ? subtotal * (Number(c.discount_value) / 100) : Number(c.discount_value);
          discount = Math.max(0, Math.min(subtotal, Number(discount.toFixed(2))));
          total = Number((subtotal - discount).toFixed(2));
          couponUsed = couponCode;
        }
      }
    }

    await db.query('UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1', [productId, q]);
    const ins = await db.query(
      `INSERT INTO purchases(guild_id,user_id,username,product_id,product_name,quantity,unit_price,subtotal,discount,total,status,coupon_code,roblox_username,purchase_type)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11,$12,'RAP') RETURNING *`,
      [guild.id, user.id, user.username, p.id, p.name, q, p.price, subtotal, discount, total, couponUsed, robloxUsername],
    );
    purchase = ins.rows[0];
    if (couponUsed) {
      await db.query('UPDATE coupons SET used_count=used_count+1 WHERE code=$1', [couponUsed]);
      await db.query('INSERT INTO coupon_uses(code,user_id,purchase_id) VALUES($1,$2,$3)', [couponUsed, user.id, purchase.id]);
    }
    await db.query('DELETE FROM carts WHERE guild_id=$1 AND user_id=$2', [guild.id, user.id]);
    await db.query('COMMIT');

    const ticket = await createPrivateTicket(guild, user, 'purchase', purchase);
    await pool.query('UPDATE purchases SET ticket_id=$2 WHERE id=$1', [purchase.id, ticket.id]);
    purchase.ticket_id = ticket.id;

    const paymentInstructions = process.env.PAYMENT_INSTRUCTIONS || 'Aguarde um administrador informar ou confirmar o pagamento neste ticket.';
    const embed = new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle(`🛒 Pedido #${purchase.id}`)
      .addFields(
        { name: 'Cliente', value: `<@${user.id}>`, inline: true },
        { name: '🎮 Roblox', value: purchase.roblox_username || 'Não informado', inline: true },
        { name: 'Produto', value: purchase.product_name, inline: true },
        { name: 'Quantidade', value: String(purchase.quantity), inline: true },
        { name: 'Subtotal', value: money(purchase.subtotal), inline: true },
        { name: 'Desconto', value: money(purchase.discount), inline: true },
        { name: 'Total', value: `**${money(purchase.total)}**`, inline: true },
        { name: 'Cupom', value: purchase.coupon_code || 'Nenhum', inline: true },
        { name: 'Status', value: '🟡 Aguardando pagamento', inline: true },
        { name: 'Pagamento', value: paymentInstructions, inline: false },
      )
      .setTimestamp();
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`purchase_paid:${purchase.id}`).setLabel('Pagamento recebido').setEmoji('💰').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`purchase_complete:${purchase.id}`).setLabel('Marcar entregue').setEmoji('✅').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`purchase_cancel:${purchase.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar ticket').setStyle(ButtonStyle.Secondary),
    );
    await ticket.send({ content: `<@${user.id}>`, embeds: [embed], components: [buttons] });

    await pool.query('DELETE FROM waitlist WHERE product_id=$1 AND user_id=$2', [productId, user.id]);
    await addHistory('PURCHASE_CREATED', {
      userId: user.id,
      username: user.username,
      productId: p.id,
      productName: p.name,
      quantity: q,
      details: { purchaseId: Number(purchase.id), total, discount, couponCode: couponUsed, ticketId: ticket.id },
    });
    await refreshPanels(guild);
    return { success: true, purchase, ticket, adjusted: q !== requestedQuantity };
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch {}
    if (purchase) {
      await pool.query('UPDATE products SET stock=stock+$2 WHERE id=$1', [purchase.product_id, purchase.quantity]).catch(() => {});
      await pool.query('DELETE FROM purchases WHERE id=$1', [purchase.id]).catch(() => {});
      if (couponUsed) {
        await pool.query('UPDATE coupons SET used_count=GREATEST(0,used_count-1) WHERE code=$1', [couponUsed]).catch(() => {});
        await pool.query('DELETE FROM coupon_uses WHERE purchase_id=$1', [purchase.id]).catch(() => {});
      }
    }
    throw e;
  } finally {
    db.release();
  }
}

async function handleAdminStock(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const id = interaction.customId || '';
  if (id === 'admin_stock') {
    const ps = await allProducts();
    return interaction.reply({
      content: '📦 **Gerenciamento de estoque**',
      components: [new ActionRowBuilder().addComponents(...ps.map((p) => new ButtonBuilder().setCustomId(`stock_product:${p.id}`).setLabel(`${p.name} • ${p.stock}`).setStyle(ButtonStyle.Danger)))],
      ephemeral: true,
    });
  }
  if (id.startsWith('stock_product:')) {
    const p = await getProduct(id.split(':')[1]);
    return interaction.update({
      content: `📦 **${p.name}**\nEstoque atual: **${p.stock}**`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stock_add:${p.id}`).setLabel('Adicionar estoque').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`stock_set:${p.id}`).setLabel('Definir estoque').setStyle(ButtonStyle.Secondary),
      )],
    });
  }
  if (id.startsWith('stock_add:') || id.startsWith('stock_set:')) {
    const [mode, productId] = id.split(':');
    const p = await getProduct(productId);
    const modal = new ModalBuilder().setCustomId(`stock_modal:${mode === 'stock_add' ? 'add' : 'set'}:${productId}`).setTitle(`Estoque • ${p.name}`);
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('quantity').setLabel(mode === 'stock_add' ? 'Quantidade a adicionar' : 'Novo estoque').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: 10'),
    ));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id.startsWith('stock_modal:')) {
    const [, mode, productId] = id.split(':');
    const q = Number(interaction.fields.getTextInputValue('quantity'));
    if (!Number.isInteger(q) || q < 0 || (mode === 'add' && q === 0)) return interaction.reply({ content: '❌ Quantidade inválida.', ephemeral: true });
    const before = await getProduct(productId);
    const newStock = mode === 'add' ? before.stock + q : q;
    await pool.query('UPDATE products SET stock=$2,updated_at=NOW() WHERE id=$1', [productId, newStock]);
    await adminLog(interaction.guild, interaction.user, mode === 'add' ? 'ADD_STOCK' : 'SET_STOCK', { productId, productName: before.name, oldValue: before.stock, newValue: newStock });
    await refreshPanels(interaction.guild);
    if (newStock > before.stock && newStock > 0) await startRestockNotifications(interaction.guild, productId);
    return interaction.reply({ content: `✅ Estoque de **${before.name}** atualizado: **${before.stock} → ${newStock}**.`, ephemeral: true });
  }
}

async function handleAdminPrices(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const id = interaction.customId || '';
  if (id === 'admin_prices') {
    const ps = await allProducts();
    return interaction.reply({
      content: '💰 **Gerenciamento de preços**',
      components: [new ActionRowBuilder().addComponents(...ps.map((p) => new ButtonBuilder().setCustomId(`price_product:${p.id}`).setLabel(`${p.name} • ${money(p.price)}`).setStyle(ButtonStyle.Danger)))],
      ephemeral: true,
    });
  }
  if (id.startsWith('price_product:')) {
    const p = await getProduct(id.split(':')[1]);
    const modal = new ModalBuilder().setCustomId(`price_modal:${p.id}`).setTitle(`Preço • ${p.name}`);
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('price').setLabel('Novo preço').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: 3,50'),
    ));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id.startsWith('price_modal:')) {
    const productId = id.split(':')[1];
    const value = Number(interaction.fields.getTextInputValue('price').replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return interaction.reply({ content: '❌ Preço inválido.', ephemeral: true });
    const before = await getProduct(productId);
    await pool.query('UPDATE products SET price=$2,updated_at=NOW() WHERE id=$1', [productId, value]);
    await adminLog(interaction.guild, interaction.user, 'SET_PRICE', { productId, productName: before.name, oldValue: before.price, newValue: value });
    await refreshPanels(interaction.guild);
    return interaction.reply({ content: `✅ Preço de **${before.name}** alterado para **${money(value)}**.`, ephemeral: true });
  }
}

async function handleCoupons(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const id = interaction.customId || '';
  if (id === 'admin_coupons') {
    return interaction.reply({
      content: '🎟️ **Cupons promocionais**\nCrie, consulte ou desative códigos.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('coupon_create').setLabel('Criar cupom').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('coupon_list').setLabel('Ver cupons').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('coupon_disable').setLabel('Desativar cupom').setStyle(ButtonStyle.Secondary),
      )],
      ephemeral: true,
    });
  }
  if (id === 'coupon_create') {
    const modal = new ModalBuilder().setCustomId('coupon_create_modal').setTitle('Criar cupom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: BERO10')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discount').setLabel('Desconto: PERCENT 10 ou FIXED 2.50').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('PERCENT 10')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product').setLabel('Produto: ALL, 100 ou 1000').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('ALL')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limits').setLabel('Limites: total,por usuário').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100,1')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duração em minutos (0 = sem expirar)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60')),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id === 'coupon_create_modal') {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const [typeRaw, valueRaw] = interaction.fields.getTextInputValue('discount').trim().split(/\s+/);
    const type = typeRaw?.toUpperCase();
    const value = Number(String(valueRaw || '').replace(',', '.'));
    const productRaw = interaction.fields.getTextInputValue('product').trim().toUpperCase();
    const [maxRaw, perRaw] = interaction.fields.getTextInputValue('limits').split(',').map((x) => x.trim());
    const maxUses = Number(maxRaw);
    const perUser = Number(perRaw);
    const duration = Number(interaction.fields.getTextInputValue('duration'));
    const productId = productRaw === 'ALL' ? null : productRaw === '100' ? 'rap_100' : productRaw === '1000' ? 'rap_1000' : 'INVALID';
    if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !['PERCENT', 'FIXED'].includes(type) || !Number.isFinite(value) || value <= 0 || productId === 'INVALID' || !Number.isInteger(maxUses) || maxUses <= 0 || !Number.isInteger(perUser) || perUser <= 0 || !Number.isFinite(duration) || duration < 0) {
      return interaction.reply({ content: '❌ Dados inválidos. Exemplo: `BERO10`, `PERCENT 10`, `ALL`, `100,1`, `60`.', ephemeral: true });
    }
    if (type === 'PERCENT' && value > 100) return interaction.reply({ content: '❌ Desconto percentual não pode passar de 100%.', ephemeral: true });
    const expires = duration === 0 ? null : new Date(Date.now() + duration * 60_000);
    try {
      await pool.query(
        `INSERT INTO coupons(code,discount_type,discount_value,product_id,max_uses,max_uses_per_user,expires_at,active,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8)`,
        [code, type, value, productId, maxUses, perUser, expires, interaction.user.id],
      );
    } catch (e) {
      if (e.code === '23505') return interaction.reply({ content: '❌ Já existe um cupom com esse código.', ephemeral: true });
      throw e;
    }
    await adminLog(interaction.guild, interaction.user, 'CREATE_COUPON', { details: { code, type, value, productId, maxUses, perUser, expires } });
    return interaction.reply({ content: `✅ Cupom **${code}** criado com sucesso.`, ephemeral: true });
  }
  if (id === 'coupon_list') {
    const rows = (await pool.query('SELECT * FROM coupons ORDER BY created_at DESC LIMIT 20')).rows;
    const text = rows.length ? rows.map((c) => {
      const target = c.product_id === 'rap_100' ? '100 RAP' : c.product_id === 'rap_1000' ? '1.000 RAP' : 'Todos';
      const discount = c.discount_type === 'PERCENT' ? `${Number(c.discount_value)}%` : money(c.discount_value);
      const expiry = c.expires_at ? `<t:${unix(c.expires_at)}:R>` : 'Sem expiração';
      return `• **${c.code}** — ${discount} — ${target} — usos ${c.used_count}/${c.max_uses ?? '∞'} — por usuário ${c.max_uses_per_user} — ${c.active ? '🟢' : '🔴'} — ${expiry}`;
    }).join('\n') : 'Nenhum cupom cadastrado.';
    return interaction.reply({ content: `🎟️ **Cupons**\n\n${text}`, ephemeral: true });
  }
  if (id === 'coupon_disable') {
    const modal = new ModalBuilder().setCustomId('coupon_disable_modal').setTitle('Desativar cupom');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código do cupom').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id === 'coupon_disable_modal') {
    const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
    const r = await pool.query('UPDATE coupons SET active=FALSE WHERE code=$1 RETURNING code', [code]);
    if (!r.rowCount) return interaction.reply({ content: '❌ Cupom não encontrado.', ephemeral: true });
    await adminLog(interaction.guild, interaction.user, 'DISABLE_COUPON', { details: { code } });
    return interaction.reply({ content: `✅ Cupom **${code}** desativado.`, ephemeral: true });
  }
}

async function handleAdminWaitlist(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const rows = (await pool.query(`SELECT w.*,p.name product_name FROM waitlist w JOIN products p ON p.id=w.product_id ORDER BY p.rap,w.joined_at,w.id`)).rows;
  const text = rows.length ? rows.map((r) => `• <@${r.user_id}> — **${r.product_name}** — entrou <t:${unix(r.joined_at)}:R>${r.notified_at ? ' — notificado' : ''}`).join('\n') : 'Nenhum cliente aguardando.';
  return interaction.reply({ content: `👥 **Lista de espera (${rows.length})**\n\n${text}`, ephemeral: true });
}

async function handleAdminHistory(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const rows = (await pool.query('SELECT * FROM history ORDER BY created_at DESC,id DESC LIMIT 20')).rows;
  const text = rows.length ? rows.map((r) => `• **${r.type}** — ${r.username || 'Sistema'}${r.product_name ? ` — ${r.product_name}` : ''} — <t:${unix(r.created_at)}:R>`).join('\n') : 'Nenhum histórico.';
  return interaction.reply({ content: `📊 **Histórico — mais recentes**\n\n${text}`, ephemeral: true });
}

async function handleAdminLogs(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  if (interaction.customId === 'admin_logs') {
    const rows = (await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC,id DESC LIMIT 15')).rows;
    const text = rows.length ? rows.map((r) => `• **${r.action}** — ${r.admin_name}${r.product_name ? ` — ${r.product_name}` : ''} — <t:${unix(r.created_at)}:R>`).join('\n') : 'Nenhum log.';
    return interaction.reply({
      content: `📋 **Logs administrativos — recentes**\n\n${text}`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin_logs_filter').setLabel('Filtrar logs').setStyle(ButtonStyle.Danger))],
      ephemeral: true,
    });
  }
  if (interaction.customId === 'admin_logs_filter') {
    const modal = new ModalBuilder().setCustomId('admin_logs_filter_modal').setTitle('Filtrar logs');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('admin').setLabel('Admin ID ou vazio').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product').setLabel('Produto: 100, 1000 ou vazio').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('action').setLabel('Ação contém... ou vazio').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('start').setLabel('Data inicial YYYY-MM-DD ou vazio').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('end').setLabel('Data final YYYY-MM-DD ou vazio').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId === 'admin_logs_filter_modal') {
    const admin = interaction.fields.getTextInputValue('admin').trim();
    const productRaw = interaction.fields.getTextInputValue('product').trim();
    const action = interaction.fields.getTextInputValue('action').trim();
    const start = interaction.fields.getTextInputValue('start').trim();
    const end = interaction.fields.getTextInputValue('end').trim();
    const values = [];
    const conditions = [];
    if (admin) { values.push(admin); conditions.push(`admin_id=$${values.length}`); }
    if (productRaw) {
      const pid = productRaw === '100' ? 'rap_100' : productRaw === '1000' ? 'rap_1000' : productRaw;
      values.push(pid); conditions.push(`product_id=$${values.length}`);
    }
    if (action) { values.push(`%${action}%`); conditions.push(`action ILIKE $${values.length}`); }
    if (start) { values.push(`${start}T00:00:00Z`); conditions.push(`created_at >= $${values.length}`); }
    if (end) { values.push(`${end}T23:59:59Z`); conditions.push(`created_at <= $${values.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = (await pool.query(`SELECT * FROM admin_logs ${where} ORDER BY created_at DESC,id DESC LIMIT 30`, values)).rows;
    const text = rows.length ? rows.map((r) => `• **${r.action}** — ${r.admin_name}${r.product_name ? ` — ${r.product_name}` : ''} — <t:${unix(r.created_at)}:R>`).join('\n') : 'Nenhum log para esse filtro.';
    return interaction.reply({ content: `📋 **Logs filtrados**\n\n${text}`, ephemeral: true });
  }
}

async function handleAdminOrders(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const rows = (await pool.query(`SELECT * FROM purchases ORDER BY created_at DESC,id DESC LIMIT 20`)).rows;
  const text = rows.length ? rows.map((p) => `• **#${p.id}** — <@${p.user_id}> — ${p.product_name} x${p.quantity} — ${money(p.total)} — **${p.status}**${p.ticket_id ? ` — <#${p.ticket_id}>` : ''}`).join('\n') : 'Nenhum pedido.';
  return interaction.reply({ content: `🛒 **Pedidos recentes**\n\n${text}`, ephemeral: true });
}

async function markPaid(interaction, purchaseId) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const r = await pool.query(`UPDATE purchases SET status='PAID',paid_at=NOW() WHERE id=$1 AND status='PENDING' RETURNING *`, [purchaseId]);
  if (!r.rowCount) return interaction.reply({ content: 'ℹ️ Pedido não está aguardando pagamento ou não foi encontrado.', ephemeral: true });
  const purchase = r.rows[0];
  await adminLog(interaction.guild, interaction.user, 'PAYMENT_CONFIRMED', { productId: purchase.product_id, productName: purchase.product_name, details: { purchaseId } });

  if (purchase.purchase_type === 'STEAM') {
    const delivered = await deliverSteamPurchase(interaction.guild, purchase);
    if (!delivered.success) {
      await interaction.channel?.send({
        content: `⚠️ Pagamento confirmado, mas a entrega automática por DM falhou (**${delivered.reason}**). Peça ao cliente para habilitar DMs e tente novamente.`,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`steam_retry_delivery:${purchaseId}`).setLabel('Tentar entrega novamente').setStyle(ButtonStyle.Danger))],
      }).catch(() => {});
      return interaction.reply({ content: '⚠️ Pagamento confirmado, mas a DM de entrega falhou.', ephemeral: true });
    }
    await interaction.channel?.send(`✅ Pedido Steam **#${purchaseId}** entregue automaticamente por DM.`).catch(() => {});
    return interaction.reply({ content: `✅ Pagamento confirmado e Steam entregue. Cupom de 5%: **${delivered.coupon}**.`, ephemeral: true });
  }

  await interaction.channel?.send(`💰 Pagamento do pedido **#${purchaseId}** confirmado. Agora o pedido pode ser marcado como entregue.`).catch(() => {});
  return interaction.reply({ content: '✅ Pagamento confirmado.', ephemeral: true });
}

async function completePurchase(interaction, purchaseId) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const current = await pool.query('SELECT * FROM purchases WHERE id=$1', [purchaseId]);
  if (!current.rowCount) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (current.rows[0].status === 'COMPLETED') return interaction.reply({ content: 'ℹ️ Pedido já foi entregue.', ephemeral: true });
  if (current.rows[0].status !== 'PAID') return interaction.reply({ content: '⚠️ Confirme o pagamento antes de marcar como entregue.', ephemeral: true });
  const r = await pool.query(`UPDATE purchases SET status='COMPLETED',completed_at=NOW() WHERE id=$1 RETURNING *`, [purchaseId]);
  const p = r.rows[0];
  const member = await interaction.guild.members.fetch(p.user_id).catch(() => null);
  const customer = findRole(interaction.guild, CONFIG.roles.customer);
  if (member && customer) await member.roles.add(customer).catch(() => {});

  const sales = findChannel(interaction.guild, CONFIG.channels.sales);
  const user = await client.users.fetch(p.user_id).catch(() => null);
  if (sales) {
    const embed = new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle('✅ Produto entregue')
      .setThumbnail(user?.displayAvatarURL() || null)
      .addFields(
        { name: 'Cliente', value: `<@${p.user_id}>`, inline: true },
        { name: '🎮 Roblox', value: p.roblox_username || '—', inline: true },
        { name: 'Produto', value: p.product_name, inline: true },
        { name: 'Quantidade', value: String(p.quantity), inline: true },
        { name: 'Valor', value: money(p.total), inline: true },
        { name: 'Pedido', value: `#${p.id}`, inline: true },
        { name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      );
    await sales.send({ embeds: [embed] });
  }

  const loyaltyCoupon = await createLoyaltyCoupon(p.user_id, p.id);
  await recordSaleRevenue(p);

  const rapPerUnit = CONFIG.products[p.product_id]?.rap || 0;
  const totalRap = rapPerUnit * Number(p.quantity);

  if (user) {
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle(`✅ Pedido #${p.id} entregue`)
        .addFields(
          { name: '🎮 Roblox', value: p.roblox_username || 'Não informado', inline: true },
          { name: '📦 Produto', value: p.product_name, inline: true },
          { name: '🔢 Quantidade', value: String(p.quantity), inline: true },
          { name: '💎 RAP entregue', value: totalRap ? `${totalRap.toLocaleString('pt-BR')} RAP` : '—', inline: true },
          { name: '💰 Valor pago', value: money(p.total), inline: true },
          { name: '🎟️ Cupom da próxima compra', value: `**${loyaltyCoupon}** — 5%`, inline: false },
        )
        .setDescription("Obrigado por comprar na **Berovenda's**!")
        .setTimestamp()],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`feedback_open:${p.id}`).setLabel('Avaliar compra').setEmoji('⭐').setStyle(ButtonStyle.Danger))],
    }).catch(() => {});
  }
  await addHistory('PURCHASE_COMPLETED', { userId: p.user_id, username: p.username, productId: p.product_id, productName: p.product_name, quantity: p.quantity, details: { purchaseId, robloxUsername: p.roblox_username, loyaltyCoupon } });
  await adminLog(interaction.guild, interaction.user, 'COMPLETE_PURCHASE', { productId: p.product_id, productName: p.product_name, details: { purchaseId } });
  return interaction.reply({ content: '✅ Pedido entregue, cargo de cliente aplicado e avaliação enviada por DM.', ephemeral: true });
}

async function cancelPurchase(interaction, purchaseId) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const r = await db.query('SELECT * FROM purchases WHERE id=$1 FOR UPDATE', [purchaseId]);
    if (!r.rowCount) { await db.query('ROLLBACK'); return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true }); }
    const p = r.rows[0];
    if (['COMPLETED', 'CANCELLED'].includes(p.status)) { await db.query('ROLLBACK'); return interaction.reply({ content: 'ℹ️ Pedido já está finalizado.', ephemeral: true }); }
    await db.query(`UPDATE purchases SET status='CANCELLED',cancelled_at=NOW() WHERE id=$1`, [purchaseId]);
    if (p.purchase_type === 'STEAM' && p.steam_account_id) {
      await db.query(`UPDATE steam_accounts SET status='AVAILABLE',reserved_by=NULL,reserved_at=NULL WHERE id=$1 AND status='RESERVED'`, [p.steam_account_id]);
    } else {
      await db.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1', [p.product_id, p.quantity]);
    }
    if (p.coupon_code) {
      await db.query('UPDATE coupons SET used_count=GREATEST(0,used_count-1) WHERE code=$1', [p.coupon_code]);
      await db.query('DELETE FROM coupon_uses WHERE purchase_id=$1', [purchaseId]);
    }
    await db.query('COMMIT');
    await addHistory('PURCHASE_CANCELLED', { userId: p.user_id, username: p.username, productId: p.product_id, productName: p.product_name, quantity: p.quantity, details: { purchaseId } });
    await adminLog(interaction.guild, interaction.user, 'CANCEL_PURCHASE', { productId: p.product_id, productName: p.product_name, details: { purchaseId } });
    await refreshPanels(interaction.guild);
    if (p.purchase_type !== 'STEAM') await startRestockNotifications(interaction.guild, p.product_id);
    await publishStaticPanels(interaction.guild);
    return interaction.reply({ content: '✅ Pedido cancelado e estoque devolvido. Se houver pagamento, o reembolso continua sendo tratado manualmente.', ephemeral: true });
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}

async function handleFeedback(interaction) {
  const id = interaction.customId || '';
  if (id.startsWith('feedback_open:')) {
    const purchaseId = Number(id.split(':')[1]);
    const p = await pool.query('SELECT * FROM purchases WHERE id=$1 AND user_id=$2 AND status=\'COMPLETED\'', [purchaseId, interaction.user.id]);
    if (!p.rowCount) return interaction.reply({ content: '❌ Essa compra não está disponível para avaliação.', ephemeral: true });
    const existing = await pool.query('SELECT 1 FROM feedback WHERE purchase_id=$1', [purchaseId]);
    if (existing.rowCount) return interaction.reply({ content: 'ℹ️ Você já avaliou essa compra.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`feedback_modal:${purchaseId}`).setTitle(`Avaliar pedido #${purchaseId}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Nota de 1 a 10').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('10')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel('Comentário').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800)),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id.startsWith('feedback_modal:')) {
    const purchaseId = Number(id.split(':')[1]);
    const rating = Number(interaction.fields.getTextInputValue('rating'));
    const comment = interaction.fields.getTextInputValue('comment').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return interaction.reply({ content: '❌ A nota deve ser um número inteiro entre 1 e 10.', ephemeral: true });
    const p = await pool.query('SELECT * FROM purchases WHERE id=$1 AND user_id=$2 AND status=\'COMPLETED\'', [purchaseId, interaction.user.id]);
    if (!p.rowCount) return interaction.reply({ content: '❌ Compra inválida para avaliação.', ephemeral: true });
    try {
      await pool.query('INSERT INTO feedback(purchase_id,user_id,rating,comment) VALUES($1,$2,$3,$4)', [purchaseId, interaction.user.id, rating, comment || null]);
    } catch (e) {
      if (e.code === '23505') return interaction.reply({ content: 'ℹ️ Essa compra já foi avaliada.', ephemeral: true });
      throw e;
    }
    const guildId = p.rows[0].guild_id;
    const guild = client.guilds.cache.get(guildId);
    const feedbackCh = guild ? findChannel(guild, CONFIG.channels.feedback) : null;
    if (feedbackCh) {
      const user = interaction.user;
      await feedbackCh.send({ embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(`${'⭐'.repeat(rating)} ${rating}/10`)
        .setDescription(comment || '*Sem comentário.*')
        .addFields({ name: 'Pedido', value: `#${purchaseId}`, inline: true }, { name: 'Produto', value: p.rows[0].product_name, inline: true })
        .setTimestamp()] });
    }
    await addHistory('FEEDBACK', { userId: interaction.user.id, username: interaction.user.username, productId: p.rows[0].product_id, productName: p.rows[0].product_name, details: { purchaseId, rating } });
    return interaction.reply({ content: '✅ Avaliação registrada. Obrigado!', ephemeral: true });
  }
}


function steamEncryptionKey() {
  const material = process.env.STEAM_ENCRYPTION_KEY || process.env.DISCORD_TOKEN;
  return crypto.createHash('sha256').update(material).digest();
}

function encryptSteamPassword(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', steamEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSteamPassword(value) {
  const [ivB64, tagB64, dataB64] = String(value).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', steamEncryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

function max50Words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length <= 50;
}

async function createLoyaltyCoupon(userId, purchaseId) {
  const code = `VOLTA5-${String(userId).slice(-5)}-${purchaseId}`.toUpperCase();
  await pool.query(
    `INSERT INTO coupons(code,discount_type,discount_value,product_id,max_uses,max_uses_per_user,used_count,active,created_by,owner_user_id,source)
     VALUES($1,'PERCENT',5,NULL,1,1,0,TRUE,'SYSTEM',$2,'LOYALTY')
     ON CONFLICT(code) DO NOTHING`,
    [code, userId],
  );
  return code;
}

async function syncBoosterCoupon(member, notify = false) {
  if (!member || member.user.bot) return;
  const code = `BOOST10-${String(member.id).slice(-7)}`.toUpperCase();
  if (member.premiumSince) {
    const r = await pool.query(
      `INSERT INTO coupons(code,discount_type,discount_value,product_id,max_uses,max_uses_per_user,used_count,active,created_by,owner_user_id,source)
       VALUES($1,'PERCENT',10,NULL,NULL,999999,0,TRUE,'SYSTEM',$2,'BOOSTER')
       ON CONFLICT(code) DO UPDATE SET active=TRUE,owner_user_id=EXCLUDED.owner_user_id,source='BOOSTER'
       RETURNING code`,
      [code, member.id],
    );
    if (notify && r.rowCount) {
      await member.user.send(`🚀 Obrigado por impulsionar a **Berovenda's**!\nSeu cupom exclusivo de booster é **${code}** e dá **10% de desconto** enquanto você for booster.`).catch(() => {});
    }
  } else {
    await pool.query(`UPDATE coupons SET active=FALSE WHERE owner_user_id=$1 AND source='BOOSTER'`, [member.id]);
  }
}

async function syncGuildBoosters(guild) {
  await guild.members.fetch().catch(() => {});
  for (const member of guild.members.cache.values()) {
    if (!member.user.bot) await syncBoosterCoupon(member, false).catch(() => {});
  }
}

async function recordSaleRevenue(purchase) {
  await pool.query(
    `INSERT INTO revenue_ledger(guild_id,entry_type,amount,purchase_id,details)
     VALUES($1,'SALE',$2,$3,$4)
     ON CONFLICT(entry_type,purchase_id) DO NOTHING`,
    [purchase.guild_id, Number(purchase.total), Number(purchase.id), JSON.stringify({ product: purchase.product_name, type: purchase.purchase_type || 'RAP' })],
  );
}

async function revenueSummary(guild) {
  const sales = Number((await pool.query(`SELECT COALESCE(SUM(amount),0) total FROM revenue_ledger WHERE guild_id=$1 AND entry_type='SALE'`, [guild.id])).rows[0].total);
  const mediation = Number((await pool.query(`SELECT COALESCE(SUM(amount),0) total FROM mediation_earnings WHERE guild_id=$1`, [guild.id])).rows[0].total);
  const ownerPct = Number((await getSetting(guild.id, 'owner_share_percent')) || 60);
  const adminPct = Number((await getSetting(guild.id, 'admin_pool_percent')) || 40);
  const adminRole = findRole(guild, CONFIG.roles.admin);
  const admins = adminRole ? adminRole.members.filter((m) => !m.user.bot).size : 0;
  return {
    sales,
    mediation,
    ownerPct,
    adminPct,
    ownerValue: Number((sales * ownerPct / 100).toFixed(2)),
    adminPoolValue: Number((sales * adminPct / 100).toFixed(2)),
    admins,
    perAdmin: admins ? Number((sales * adminPct / 100 / admins).toFixed(2)) : 0,
  };
}

async function handleAdminRevenue(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  if (interaction.customId === 'admin_revenue') {
    const x = await revenueSummary(interaction.guild);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle('💰 Arrecadação')
        .addFields(
          { name: 'Vendas concluídas', value: money(x.sales), inline: true },
          { name: `👑 DONO (${x.ownerPct}%)`, value: money(x.ownerValue), inline: true },
          { name: `🛡️ ADMs (${x.adminPct}%)`, value: money(x.adminPoolValue), inline: true },
          { name: 'ADMs no pool', value: String(x.admins), inline: true },
          { name: 'Estimativa por ADM', value: money(x.perAdmin), inline: true },
          { name: 'Mediações', value: `${money(x.mediation)} — 100% dos mediadores`, inline: true },
        )
        .setFooter({ text: 'Valores calculados sobre vendas registradas como concluídas.' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('revenue_split').setLabel('Alterar porcentagens').setStyle(ButtonStyle.Danger),
      )],
      ephemeral: true,
    });
  }
  if (interaction.customId === 'revenue_split') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o DONO pode alterar a divisão.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('revenue_split_modal').setTitle('Divisão da arrecadação');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('owner').setLabel('Porcentagem do DONO').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('admins').setLabel('Porcentagem do pool dos ADMs').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('40')),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId === 'revenue_split_modal') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o DONO pode alterar a divisão.', ephemeral: true });
    const owner = Number(interaction.fields.getTextInputValue('owner').replace(',', '.'));
    const admins = Number(interaction.fields.getTextInputValue('admins').replace(',', '.'));
    if (!Number.isFinite(owner) || !Number.isFinite(admins) || owner <= admins || owner <= 0 || admins < 0 || Math.abs(owner + admins - 100) > 0.001) {
      return interaction.reply({ content: '❌ As porcentagens devem somar **100%** e a porcentagem do DONO precisa ser maior que a dos ADMs.', ephemeral: true });
    }
    await setSetting(interaction.guild.id, 'owner_share_percent', String(owner));
    await setSetting(interaction.guild.id, 'admin_pool_percent', String(admins));
    await adminLog(interaction.guild, interaction.user, 'SET_REVENUE_SPLIT', { details: { owner, admins } });
    await publishStaticPanels(interaction.guild);
    return interaction.reply({ content: `✅ Divisão atualizada: DONO **${owner}%** / ADMs **${admins}%**.`, ephemeral: true });
  }
}

async function handleAdminSteam(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  const id = interaction.customId || '';
  if (id === 'admin_steam') {
    const available = Number((await pool.query(`SELECT COUNT(*)::int n FROM steam_accounts WHERE guild_id=$1 AND status='AVAILABLE'`, [interaction.guild.id])).rows[0].n);
    return interaction.reply({
      content: `🎮 **Estoque Steam**\nContas disponíveis: **${available}**`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('steam_admin_add').setLabel('Adicionar conta').setEmoji('➕').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('steam_admin_list').setLabel('Ver estoque').setStyle(ButtonStyle.Secondary),
      )],
      ephemeral: true,
    });
  }
  if (id === 'steam_admin_add') {
    const modal = new ModalBuilder().setCustomId('steam_admin_modal').setTitle('Adicionar conta Steam');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game').setLabel('Jogo / título').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('19,90')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('username').setLabel('Usuário Steam').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('password').setLabel('Senha Steam').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição (máx. 50 palavras)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id === 'steam_admin_modal') {
    const game = interaction.fields.getTextInputValue('game').trim();
    const price = Number(interaction.fields.getTextInputValue('price').replace(',', '.'));
    const username = interaction.fields.getTextInputValue('username').trim();
    const password = interaction.fields.getTextInputValue('password');
    const description = interaction.fields.getTextInputValue('description').trim();
    if (!game || !Number.isFinite(price) || price <= 0 || !username || !password) return interaction.reply({ content: '❌ Dados inválidos.', ephemeral: true });
    if (!max50Words(description)) return interaction.reply({ content: '❌ A descrição deve ter no máximo **50 palavras**.', ephemeral: true });
    const enc = encryptSteamPassword(password);
    const r = await pool.query(
      `INSERT INTO steam_accounts(guild_id,game_title,price,username,password_encrypted,description,added_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [interaction.guild.id, game, price, username, enc, description || null, interaction.user.id],
    );
    await adminLog(interaction.guild, interaction.user, 'ADD_STEAM_ACCOUNT', { details: { steamAccountId: Number(r.rows[0].id), game, price } });
    await publishStaticPanels(interaction.guild);
    return interaction.reply({ content: `✅ Conta Steam adicionada ao estoque: **${game}** — ${money(price)}.`, ephemeral: true });
  }
  if (id === 'steam_admin_list') {
    const rows = (await pool.query(`SELECT id,game_title,price,status,description FROM steam_accounts WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 20`, [interaction.guild.id])).rows;
    const text = rows.length ? rows.map((x) => `• **#${x.id} ${x.game_title}** — ${money(x.price)} — **${x.status}**${x.description ? ` — ${x.description}` : ''}`).join('\n') : 'Nenhuma conta cadastrada.';
    return interaction.reply({ content: `🎮 **Estoque Steam**\n\n${text}`, ephemeral: true });
  }
}

async function createSteamPurchase(interaction, accountId) {
  const db = await pool.connect();
  let purchase = null;
  try {
    await db.query('BEGIN');
    const aRes = await db.query(`SELECT * FROM steam_accounts WHERE id=$1 AND guild_id=$2 FOR UPDATE`, [accountId, interaction.guild.id]);
    if (!aRes.rowCount || aRes.rows[0].status !== 'AVAILABLE') {
      await db.query('ROLLBACK');
      return { success: false, reason: 'UNAVAILABLE' };
    }
    const a = aRes.rows[0];
    await db.query(`UPDATE steam_accounts SET status='RESERVED',reserved_by=$2,reserved_at=NOW() WHERE id=$1`, [accountId, interaction.user.id]);
    const pRes = await db.query(
      `INSERT INTO purchases(guild_id,user_id,username,product_id,product_name,quantity,unit_price,subtotal,discount,total,status,purchase_type,steam_account_id)
       VALUES($1,$2,$3,'steam',$4,1,$5,$5,0,$5,'PENDING','STEAM',$6) RETURNING *`,
      [interaction.guild.id, interaction.user.id, interaction.user.username, a.game_title, Number(a.price), Number(a.id)],
    );
    purchase = pRes.rows[0];
    await db.query('COMMIT');

    const ticket = await createPrivateTicket(interaction.guild, interaction.user, 'purchase', purchase);
    await pool.query(`UPDATE purchases SET ticket_id=$2 WHERE id=$1`, [purchase.id, ticket.id]);
    await ticket.send({
      content: `<@${interaction.user.id}>`,
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle(`🎮 Pedido Steam #${purchase.id}`)
        .addFields(
          { name: 'Jogo', value: purchase.product_name, inline: true },
          { name: 'Valor', value: money(purchase.total), inline: true },
          { name: 'Status', value: '🟡 Aguardando pagamento', inline: true },
          { name: 'Entrega', value: 'Após o pagamento ser confirmado, as credenciais serão enviadas **automaticamente por DM**.', inline: false },
        )],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`purchase_paid:${purchase.id}`).setLabel('Pagamento recebido').setEmoji('💰').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`purchase_cancel:${purchase.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar ticket').setStyle(ButtonStyle.Secondary),
      )],
    });
    await addHistory('STEAM_PURCHASE_CREATED', { userId: interaction.user.id, username: interaction.user.username, productName: purchase.product_name, details: { purchaseId: Number(purchase.id), steamAccountId: Number(a.id) } });
    return { success: true, purchase, ticket };
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch {}
    if (purchase?.steam_account_id) await pool.query(`UPDATE steam_accounts SET status='AVAILABLE',reserved_by=NULL,reserved_at=NULL WHERE id=$1`, [purchase.steam_account_id]).catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

async function deliverSteamPurchase(guild, purchase) {
  const aRes = await pool.query(`SELECT * FROM steam_accounts WHERE id=$1`, [purchase.steam_account_id]);
  if (!aRes.rowCount) return { success: false, reason: 'ACCOUNT_NOT_FOUND' };
  const a = aRes.rows[0];
  const user = await client.users.fetch(purchase.user_id).catch(() => null);
  if (!user) return { success: false, reason: 'USER_NOT_FOUND' };
  const password = decryptSteamPassword(a.password_encrypted);
  const coupon = await createLoyaltyCoupon(purchase.user_id, purchase.id);
  const dm = await user.send({
    embeds: [new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle(`✅ Pedido Steam #${purchase.id} entregue`)
      .addFields(
        { name: '🎮 Jogo', value: purchase.product_name, inline: true },
        { name: '👤 Usuário Steam', value: `\`${a.username}\``, inline: false },
        { name: '🔑 Senha', value: `\`${password}\``, inline: false },
        { name: '📝 Descrição', value: a.description || 'Sem descrição.', inline: false },
        { name: '💰 Valor pago', value: money(purchase.total), inline: true },
        { name: '🎟️ Cupom da próxima compra', value: `**${coupon}** — 5%`, inline: false },
      )
      .setFooter({ text: 'Não compartilhe estas credenciais em canais públicos.' })
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`feedback_open:${purchase.id}`).setLabel('Avaliar compra').setEmoji('⭐').setStyle(ButtonStyle.Danger))],
  }).catch(() => null);
  if (!dm) return { success: false, reason: 'DM_CLOSED' };

  await pool.query(`UPDATE steam_accounts SET status='SOLD',buyer_user_id=$2,sold_at=NOW() WHERE id=$1`, [a.id, purchase.user_id]);
  const r = await pool.query(`UPDATE purchases SET status='COMPLETED',completed_at=NOW() WHERE id=$1 RETURNING *`, [purchase.id]);
  await recordSaleRevenue(r.rows[0]);
  const member = await guild.members.fetch(purchase.user_id).catch(() => null);
  const customer = findRole(guild, CONFIG.roles.customer);
  if (member && customer) await member.roles.add(customer).catch(() => {});
  const sales = findChannel(guild, CONFIG.channels.sales);
  if (sales) {
    await sales.send({ embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('✅ Steam entregue automaticamente').addFields(
      { name: 'Cliente', value: `<@${purchase.user_id}>`, inline: true },
      { name: 'Jogo', value: purchase.product_name, inline: true },
      { name: 'Valor', value: money(purchase.total), inline: true },
      { name: 'Pedido', value: `#${purchase.id}`, inline: true },
    ).setTimestamp()] }).catch(() => {});
  }
  return { success: true, coupon };
}

async function handleSteamStore(interaction) {
  const id = interaction.customId || '';
  if (id === 'steam_browse') {
    const rows = (await pool.query(`SELECT id,game_title,price,description FROM steam_accounts WHERE guild_id=$1 AND status='AVAILABLE' ORDER BY created_at ASC LIMIT 25`, [interaction.guild.id])).rows;
    if (!rows.length) return interaction.reply({ content: '🔴 Não há contas Steam disponíveis no momento.', ephemeral: true });
    const menu = new StringSelectMenuBuilder()
      .setCustomId('steam_select')
      .setPlaceholder('Escolha uma conta / jogo')
      .addOptions(rows.map((x) => ({
        label: `${x.game_title}`.slice(0, 100),
        description: `${money(x.price)}${x.description ? ` • ${x.description}` : ''}`.slice(0, 100),
        value: String(x.id),
      })));
    return interaction.reply({ content: '🎮 Escolha uma opção:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
  }
  if (interaction.isStringSelectMenu() && id === 'steam_select') {
    const accountId = Number(interaction.values[0]);
    const a = (await pool.query(`SELECT id,game_title,price,description FROM steam_accounts WHERE id=$1 AND guild_id=$2 AND status='AVAILABLE'`, [accountId, interaction.guild.id])).rows[0];
    if (!a) return interaction.update({ content: '❌ Essa conta não está mais disponível.', components: [] });
    return interaction.update({
      content: `🎮 **${a.game_title}**\n💰 **${money(a.price)}**\n📝 ${a.description || 'Sem descrição.'}\n\nApós confirmação de pagamento, usuário e senha serão enviados automaticamente por DM.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`steam_buy:${a.id}`).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Danger))],
    });
  }
  if (id.startsWith('steam_buy:')) {
    const accountId = Number(id.split(':')[1]);
    await interaction.deferReply({ ephemeral: true });
    const r = await createSteamPurchase(interaction, accountId);
    if (!r.success) return interaction.editReply('❌ A conta ficou indisponível antes da confirmação.');
    return interaction.editReply(`✅ Pedido Steam **#${r.purchase.id}** criado: ${r.ticket}`);
  }
}

async function drawGiveaway(guild, giveawayId, actor = null) {
  const gRes = await pool.query(`SELECT * FROM giveaways WHERE id=$1 AND guild_id=$2`, [giveawayId, guild.id]);
  if (!gRes.rowCount || gRes.rows[0].status !== 'ACTIVE') return { success: false, reason: 'INACTIVE' };
  const entries = (await pool.query(`SELECT user_id FROM giveaway_entries WHERE giveaway_id=$1`, [giveawayId])).rows;
  if (!entries.length) return { success: false, reason: 'NO_ENTRIES' };
  const winner = entries[crypto.randomInt(entries.length)].user_id;
  await pool.query(`UPDATE giveaways SET status='DRAWN',winner_user_id=$2,drawn_at=NOW() WHERE id=$1`, [giveawayId, winner]);
  const role = findRole(guild, CONFIG.roles.lucky);
  const member = await guild.members.fetch(winner).catch(() => null);
  if (member && role) await member.roles.add(role).catch(() => {});
  const announcements = findChannel(guild, CONFIG.channels.announcements);
  if (announcements) await announcements.send(`🎉 <@${winner}> ganhou o sorteio **${gRes.rows[0].title}** — prêmio: **${gRes.rows[0].prize}**! ${role ? `Você recebeu ${role}.` : ''}`);
  if (actor) await adminLog(guild, actor, 'DRAW_GIVEAWAY', { details: { giveawayId, winner } });
  return { success: true, winner };
}

async function autoDrawGiveaways() {
  const rows = (await pool.query(`SELECT * FROM giveaways WHERE status='ACTIVE' AND ends_at IS NOT NULL AND ends_at <= NOW()`)).rows;
  for (const g of rows) {
    const guild = client.guilds.cache.get(g.guild_id);
    if (guild) await drawGiveaway(guild, g.id, null).catch(() => {});
  }
}

async function handleGiveaways(interaction) {
  const id = interaction.customId || '';
  if (id === 'admin_giveaways') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    return interaction.reply({
      content: '🎉 **Gerenciar sorteios**',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_create').setLabel('Criar sorteio').setStyle(ButtonStyle.Danger),
      )],
      ephemeral: true,
    });
  }
  if (id === 'giveaway_create') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('giveaway_create_modal').setTitle('Criar sorteio');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize').setLabel('Prêmio').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minutes').setLabel('Duração em minutos').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60')),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id === 'giveaway_create_modal') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const title = interaction.fields.getTextInputValue('title').trim();
    const prize = interaction.fields.getTextInputValue('prize').trim();
    const minutes = Number(interaction.fields.getTextInputValue('minutes'));
    if (!title || !prize || !Number.isFinite(minutes) || minutes <= 0) return interaction.reply({ content: '❌ Dados inválidos.', ephemeral: true });
    const ends = new Date(Date.now() + minutes * 60_000);
    const ch = findChannel(interaction.guild, CONFIG.channels.giveaways);
    if (!ch) return interaction.reply({ content: '❌ Canal de sorteios não encontrado. Use `+setup`.', ephemeral: true });
    const g = (await pool.query(
      `INSERT INTO giveaways(guild_id,title,prize,created_by,channel_id,ends_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [interaction.guild.id, title, prize, interaction.user.id, ch.id, ends],
    )).rows[0];
    const msg = await ch.send({
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle(`🎉 ${title}`).setDescription(`🎁 Prêmio: **${prize}**\n⏰ Termina <t:${unix(ends)}:R>\n\nClique em **Participar** para entrar.`)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`giveaway_join:${g.id}`).setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`giveaway_draw:${g.id}`).setLabel('Sortear').setEmoji('🍀').setStyle(ButtonStyle.Secondary),
      )],
    });
    await pool.query(`UPDATE giveaways SET message_id=$2 WHERE id=$1`, [g.id, msg.id]);
    await adminLog(interaction.guild, interaction.user, 'CREATE_GIVEAWAY', { details: { giveawayId: Number(g.id), title, prize, minutes } });
    return interaction.reply({ content: `✅ Sorteio criado em ${ch}.`, ephemeral: true });
  }
  if (id.startsWith('giveaway_join:')) {
    const gid = Number(id.split(':')[1]);
    const g = (await pool.query(`SELECT * FROM giveaways WHERE id=$1`, [gid])).rows[0];
    if (!g || g.status !== 'ACTIVE' || (g.ends_at && new Date(g.ends_at) <= new Date())) return interaction.reply({ content: '❌ Este sorteio já terminou.', ephemeral: true });
    await pool.query(`INSERT INTO giveaway_entries(giveaway_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [gid, interaction.user.id]);
    return interaction.reply({ content: '✅ Você está participando do sorteio.', ephemeral: true });
  }
  if (id.startsWith('giveaway_draw:')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas a administração pode sortear.', ephemeral: true });
    const gid = Number(id.split(':')[1]);
    const r = await drawGiveaway(interaction.guild, gid, interaction.user);
    if (!r.success && r.reason === 'NO_ENTRIES') return interaction.reply({ content: '❌ Ainda não há participantes.', ephemeral: true });
    if (!r.success) return interaction.reply({ content: 'ℹ️ Sorteio já encerrado.', ephemeral: true });
    return interaction.reply({ content: `🍀 Vencedor: <@${r.winner}>`, ephemeral: true });
  }
}

async function createTradeDraftChannel(guild, user, stage, payload, tradeId = null) {
  const ownerRole = findRole(guild, CONFIG.roles.owner);
  const adminRole = findRole(guild, CONFIG.roles.admin);
  const category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CONFIG.categories.trades);
  const ch = await guild.channels.create({
    name: `rascunho-${stage.toLowerCase()}-${user.id.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole.id, deny: [PermissionFlagsBits.ViewChannel] }] : []),
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      ...(ownerRole ? [{ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });
  await pool.query(
    `INSERT INTO trade_drafts(channel_id,guild_id,user_id,stage,trade_id,payload) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(channel_id) DO UPDATE SET payload=EXCLUDED.payload,stage=EXCLUDED.stage,trade_id=EXCLUDED.trade_id`,
    [ch.id, guild.id, user.id, stage, tradeId, JSON.stringify(payload || {})],
  );
  await ch.send(`<@${user.id}> envie **uma foto obrigatória** da conta/item neste canal. Assim que a imagem chegar, o bot continuará automaticamente.`);
  return ch;
}

async function publishTradeFromDraft(message, draft) {
  const payload = draft.payload || {};
  const attachment = message.attachments.find((a) => (a.contentType || '').startsWith('image/')) || message.attachments.first();
  if (!attachment) return message.reply('❌ Envie uma **imagem** como anexo.');
  const tradesCh = findChannel(message.guild, CONFIG.channels.trades);
  if (!tradesCh) return message.reply('❌ Canal de trocas não encontrado.');

  if (draft.stage === 'AD') {
    const active = await pool.query(`SELECT 1 FROM trades WHERE guild_id=$1 AND advertiser_id=$2 AND status='ACTIVE' AND expires_at > NOW() LIMIT 1`, [message.guild.id, message.author.id]);
    if (active.rowCount) return message.reply('⚠️ Você já tem um anúncio ativo. Aguarde os 30 minutos ou finalize a negociação atual.');

    const expires = new Date(Date.now() + 30 * 60_000);
    const t = (await pool.query(
      `INSERT INTO trades(guild_id,advertiser_id,advertiser_name,offer_text,want_text,description,image_url,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [message.guild.id, message.author.id, message.author.username, payload.offerText, payload.wantText, payload.description || null, attachment.url, expires],
    )).rows[0];

    const msg = await tradesCh.send({
      content: `<@${message.author.id}>`,
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setTitle(`🔄 Troca #${t.id}`)
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(payload.description || '*Sem descrição adicional.*')
        .addFields(
          { name: 'Ofereço', value: payload.offerText },
          { name: 'Procuro', value: payload.wantText },
          { name: 'Expira', value: `<t:${unix(expires)}:R>` },
        )
        .setImage(attachment.url)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_offer:${t.id}`).setLabel('Oferta').setEmoji('🤝').setStyle(ButtonStyle.Danger),
      )],
    });
    await pool.query(`UPDATE trades SET channel_id=$2,message_id=$3 WHERE id=$1`, [t.id, tradesCh.id, msg.id]);
    await pool.query(`DELETE FROM trade_drafts WHERE channel_id=$1`, [message.channel.id]);
    await message.reply(`✅ Anúncio publicado em ${tradesCh}. Este rascunho será fechado.`);
    setTimeout(() => message.channel.delete().catch(() => {}), 2000);
    return;
  }

  if (draft.stage === 'OFFER') {
    const t = (await pool.query(`SELECT * FROM trades WHERE id=$1`, [draft.trade_id])).rows[0];
    if (!t || t.status !== 'ACTIVE' || new Date(t.expires_at) <= new Date()) {
      await pool.query(`DELETE FROM trade_drafts WHERE channel_id=$1`, [message.channel.id]);
      return message.reply('❌ O anúncio expirou ou já foi encerrado.');
    }
    const o = (await pool.query(
      `INSERT INTO trade_offers(trade_id,offerer_id,offerer_name,description,image_url)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [t.id, message.author.id, message.author.username, payload.description || null, attachment.url],
    )).rows[0];

    const advertiser = await client.users.fetch(t.advertiser_id).catch(() => null);
    if (advertiser) {
      await advertiser.send({
        embeds: [new EmbedBuilder()
          .setColor(CONFIG.brand.color)
          .setTitle(`🤝 Nova oferta na troca #${t.id}`)
          .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
          .setDescription(payload.description || '*Sem descrição.*')
          .setImage(attachment.url)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`trade_accept:${o.id}`).setLabel('Aceitar').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`trade_reject:${o.id}`).setLabel('Recusar').setStyle(ButtonStyle.Secondary),
        )],
      }).catch(() => {});
    }
    await pool.query(`DELETE FROM trade_drafts WHERE channel_id=$1`, [message.channel.id]);
    await message.reply('✅ Oferta enviada ao anunciante por DM.');
    setTimeout(() => message.channel.delete().catch(() => {}), 2000);
  }
}

async function createTradeTicket(guild, trade, offer) {
  const ownerRole = findRole(guild, CONFIG.roles.owner);
  const adminRole = findRole(guild, CONFIG.roles.admin);
  const category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CONFIG.categories.trades);
  const ch = await guild.channels.create({
    name: `troca-${trade.id}-${offer.id}`,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole.id, deny: [PermissionFlagsBits.ViewChannel] }] : []),
      { id: trade.advertiser_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: offer.offerer_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      ...(ownerRole ? [{ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });
  await pool.query(
    `INSERT INTO trade_tickets(trade_id,guild_id,channel_id,advertiser_id,offerer_id)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(trade_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,offerer_id=EXCLUDED.offerer_id`,
    [trade.id, guild.id, ch.id, trade.advertiser_id, offer.offerer_id],
  );
  await ch.send({
    content: `<@${trade.advertiser_id}> <@${offer.offerer_id}>`,
    embeds: [new EmbedBuilder()
      .setColor(CONFIG.brand.color)
      .setTitle(`🔄 Negociação privada — troca #${trade.id}`)
      .setDescription(
        'Somente os dois participantes e o **DONO** podem ver este ticket inicialmente.\n\n' +
        '🛡️ **Chamar ADM** — mediação custa **R$ 10,00** e o valor fica 100% com o mediador.\n' +
        '⚠️ **Continuar sem ADM** — vocês assumem os riscos da negociação; a Berovenda\'s não se responsabiliza por perdas na troca direta.'
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade_call_admin:${trade.id}`).setLabel('Chamar ADM').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`trade_no_admin:${trade.id}`).setLabel('Continuar sem ADM').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`trade_close:${trade.id}`).setLabel('Fechar ticket').setStyle(ButtonStyle.Secondary),
    )],
  });
  return ch;
}

async function assignTradeMediator(guild, tradeId, adminId) {
  const ticket = (await pool.query(`SELECT * FROM trade_tickets WHERE trade_id=$1`, [tradeId])).rows[0];
  if (!ticket) return null;
  const ch = guild.channels.cache.get(ticket.channel_id) || await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!ch) return null;
  await ch.permissionOverwrites.edit(adminId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  await pool.query(`UPDATE trade_tickets SET mediator_user_id=$2 WHERE trade_id=$1`, [tradeId, adminId]);
  await ch.send(`<@${adminId}> foi escolhido como mediador. 💰 Taxa da mediação: **R$ 10,00** — 100% destinada ao mediador.\nQuando finalizar, o mediador ou DONO deve clicar no botão abaixo.`, {
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade_mediation_complete:${tradeId}`).setLabel('Mediação concluída').setStyle(ButtonStyle.Danger),
    )],
  }).catch(() => {});
  return ch;
}

async function handleTrades(interaction) {
  const id = interaction.customId || '';

  if (id === 'trade_create') {
    if (!interaction.guild) return interaction.reply({ content: '❌ Use dentro do servidor.', ephemeral: true });
    const active = await pool.query(`SELECT 1 FROM trades WHERE guild_id=$1 AND advertiser_id=$2 AND status='ACTIVE' AND expires_at > NOW() LIMIT 1`, [interaction.guild.id, interaction.user.id]);
    if (active.rowCount) return interaction.reply({ content: '⚠️ Você já possui um anúncio ativo. Aguarde os 30 minutos.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('trade_create_modal').setTitle('Criar anúncio de troca');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('offer').setLabel('O que você oferece?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('want').setLabel('O que você procura?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(700)),
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && id === 'trade_create_modal') {
    const payload = {
      offerText: interaction.fields.getTextInputValue('offer').trim(),
      wantText: interaction.fields.getTextInputValue('want').trim(),
      description: interaction.fields.getTextInputValue('description').trim(),
    };
    const ch = await createTradeDraftChannel(interaction.guild, interaction.user, 'AD', payload, null);
    return interaction.reply({ content: `📸 Agora envie a foto obrigatória em ${ch}.`, ephemeral: true });
  }

  if (id.startsWith('trade_offer:')) {
    const tradeId = Number(id.split(':')[1]);
    const t = (await pool.query(`SELECT * FROM trades WHERE id=$1`, [tradeId])).rows[0];
    if (!t || t.status !== 'ACTIVE' || new Date(t.expires_at) <= new Date()) return interaction.reply({ content: '❌ Este anúncio expirou.', ephemeral: true });
    if (t.advertiser_id === interaction.user.id) return interaction.reply({ content: '❌ Você não pode ofertar no próprio anúncio.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`trade_offer_modal:${tradeId}`).setTitle('Enviar oferta');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('description').setLabel('Descrição da oferta (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(700),
    ));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && id.startsWith('trade_offer_modal:')) {
    const tradeId = Number(id.split(':')[1]);
    const description = interaction.fields.getTextInputValue('description').trim();
    const ch = await createTradeDraftChannel(interaction.guild, interaction.user, 'OFFER', { description }, tradeId);
    return interaction.reply({ content: `📸 Envie a foto da sua oferta em ${ch}.`, ephemeral: true });
  }

  if (id.startsWith('trade_reject:')) {
    const offerId = Number(id.split(':')[1]);
    const o = (await pool.query(`SELECT o.*,t.advertiser_id,t.expires_at,t.status trade_status FROM trade_offers o JOIN trades t ON t.id=o.trade_id WHERE o.id=$1`, [offerId])).rows[0];
    if (!o || o.advertiser_id !== interaction.user.id) return interaction.reply({ content: '❌ Esta oferta não pertence ao seu anúncio.', ephemeral: true });
    await pool.query(`UPDATE trade_offers SET status='REJECTED',responded_at=NOW() WHERE id=$1 AND status='PENDING'`, [offerId]);
    const offerer = await client.users.fetch(o.offerer_id).catch(() => null);
    if (offerer) await offerer.send(`❌ Sua oferta na troca **#${o.trade_id}** foi recusada.`).catch(() => {});
    return interaction.update({ content: `❌ Oferta #${offerId} recusada. O anúncio continua ativo até <t:${unix(o.expires_at)}:R>.`, embeds: [], components: [] });
  }

  if (id.startsWith('trade_accept:')) {
    const offerId = Number(id.split(':')[1]);
    const o = (await pool.query(`SELECT o.id offer_id,o.trade_id,o.offerer_id,o.offerer_name,o.description offer_description,o.image_url offer_image,o.status offer_status,t.guild_id,t.advertiser_id,t.advertiser_name,t.offer_text,t.want_text,t.description trade_description,t.image_url trade_image,t.status trade_status,t.expires_at FROM trade_offers o JOIN trades t ON t.id=o.trade_id WHERE o.id=$1`, [offerId])).rows[0];
    if (!o || o.advertiser_id !== interaction.user.id) return interaction.reply({ content: '❌ Esta oferta não pertence ao seu anúncio.', ephemeral: true });
    if (o.offer_status !== 'PENDING' || o.trade_status !== 'ACTIVE') return interaction.reply({ content: 'ℹ️ Oferta já respondida.', ephemeral: true });
    const guild = client.guilds.cache.get(o.guild_id);
    if (!guild) return interaction.reply({ content: '❌ Servidor não disponível.', ephemeral: true });

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const t = (await db.query(`SELECT * FROM trades WHERE id=$1 FOR UPDATE`, [o.trade_id])).rows[0];
      const off = (await db.query(`SELECT * FROM trade_offers WHERE id=$1 FOR UPDATE`, [offerId])).rows[0];
      if (!t || t.status !== 'ACTIVE' || !off || off.status !== 'PENDING') {
        await db.query('ROLLBACK');
        return interaction.reply({ content: 'ℹ️ Esta negociação já foi alterada.', ephemeral: true });
      }
      await db.query(`UPDATE trade_offers SET status='ACCEPTED',responded_at=NOW() WHERE id=$1`, [offerId]);
      await db.query(`UPDATE trades SET status='ACCEPTED',accepted_offer_id=$2 WHERE id=$1`, [t.id, offerId]);
      await db.query('COMMIT');
      const ch = await createTradeTicket(guild, t, off);
      const offerer = await client.users.fetch(off.offerer_id).catch(() => null);
      if (offerer) await offerer.send(`✅ Sua oferta na troca **#${t.id}** foi aceita: ${ch}`).catch(() => {});
      return interaction.update({ content: `✅ Oferta aceita. Ticket privado criado: ${ch}`, embeds: [], components: [] });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }

  if (id.startsWith('trade_no_admin:')) {
    const tradeId = Number(id.split(':')[1]);
    const ticket = (await pool.query(`SELECT * FROM trade_tickets WHERE trade_id=$1`, [tradeId])).rows[0];
    if (!ticket || ![ticket.advertiser_id, ticket.offerer_id].includes(interaction.user.id)) return interaction.reply({ content: '❌ Você não participa desta troca.', ephemeral: true });
    await pool.query(`UPDATE trade_tickets SET risk_accepted=TRUE WHERE trade_id=$1`, [tradeId]);
    return interaction.reply({ content: '⚠️ Vocês escolheram continuar **sem ADM**. A negociação ocorre por conta e risco dos participantes; a Berovenda\'s não se responsabiliza por perdas decorrentes da troca direta.' });
  }

  if (id.startsWith('trade_call_admin:')) {
    const tradeId = Number(id.split(':')[1]);
    const ticket = (await pool.query(`SELECT * FROM trade_tickets WHERE trade_id=$1`, [tradeId])).rows[0];
    if (!ticket || ![ticket.advertiser_id, ticket.offerer_id].includes(interaction.user.id)) return interaction.reply({ content: '❌ Você não participa desta troca.', ephemeral: true });
    const adminRole = findRole(interaction.guild, CONFIG.roles.admin);
    const online = adminRole ? adminRole.members.filter((m) => !m.user.bot && m.presence?.status && m.presence.status !== 'offline') : null;
    const candidates = online ? [...online.values()] : [];
    if (!candidates.length) return interaction.reply({ content: '🔴 Nenhum ADM está online agora. Tente novamente depois.', ephemeral: true });
    if (candidates.length === 1) {
      const ch = await assignTradeMediator(interaction.guild, tradeId, candidates[0].id);
      return interaction.reply({ content: `✅ ${candidates[0]} foi definido automaticamente como mediador.`, ephemeral: true });
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`trade_mediator_select:${tradeId}`)
      .setPlaceholder('Escolha um ADM online')
      .addOptions(candidates.slice(0, 25).map((m) => ({ label: m.displayName.slice(0, 100), value: m.id })));
    return interaction.reply({ content: '🛡️ Escolha um ADM online para mediar:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && id.startsWith('trade_mediator_select:')) {
    const tradeId = Number(id.split(':')[1]);
    const adminId = interaction.values[0];
    const adminRole = findRole(interaction.guild, CONFIG.roles.admin);
    const member = await interaction.guild.members.fetch(adminId).catch(() => null);
    if (!member || !adminRole || !member.roles.cache.has(adminRole.id)) return interaction.update({ content: '❌ ADM inválido.', components: [] });
    await assignTradeMediator(interaction.guild, tradeId, adminId);
    return interaction.update({ content: `✅ ${member} foi escolhido como mediador.`, components: [] });
  }

  if (id.startsWith('trade_mediation_complete:')) {
    const tradeId = Number(id.split(':')[1]);
    const ticket = (await pool.query(`SELECT * FROM trade_tickets WHERE trade_id=$1`, [tradeId])).rows[0];
    if (!ticket) return interaction.reply({ content: '❌ Mediação não encontrada.', ephemeral: true });
    if (interaction.user.id !== ticket.mediator_user_id && !isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o mediador ou DONO pode concluir.', ephemeral: true });
    if (!ticket.mediator_user_id) return interaction.reply({ content: '❌ Nenhum mediador definido.', ephemeral: true });
    await pool.query(
      `INSERT INTO mediation_earnings(trade_id,guild_id,mediator_user_id,amount) VALUES($1,$2,$3,10)
       ON CONFLICT(trade_id) DO NOTHING`,
      [tradeId, interaction.guild.id, ticket.mediator_user_id],
    );
    await pool.query(`UPDATE trade_tickets SET mediation_paid=TRUE WHERE trade_id=$1`, [tradeId]);
    return interaction.reply({ content: `✅ Mediação concluída. **R$ 10,00** registrados 100% para <@${ticket.mediator_user_id}>.` });
  }

  if (id.startsWith('trade_close:')) {
    const tradeId = Number(id.split(':')[1]);
    const ticket = (await pool.query(`SELECT * FROM trade_tickets WHERE trade_id=$1`, [tradeId])).rows[0];
    if (!ticket) return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
    const allowed = [ticket.advertiser_id, ticket.offerer_id, ticket.mediator_user_id].filter(Boolean);
    if (!allowed.includes(interaction.user.id) && !isOwner(interaction.member)) return interaction.reply({ content: '❌ Você não pode fechar esta negociação.', ephemeral: true });
    await pool.query(`UPDATE trade_tickets SET closed_at=NOW() WHERE trade_id=$1`, [tradeId]);
    await pool.query(`UPDATE trades SET status='CLOSED',closed_at=NOW() WHERE id=$1`, [tradeId]);
    await interaction.reply('🔒 Negociação será fechada em 3 segundos.');
    return setTimeout(() => interaction.channel?.delete().catch(() => {}), 3000);
  }
}

async function handleGameOrder(interaction) {
  const id = interaction.customId || '';
  if (id === 'game_order_open') {
    const modal = new ModalBuilder().setCustomId('game_order_modal').setTitle('Encomendar jogo');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game').setLabel('Qual jogo?').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('platform').setLabel('Plataforma').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Steam, Roblox, etc.')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('budget').setLabel('Orçamento aproximado').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Observações').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800)),
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && id === 'game_order_modal') {
    const ticket = await createPrivateTicket(interaction.guild, interaction.user, 'support');
    const game = interaction.fields.getTextInputValue('game').trim();
    const platform = interaction.fields.getTextInputValue('platform').trim();
    const budget = interaction.fields.getTextInputValue('budget').trim() || 'Não informado';
    const notes = interaction.fields.getTextInputValue('notes').trim() || 'Sem observações';
    await ticket.send({
      content: `<@${interaction.user.id}>`,
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('🎮 Encomenda de jogo').addFields(
        { name: 'Jogo', value: game },
        { name: 'Plataforma', value: platform, inline: true },
        { name: 'Orçamento', value: budget, inline: true },
        { name: 'Observações', value: notes },
      )],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar ticket').setStyle(ButtonStyle.Secondary))],
    });
    await addHistory('GAME_ORDER_OPEN', { userId: interaction.user.id, username: interaction.user.username, details: { game, platform, budget, ticketId: ticket.id } });
    return interaction.reply({ content: `✅ Encomenda aberta: ${ticket}`, ephemeral: true });
  }
}


client.once('ready', async () => {
  try {
    await pool.query('SELECT 1');
    await setupDatabase();
    console.log(`Berovenda's AutoSeller online como ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
      await resumeWaitlistTimers(guild).catch(console.error);
      await syncGuildBoosters(guild).catch(console.error);
    }
    setInterval(() => autoDrawGiveaways().catch(console.error), 60 * 1000);
    await checkInactiveMembers().catch(console.error);
    setInterval(() => checkInactiveMembers().catch(console.error), 60 * 60 * 1000);
  } catch (e) {
    console.error('Inicialização:', e);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  await recordMemberActivity(message.member).catch(console.error);
  const content = message.content.trim();
  try {
    if (content === '+ping') return message.reply('🏓 Pong!');

    if (content === '+setup') {
      if (!isAdmin(message.member)) return message.reply('❌ Sem permissão.');
      await ensureServerStructure(message.guild);
      await refreshPanels(message.guild);
      await publishStaticPanels(message.guild);
      await adminLog(message.guild, message.author, 'SETUP_SERVER');
      return message.reply('✅ Estrutura, permissões e painéis verificados/publicados.');
    }

    if (content === '+painel') {
      if (!isAdmin(message.member)) return message.reply('❌ Sem permissão.');
      const m = await sendOrUpdatePanel(message.guild, 'purchase');
      if (!m) return message.reply('❌ Canal de compras não encontrado. Use `+setup`.');
      await adminLog(message.guild, message.author, 'PUBLISH_PURCHASE_PANEL', { details: { channelId: m.channel.id, messageId: m.id } });
      return message.reply(`✅ Painel de compras atualizado em ${m.channel}.`);
    }

    if (content === '+admin') {
      if (!isAdmin(message.member)) return message.reply('❌ Sem permissão.');
      const m = await sendOrUpdatePanel(message.guild, 'admin');
      if (!m) return message.reply('❌ Canal administrativo não encontrado. Use `+setup`.');
      await adminLog(message.guild, message.author, 'PUBLISH_ADMIN_PANEL', { details: { channelId: m.channel.id, messageId: m.id } });
      return message.reply(`✅ Painel administrativo atualizado em ${m.channel}.`);
    }

    if (content.startsWith('+excluir')) {
      if (!isAdmin(message.member)) return message.reply('❌ Sem permissão.');
      const parts = content.split(/\s+/);
      const n = Number(parts[1]);
      if (parts.length !== 2 || !Number.isInteger(n) || n < 1 || n > 100) return message.reply('❌ Use: `+excluir 1` até `+excluir 100`');
      if (typeof message.channel.bulkDelete !== 'function') return message.reply('❌ Este canal não permite exclusão em massa.');
      await message.delete().catch(() => {});
      const deleted = await message.channel.bulkDelete(n, true);
      await adminLog(message.guild, message.author, 'DELETE_MESSAGES', { details: { channelId: message.channel.id, requested: n, deleted: deleted.size } });
      const confirmation = await message.channel.send(`🗑️ **${deleted.size}** mensagem(ns) apagada(s).${deleted.size < n ? '\n⚠️ Mensagens com mais de 14 dias não podem ser apagadas em massa pelo Discord.' : ''}`).catch(() => null);
      if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), 4000);
      return;
    }

    if (content.startsWith('+hs')) {
      if (!isAdmin(message.member)) return message.reply('❌ Sem permissão.');
      const n = Number(content.split(/\s+/)[1]);
      if (!Number.isInteger(n) || n <= 0) return message.reply('❌ Use: `+hs 10`');
      const del = await pool.query(`DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY created_at ASC,id ASC LIMIT $1) RETURNING id`, [n]);
      const left = (await pool.query('SELECT COUNT(*)::int n FROM history')).rows[0].n;
      await adminLog(message.guild, message.author, 'CLEAR_HISTORY', { details: { requested: n, removed: del.rowCount, remaining: left } });
      return message.reply(`🗑️ Histórico limpo\nRemovido: **${del.rowCount}**\nRestante: **${left}**`);
    }
  } catch (e) {
    console.error('Comando:', e);
    return message.reply('❌ Ocorreu um erro ao executar o comando.').catch(() => {});
  }
});

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  try {
    const visitor = findRole(member.guild, CONFIG.roles.visitor);
    if (visitor) await member.roles.add(visitor).catch(() => {});
    await pool.query(
      `INSERT INTO member_activity(guild_id,user_id,username,joined_at,last_message_at,depressed_applied_at)
       VALUES($1,$2,$3,NOW(),NULL,NULL)
       ON CONFLICT(guild_id,user_id) DO UPDATE SET username=EXCLUDED.username,joined_at=NOW(),last_message_at=NULL,depressed_applied_at=NULL`,
      [member.guild.id, member.id, member.user.username],
    );
    await pool.query(
      `INSERT INTO member_profiles(guild_id,user_id) VALUES($1,$2)
       ON CONFLICT(guild_id,user_id) DO NOTHING`,
      [member.guild.id, member.id],
    );
    const ch = findChannel(member.guild, CONFIG.channels.welcome);
    const verifyCh = findChannel(member.guild, CONFIG.channels.verification);
    if (ch) {
      const embed = new EmbedBuilder()
        .setColor(CONFIG.brand.color)
        .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTitle(`👋 Seja bem-vindo, ${member.displayName}!`)
        .setDescription(`Seja bem-vindo! <@${member.id}> 🎉\n\nAntes de acessar o servidor, faça sua verificação${verifyCh ? ` em ${verifyCh}` : ''}. Escolha seu perfil e aceite os termos para liberar os canais.`)
        .addFields({ name: '🚪 Status', value: `Você entrou como **${CONFIG.roles.visitor}** até concluir a verificação.` })
        .setTimestamp();
      await ch.send({ content: `<@${member.id}>`, embeds: [embed] });
    }
  } catch (e) { console.error('Boas-vindas:', e); }
});


client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (newMember.user.bot) return;
  const was = Boolean(oldMember.premiumSince);
  const now = Boolean(newMember.premiumSince);
  if (was !== now) await syncBoosterCoupon(newMember, now).catch(console.error);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const draft = (await pool.query(`SELECT * FROM trade_drafts WHERE channel_id=$1 AND user_id=$2`, [message.channel.id, message.author.id])).rows[0];
  if (!draft) return;
  if (!message.attachments.size) return;
  await publishTradeFromDraft(message, draft).catch(async (e) => {
    console.error('Trade draft:', e);
    await message.reply('❌ Ocorreu um erro ao processar a imagem da troca.').catch(() => {});
  });
});

client.on('interactionCreate', async (interaction) => {
  try {
    const id = interaction.customId || '';

    if (id === 'game_order_open' || id === 'game_order_modal') return handleGameOrder(interaction);
    if (id === 'admin_steam' || id.startsWith('steam_admin')) return handleAdminSteam(interaction);
    if (id === 'steam_browse' || id === 'steam_select' || id.startsWith('steam_buy:')) return handleSteamStore(interaction);
    if (id === 'admin_revenue' || id === 'revenue_split' || id === 'revenue_split_modal') return handleAdminRevenue(interaction);
    if (id === 'admin_giveaways' || id.startsWith('giveaway_')) return handleGiveaways(interaction);
    if (id.startsWith('trade_')) return handleTrades(interaction);

    if (id.startsWith('verify_gender:')) {
      if (!interaction.guild || !interaction.member) return interaction.reply({ content: '❌ Use dentro do servidor.', ephemeral: true });
      const choice = id.split(':')[1];
      const selected = choice === 'male' ? CONFIG.roles.male : CONFIG.roles.female;
      const opposite = choice === 'male' ? CONFIG.roles.female : CONFIG.roles.male;
      const selectedRole = findRole(interaction.guild, selected);
      const oppositeRole = findRole(interaction.guild, opposite);
      if (oppositeRole) await interaction.member.roles.remove(oppositeRole).catch(() => {});
      if (selectedRole) await interaction.member.roles.add(selectedRole).catch(() => {});
      await pool.query(
        `INSERT INTO member_profiles(guild_id,user_id,gender,updated_at) VALUES($1,$2,$3,NOW())
         ON CONFLICT(guild_id,user_id) DO UPDATE SET gender=EXCLUDED.gender,updated_at=NOW()`,
        [interaction.guild.id, interaction.user.id, choice],
      );
      return interaction.reply({ content: `✅ Perfil atualizado: **${selected}**.`, ephemeral: true });
    }

    if (id.startsWith('verify_age:')) {
      if (!interaction.guild || !interaction.member) return interaction.reply({ content: '❌ Use dentro do servidor.', ephemeral: true });
      const choice = id.split(':')[1];
      const selected = choice === 'adult' ? CONFIG.roles.adult : CONFIG.roles.minor;
      const opposite = choice === 'adult' ? CONFIG.roles.minor : CONFIG.roles.adult;
      const selectedRole = findRole(interaction.guild, selected);
      const oppositeRole = findRole(interaction.guild, opposite);
      if (oppositeRole) await interaction.member.roles.remove(oppositeRole).catch(() => {});
      if (selectedRole) await interaction.member.roles.add(selectedRole).catch(() => {});
      await pool.query(
        `INSERT INTO member_profiles(guild_id,user_id,age_group,updated_at) VALUES($1,$2,$3,NOW())
         ON CONFLICT(guild_id,user_id) DO UPDATE SET age_group=EXCLUDED.age_group,updated_at=NOW()`,
        [interaction.guild.id, interaction.user.id, choice],
      );
      return interaction.reply({ content: `✅ Faixa etária atualizada: **${selected}**.`, ephemeral: true });
    }

    if (id === 'verify_accept') {
      if (!interaction.guild || !interaction.member) return interaction.reply({ content: '❌ Use dentro do servidor.', ephemeral: true });
      const profile = (await pool.query('SELECT * FROM member_profiles WHERE guild_id=$1 AND user_id=$2', [interaction.guild.id, interaction.user.id])).rows[0];
      if (!profile?.gender || !profile?.age_group) return interaction.reply({ content: '⚠️ Primeiro escolha **Homem/Mulher** e **+18/-18**.', ephemeral: true });
      const verified = findRole(interaction.guild, CONFIG.roles.verified);
      const visitor = findRole(interaction.guild, CONFIG.roles.visitor);
      if (verified) await interaction.member.roles.add(verified).catch(() => {});
      if (visitor) await interaction.member.roles.remove(visitor).catch(() => {});
      await pool.query('UPDATE member_profiles SET terms_accepted_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [interaction.guild.id, interaction.user.id]);
      await addHistory('MEMBER_VERIFIED', { userId: interaction.user.id, username: interaction.user.username, details: { gender: profile.gender, ageGroup: profile.age_group } });
      return interaction.reply({ content: "✅ Verificação concluída. O servidor foi liberado para você. Bem-vindo à **Berovenda's**!", ephemeral: true });
    }

    if (id.startsWith('selfrole:')) {
      if (!interaction.guild || !interaction.member) return interaction.reply({ content: '❌ Use dentro do servidor.', ephemeral: true });
      const key = id.split(':')[1];
      const item = SELF_ROLES.find((x) => x.key === key);
      if (!item) return interaction.reply({ content: '❌ Cargo não encontrado.', ephemeral: true });
      const role = findRole(interaction.guild, item.name);
      if (!role) return interaction.reply({ content: '❌ Cargo ainda não foi criado. Peça a um admin para usar `+setup`.', ephemeral: true });
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role).catch(() => {});
        return interaction.reply({ content: `➖ Cargo ${role} removido.`, ephemeral: true });
      }
      await interaction.member.roles.add(role).catch(() => {});
      return interaction.reply({ content: `➕ Cargo ${role} adicionado.`, ephemeral: true });
    }

    if (id.startsWith('feedback_')) return handleFeedback(interaction);
    if (id.startsWith('admin_stock') || id.startsWith('stock_')) return handleAdminStock(interaction);
    if (id.startsWith('admin_prices') || id.startsWith('price_')) return handleAdminPrices(interaction);
    if (id.startsWith('admin_coupons') || id.startsWith('coupon_')) return handleCoupons(interaction);
    if (id === 'admin_waitlist') return handleAdminWaitlist(interaction);
    if (id === 'admin_history') return handleAdminHistory(interaction);
    if (id.startsWith('admin_logs')) return handleAdminLogs(interaction);
    if (id === 'admin_orders') return handleAdminOrders(interaction);
    if (id === 'admin_refresh') {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      await refreshPanels(interaction.guild);
      await publishStaticPanels(interaction.guild);
      await adminLog(interaction.guild, interaction.user, 'REFRESH_PANELS');
      return interaction.reply({ content: '✅ Painéis atualizados.', ephemeral: true });
    }

    if (id.startsWith('steam_retry_delivery:')) {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      const purchaseId = Number(id.split(':')[1]);
      const p = (await pool.query(`SELECT * FROM purchases WHERE id=$1 AND purchase_type='STEAM' AND status='PAID'`, [purchaseId])).rows[0];
      if (!p) return interaction.reply({ content: '❌ Pedido Steam não está aguardando entrega.', ephemeral: true });
      const delivered = await deliverSteamPurchase(interaction.guild, p);
      return interaction.reply({ content: delivered.success ? `✅ Entrega concluída. Cupom: **${delivered.coupon}**.` : `❌ Falha na entrega: ${delivered.reason}.`, ephemeral: true });
    }

    if (id.startsWith('purchase_paid:')) return markPaid(interaction, Number(id.split(':')[1]));
    if (id.startsWith('purchase_complete:')) return completePurchase(interaction, Number(id.split(':')[1]));
    if (id.startsWith('purchase_cancel:')) return cancelPurchase(interaction, Number(id.split(':')[1]));
    if (id === 'ticket_close') {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Somente a administração pode fechar este ticket.', ephemeral: true });
      await interaction.reply({ content: '🔒 Ticket será fechado em 2 segundos.', ephemeral: true });
      return setTimeout(() => interaction.channel?.delete().catch(() => {}), 2000);
    }

    if (id === 'support_open') {
      if (!interaction.guild) return interaction.reply({ content: '❌ Abra o suporte dentro do servidor.', ephemeral: true });
      const ticket = await createPrivateTicket(interaction.guild, interaction.user, 'support');
      await ticket.send({
        content: `<@${interaction.user.id}>`,
        embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('🛠️ Ticket de suporte').setDescription('Descreva sua dúvida ou problema. A equipe responderá aqui.')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar ticket').setStyle(ButtonStyle.Secondary))],
      });
      await addHistory('SUPPORT_TICKET_OPEN', { userId: interaction.user.id, username: interaction.user.username, details: { ticketId: ticket.id } });
      return interaction.reply({ content: `✅ Suporte aberto: ${ticket}`, ephemeral: true });
    }

    if (id === 'wait_my_position') {
      const rows = (await pool.query(
        `SELECT w.*,p.name product_name FROM waitlist w JOIN products p ON p.id=w.product_id WHERE w.user_id=$1 ORDER BY w.joined_at`,
        [interaction.user.id],
      )).rows;
      if (!rows.length) return interaction.reply({ content: 'ℹ️ Você não está em nenhuma lista de espera.', ephemeral: true });
      const lines = [];
      for (const row of rows) {
        const pos = (await pool.query(`SELECT COUNT(*)::int n FROM waitlist WHERE product_id=$1 AND (joined_at,id) <= ($2,$3)`, [row.product_id, row.joined_at, row.id])).rows[0].n;
        lines.push(`• **${row.product_name}** — posição **#${pos}**`);
      }
      return interaction.reply({ content: `👥 **Sua posição**\n\n${lines.join('\n')}`, ephemeral: true });
    }

    if (id === 'wait_leave_menu') {
      const rows = (await pool.query(`SELECT w.*,p.name product_name FROM waitlist w JOIN products p ON p.id=w.product_id WHERE w.user_id=$1 ORDER BY p.rap`, [interaction.user.id])).rows;
      if (!rows.length) return interaction.reply({ content: 'ℹ️ Você não está em nenhuma lista de espera.', ephemeral: true });
      return interaction.reply({
        content: 'Escolha de qual fila deseja sair:',
        components: [new ActionRowBuilder().addComponents(...rows.map((r) => new ButtonBuilder().setCustomId(`wait_leave:${r.product_id}`).setLabel(r.product_name).setStyle(ButtonStyle.Secondary)))],
        ephemeral: true,
      });
    }


    if (id === 'cart_roblox') {
      const modal = new ModalBuilder().setCustomId('cart_roblox_modal').setTitle('Usuário do Roblox');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('username').setLabel('Seu usuário do Roblox').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: MeuUsuario123').setMinLength(3).setMaxLength(20),
      ));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && id === 'cart_roblox_modal') {
      const username = interaction.fields.getTextInputValue('username').trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return interaction.reply({ content: '❌ Usuário Roblox inválido. Use de 3 a 20 caracteres com letras, números ou `_`.', ephemeral: true });
      const cart = await getCart(interaction.guild.id, interaction.user.id);
      if (!cart) return interaction.reply({ content: '❌ Carrinho expirado. Inicie a compra novamente.', ephemeral: true });
      await pool.query(`UPDATE carts SET roblox_username=$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2`, [interaction.guild.id, interaction.user.id, username]);
      return interaction.reply({ ...(await cartMessage(interaction.guild.id, interaction.user.id)), ephemeral: true });
    }

    if (interaction.isModalSubmit() && id === 'cart_coupon_modal') {
      const cart = await getCart(interaction.guild.id, interaction.user.id);
      if (!cart) return interaction.reply({ content: '❌ Carrinho expirado.', ephemeral: true });
      const code = interaction.fields.getTextInputValue('code').trim().toUpperCase();
      const p = await getProduct(cart.product_id);
      const subtotal = p.price * Number(cart.quantity);
      const check = await validateCoupon(code, interaction.user.id, p.id, subtotal);
      if (!check.valid) return interaction.reply({ content: `❌ ${check.reason}`, ephemeral: true });
      await pool.query('UPDATE carts SET coupon_code=$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [interaction.guild.id, interaction.user.id, code]);
      return interaction.reply({ content: `✅ Cupom **${code}** aplicado. Volte ao painel da compra para confirmar o pedido.`, ephemeral: true });
    }

    if (!interaction.isButton()) return;

    if (id === 'buy_open') {
      const ps = await allProducts();
      const text = ps.map((p) => `💎 **${p.name}** — ${money(p.price)}\n📦 ${p.active && p.stock > 0 ? `🟢 ${p.stock} disponíveis` : '🔴 Sem estoque'}`).join('\n\n');
      return interaction.reply({ content: `🩸 **Berovenda's — Escolha seu produto**\n\n${text}`, components: [productButtons(ps)], ephemeral: true });
    }

    if (id.startsWith('buy_product:')) {
      const productId = id.split(':')[1];
      const p = await getProduct(productId);
      if (!p) return interaction.update({ content: '❌ Produto não encontrado.', components: [] });
      if (!p.active) return interaction.update({ content: '⛔ Produto indisponível.', components: [] });
      if (p.stock <= 0) {
        return interaction.update({
          content: `🔴 **${p.name} está sem estoque.**`,
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wait_join:${productId}`).setLabel('Entrar na lista de espera').setEmoji('👥').setStyle(ButtonStyle.Danger))],
        });
      }
      await setCart(interaction.guild.id, interaction.user.id, productId, 1, null);
      return interaction.update(await cartMessage(interaction.guild.id, interaction.user.id));
    }

    if (id === 'cart_inc' || id === 'cart_dec') {
      const cart = await getCart(interaction.guild.id, interaction.user.id);
      if (!cart) return interaction.update({ content: '❌ Carrinho expirado. Inicie a compra novamente.', components: [] });
      const q = Math.max(1, Math.min(CONFIG.maxQuantity, Number(cart.quantity) + (id === 'cart_inc' ? 1 : -1)));
      await pool.query('UPDATE carts SET quantity=$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [interaction.guild.id, interaction.user.id, q]);
      return interaction.update(await cartMessage(interaction.guild.id, interaction.user.id));
    }

    if (id === 'cart_qty') return interaction.deferUpdate();

    if (id === 'cart_coupon') {
      const modal = new ModalBuilder().setCustomId('cart_coupon_modal').setTitle('Aplicar cupom');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código promocional').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (id === 'cart_coupon_remove') {
      await pool.query('UPDATE carts SET coupon_code=NULL,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2', [interaction.guild.id, interaction.user.id]);
      return interaction.update(await cartMessage(interaction.guild.id, interaction.user.id));
    }

    if (id === 'cart_confirm') {
      const cart = await getCart(interaction.guild.id, interaction.user.id);
      if (!cart) return interaction.update({ content: '❌ Carrinho expirado. Inicie a compra novamente.', components: [] });
      await interaction.deferUpdate();
      const r = await createPurchase(interaction.user, interaction.guild, cart.product_id, Number(cart.quantity));
      if (!r.success && r.reason === 'ROBLOX_REQUIRED') {
        return interaction.editReply({ content: '⚠️ Informe seu **usuário do Roblox** antes de confirmar a compra.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cart_roblox').setLabel('Informar usuário Roblox').setEmoji('🎮').setStyle(ButtonStyle.Danger))] });
      }
      if (!r.success && r.reason === 'OUT') {
        return interaction.editReply({ content: '🔴 O produto acabou antes da confirmação.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wait_join:${cart.product_id}`).setLabel('Entrar na lista de espera').setStyle(ButtonStyle.Danger))] });
      }
      if (!r.success) return interaction.editReply({ content: '❌ Não foi possível concluir o pedido.', components: [] });
      return interaction.editReply({
        content: `✅ **Pedido #${r.purchase.id} criado!**\n📦 ${r.purchase.product_name}\n🔢 Quantidade: **${r.purchase.quantity}**\n💰 Total: **${money(r.purchase.total)}**${r.adjusted ? '\n⚠️ A quantidade foi ajustada ao estoque disponível.' : ''}\n🎫 Ticket: ${r.ticket}`,
        components: [],
      });
    }

    if (id.startsWith('wait_join:')) {
      const productId = id.split(':')[1];
      const p = await getProduct(productId);
      const r = await joinWaitlist(productId, interaction.user);
      if (!r.success && r.reason === 'ALREADY') return interaction.update({ content: `👥 Você já está na lista de **${p.name}**. Posição **#${r.position}**.`, components: [] });
      if (!r.success && r.reason === 'FULL') return interaction.update({ content: `🔴 Lista de espera de **${p.name}** cheia (**10/10**).`, components: [] });
      await addHistory('WAITLIST_JOIN', { userId: interaction.user.id, username: interaction.user.username, productId: p.id, productName: p.name, details: { position: r.position, total: r.total } });
      return interaction.update({
        content: `✅ Você entrou na lista de espera de **${p.name}**.\n👥 Posição: **#${r.position}**\n📊 **${r.total}/10**\n\nQuando houver reposição, o bot avisará por **DM e no canal de avisos**. Cada pessoa recebe uma rodada de **1 minuto**, sem reserva de estoque.`,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wait_leave:${productId}`).setLabel('Sair da espera').setStyle(ButtonStyle.Secondary))],
      });
    }

    if (id.startsWith('wait_leave:')) {
      const productId = id.split(':')[1];
      const p = await getProduct(productId);
      const removed = await leaveWaitlist(productId, interaction.user.id);
      if (removed) await addHistory('WAITLIST_LEAVE', { userId: interaction.user.id, username: interaction.user.username, productId: p?.id, productName: p?.name });
      if (interaction.deferred || interaction.replied) return interaction.followUp({ content: removed ? '✅ Você saiu da lista de espera.' : 'ℹ️ Você não estava nessa lista.', ephemeral: true });
      return interaction.update({ content: removed ? '✅ Você saiu da lista de espera.' : 'ℹ️ Você não estava nessa lista.', components: [] });
    }
  } catch (e) {
    console.error('Interação:', e);
    if (interaction.isRepliable()) {
      const payload = { content: '❌ Ocorreu um erro ao processar essa ação.', ephemeral: true };
      if (interaction.replied || interaction.deferred) interaction.followUp(payload).catch(() => {});
      else interaction.reply(payload).catch(() => {});
    }
  }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
client.login(process.env.DISCORD_TOKEN);
