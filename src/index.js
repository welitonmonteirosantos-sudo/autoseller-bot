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
} = require('discord.js');
const { Pool } = require('pg');

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
  },
  categories: {
    public: 'AUTSELLER',
    admin: 'ADMINISTRAÇÃO',
    purchases: '🛒 COMPRAS',
    support: '🛠️ SUPORTE',
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
  },
};

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN não configurado.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const waitlistTimers = new Map();
const money = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const isAdmin = (member) => member?.roles?.cache?.some((r) => [CONFIG.roles.owner, CONFIG.roles.admin].includes(r.name));
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
  `);

  // Migrações para bancos criados por versões anteriores do AutoSeller.
  // CREATE TABLE IF NOT EXISTS não adiciona colunas novas em tabelas já existentes,
  // então mantemos todas as evoluções de esquema aqui com ADD COLUMN IF NOT EXISTS.

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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_waitlist_product_joined ON waitlist(product_id, joined_at, id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_user_created ON purchases(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)`);

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
  if (process.env.PANEL_IMAGE_URL) embed.setImage(process.env.PANEL_IMAGE_URL);
  return {
    embeds: [embed],
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
        new ButtonBuilder().setCustomId('admin_refresh').setLabel('Atualizar painéis').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
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
  return c;
}

async function ensureTextChannel(guild, name, parent, overwrites = undefined) {
  let c = findChannel(guild, name);
  if (!c) c = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parent?.id, permissionOverwrites: overwrites });
  return c;
}

async function ensureServerStructure(guild) {
  const adminRole = findRole(guild, CONFIG.roles.admin);
  const ownerRole = findRole(guild, CONFIG.roles.owner);
  const customerRole = findRole(guild, CONFIG.roles.customer);

  const publicCat = await ensureCategory(guild, CONFIG.categories.public);
  const adminOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ...(ownerRole ? [{ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
  ];
  const adminCat = await ensureCategory(guild, CONFIG.categories.admin, adminOverwrites);
  const purchaseCat = await ensureCategory(guild, CONFIG.categories.purchases, [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]);
  const supportCat = await ensureCategory(guild, CONFIG.categories.support, [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]);

  await ensureTextChannel(guild, CONFIG.channels.announcements, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.buy, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.supportPanel, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.waitlist, publicCat);
  await ensureTextChannel(guild, CONFIG.channels.terms, publicCat);

  const feedbackOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...(customerRole ? [{ id: customerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ...(ownerRole ? [{ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
  ];
  await ensureTextChannel(guild, CONFIG.channels.feedback, publicCat, feedbackOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.admin, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.logs, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.history, adminCat, adminOverwrites);
  await ensureTextChannel(guild, CONFIG.channels.sales, adminCat, adminOverwrites);

  return { publicCat, adminCat, purchaseCat, supportCat };
}

async function publishStaticPanels(guild) {
  const supportCh = findChannel(guild, CONFIG.channels.supportPanel);
  if (supportCh) {
    const oldId = await getSetting(guild.id, 'support_panel_message_id');
    const payload = {
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('🛠️ Suporte — Berovenda\'s').setDescription('Precisa de ajuda? Abra um ticket privado de suporte pelo botão abaixo.')],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('support_open').setLabel('Abrir suporte').setEmoji('🎫').setStyle(ButtonStyle.Danger))],
    };
    const old = oldId ? await supportCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await supportCh.send(payload);
    await setSetting(guild.id, 'support_panel_message_id', msg.id);
  }

  const waitCh = findChannel(guild, CONFIG.channels.waitlist);
  if (waitCh) {
    const oldId = await getSetting(guild.id, 'waitlist_panel_message_id');
    const payload = {
      embeds: [new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('👥 Lista de espera').setDescription('Quando um produto estiver sem estoque, entre na fila pelo painel de compras. Use os botões abaixo para consultar sua posição ou sair da fila.')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wait_my_position').setLabel('Minha posição').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('wait_leave_menu').setLabel('Sair da espera').setStyle(ButtonStyle.Secondary),
      )],
    };
    const old = oldId ? await waitCh.messages.fetch(oldId).catch(() => null) : null;
    const msg = old ? await old.edit(payload) : await waitCh.send(payload);
    await setSetting(guild.id, 'waitlist_panel_message_id', msg.id);
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
    const cart = await db.query('SELECT coupon_code FROM carts WHERE guild_id=$1 AND user_id=$2', [guild.id, user.id]);
    const couponCode = cart.rows[0]?.coupon_code || null;

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
      `INSERT INTO purchases(guild_id,user_id,username,product_id,product_name,quantity,unit_price,subtotal,discount,total,status,coupon_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11) RETURNING *`,
      [guild.id, user.id, user.username, p.id, p.name, q, p.price, subtotal, discount, total, couponUsed],
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
  await adminLog(interaction.guild, interaction.user, 'PAYMENT_CONFIRMED', { productId: r.rows[0].product_id, productName: r.rows[0].product_name, details: { purchaseId } });
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
        { name: 'Produto', value: p.product_name, inline: true },
        { name: 'Quantidade', value: String(p.quantity), inline: true },
        { name: 'Valor', value: money(p.total), inline: true },
        { name: 'Pedido', value: `#${p.id}`, inline: true },
        { name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      );
    await sales.send({ embeds: [embed] });
  }

  if (user) {
    await user.send({
      content: `✅ Seu pedido **#${p.id}** foi marcado como entregue. Obrigado por comprar na **Berovenda's**.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`feedback_open:${p.id}`).setLabel('Avaliar compra').setEmoji('⭐').setStyle(ButtonStyle.Danger))],
    }).catch(() => {});
  }
  await addHistory('PURCHASE_COMPLETED', { userId: p.user_id, username: p.username, productId: p.product_id, productName: p.product_name, quantity: p.quantity, details: { purchaseId } });
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
    await db.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1', [p.product_id, p.quantity]);
    if (p.coupon_code) {
      await db.query('UPDATE coupons SET used_count=GREATEST(0,used_count-1) WHERE code=$1', [p.coupon_code]);
      await db.query('DELETE FROM coupon_uses WHERE purchase_id=$1', [purchaseId]);
    }
    await db.query('COMMIT');
    await addHistory('PURCHASE_CANCELLED', { userId: p.user_id, username: p.username, productId: p.product_id, productName: p.product_name, quantity: p.quantity, details: { purchaseId } });
    await adminLog(interaction.guild, interaction.user, 'CANCEL_PURCHASE', { productId: p.product_id, productName: p.product_name, details: { purchaseId } });
    await refreshPanels(interaction.guild);
    await startRestockNotifications(interaction.guild, p.product_id);
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

client.once('ready', async () => {
  try {
    await pool.query('SELECT 1');
    await setupDatabase();
    console.log(`Berovenda's AutoSeller online como ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
      await resumeWaitlistTimers(guild).catch(console.error);
    }
  } catch (e) {
    console.error('Inicialização:', e);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
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

client.on('interactionCreate', async (interaction) => {
  try {
    const id = interaction.customId || '';

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
