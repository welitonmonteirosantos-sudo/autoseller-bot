const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits
} = require('discord.js');
const { Pool } = require('pg');

const CONFIG = {
  brand: { name: "Berovenda's", color: 0xed1c24 },
  products: {
    rap_100: { id: 'rap_100', name: '100 RAP', rap: 100, price: 3.50 },
    rap_1000: { id: 'rap_1000', name: '1.000 RAP', rap: 1000, price: 17.00 },
  },
  maxQuantity: 10,
  waitlistMax: 10,
  waitlistOpportunityMs: 60_000,
  roles: { owner: '👑 DONO', admin: '🛡️ ADMIN', customer: '👤 CLIENTE' },
  channels: {
    buy: '🛒・comprar', announcements: '📢・avisos', admin: '⚙️・painel',
    logs: '📋・logs', history: '📊・histórico', sales: '🛒・vendas'
  }
};

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN não configurado.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const money = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const isAdmin = (member) => member?.roles?.cache?.some(r => [CONFIG.roles.owner, CONFIG.roles.admin].includes(r.name));
const findChannel = (guild, name) => guild.channels.cache.find(c => c.name === name);

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, rap INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL, stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS waitlist (
      id BIGSERIAL PRIMARY KEY, product_id TEXT NOT NULL, user_id TEXT NOT NULL,
      username TEXT NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notified_at TIMESTAMPTZ,
      UNIQUE(product_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS history (
      id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, user_id TEXT, username TEXT,
      product_id TEXT, product_name TEXT, quantity INTEGER, details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL PRIMARY KEY, admin_id TEXT NOT NULL, admin_name TEXT NOT NULL,
      action TEXT NOT NULL, product_id TEXT, product_name TEXT, old_value TEXT,
      new_value TEXT, details JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
      product_id TEXT NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL, total NUMERIC(10,2) NOT NULL,
      ticket_id TEXT, status TEXT NOT NULL DEFAULT 'PENDING', coupon_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY, discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED')),
      discount_value NUMERIC(10,2) NOT NULL, product_id TEXT,
      max_uses INTEGER, max_uses_per_user INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS coupon_uses (
      id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, user_id TEXT NOT NULL,
      purchase_id BIGINT, used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id BIGSERIAL PRIMARY KEY, purchase_id BIGINT UNIQUE NOT NULL, user_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10), comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  for (const p of Object.values(CONFIG.products)) {
    await pool.query(`INSERT INTO products(id,name,rap,price,stock,active)
      VALUES($1,$2,$3,$4,0,TRUE)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, rap=EXCLUDED.rap`, [p.id,p.name,p.rap,p.price]);
  }
}

async function addHistory(type, data={}) {
  await pool.query(`INSERT INTO history(type,user_id,username,product_id,product_name,quantity,details)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [type,data.userId||null,data.username||null,data.productId||null,data.productName||null,data.quantity||null,data.details?JSON.stringify(data.details):null]);
}
async function adminLog(user, action, data={}) {
  await pool.query(`INSERT INTO admin_logs(admin_id,admin_name,action,product_id,product_name,old_value,new_value,details)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [user.id,user.username,action,data.productId||null,data.productName||null,data.oldValue==null?null:String(data.oldValue),data.newValue==null?null:String(data.newValue),data.details?JSON.stringify(data.details):null]);
}
async function getProduct(id) {
  const r = await pool.query('SELECT * FROM products WHERE id=$1 LIMIT 1',[id]);
  if (!r.rows[0]) return null;
  return {...r.rows[0], price:Number(r.rows[0].price), stock:Number(r.rows[0].stock)};
}
async function allProducts(){
  const r=await pool.query('SELECT * FROM products ORDER BY rap ASC');
  return r.rows.map(x=>({...x,price:Number(x.price),stock:Number(x.stock)}));
}

async function createPurchasePanel() {
  const [a,b]=await Promise.all([getProduct('rap_100'),getProduct('rap_1000')]);
  const stock=(p)=>p?.active&&p.stock>0?`🟢 ${p.stock} disponíveis`:'🔴 Sem estoque';
  const embed=new EmbedBuilder().setColor(CONFIG.brand.color).setTitle("Berovenda's — Central de Compras")
    .setDescription('Compre **RAP do Blade Ball** de forma rápida e segura.\n\nClique no botão abaixo para iniciar sua compra.')
    .addFields(
      {name:'💎 100 RAP',value:`💰 **${money(a.price)}**\n📦 ${stock(a)}`,inline:true},
      {name:'💎 1.000 RAP',value:`💰 **${money(b.price)}**\n📦 ${stock(b)}`,inline:true},
      {name:'📋 Informações',value:'• Escolha de **1 a 10 unidades**\n• **1 produto por ticket**\n• Estoque atualizado automaticamente',inline:false})
    .setFooter({text:"Berovenda's • Blade Ball RAP"}).setTimestamp();
  if(process.env.PANEL_IMAGE_URL) embed.setImage(process.env.PANEL_IMAGE_URL);
  return {embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('buy_open').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Danger))]};
}

async function createAdminPanel(){
  const [a,b]=await Promise.all([getProduct('rap_100'),getProduct('rap_1000')]);
  const embed=new EmbedBuilder().setColor(CONFIG.brand.color).setTitle("⚙️ Berovenda's — Painel Administrativo")
    .setDescription('Gerencie a loja pelos botões abaixo.\n\n🔒 **Acesso exclusivo da administração.**')
    .addFields({name:'💎 100 RAP',value:`💰 ${money(a.price)}\n📦 Estoque: **${a.stock}**`,inline:true},{name:'💎 1.000 RAP',value:`💰 ${money(b.price)}\n📦 Estoque: **${b.stock}**`,inline:true})
    .setTimestamp();
  const r1=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_stock').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin_prices').setLabel('Preços').setEmoji('💰').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin_coupons').setLabel('Cupons').setEmoji('🎟️').setStyle(ButtonStyle.Secondary));
  const r2=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_waitlist').setLabel('Lista de espera').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_logs').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary));
  return {embeds:[embed],components:[r1,r2]};
}

function productButtons(products){
  return new ActionRowBuilder().addComponents(...products.map(p=>new ButtonBuilder().setCustomId(`buy_product:${p.id}`).setLabel(`${p.name} • ${money(p.price)}`).setEmoji('🛒').setStyle(ButtonStyle.Danger)));
}
function qtyRows(productId,q){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`qty_dec:${productId}:${q}`).setLabel('−').setStyle(ButtonStyle.Secondary).setDisabled(q<=1),
    new ButtonBuilder().setCustomId(`qty_now:${productId}:${q}`).setLabel(String(q)).setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId(`qty_inc:${productId}:${q}`).setLabel('+').setStyle(ButtonStyle.Secondary).setDisabled(q>=CONFIG.maxQuantity)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`qty_confirm:${productId}:${q}`).setLabel('Confirmar compra').setEmoji('🛒').setStyle(ButtonStyle.Danger))];
}
async function qtyMessage(productId,q){
  const p=await getProduct(productId); if(!p) return null;
  const total=p.price*q;
  return {content:`🩸 **Berovenda's — ${p.name}**\n\n💰 Preço unitário: **${money(p.price)}**\n🔢 Quantidade: **${q}**\n💵 Total: **${money(total)}**\n📦 Estoque atual: **${p.stock}**\n\nEscolha de **1 a 10 unidades**.`,components:qtyRows(productId,q)};
}

async function joinWaitlist(productId,user){
  const c=await pool.connect();
  try{await c.query('BEGIN');
    const ex=await c.query('SELECT * FROM waitlist WHERE product_id=$1 AND user_id=$2',[productId,user.id]);
    if(ex.rowCount){const pos=await c.query('SELECT COUNT(*)::int p FROM waitlist WHERE product_id=$1 AND (joined_at,id) <= ($2,$3)',[productId,ex.rows[0].joined_at,ex.rows[0].id]);await c.query('ROLLBACK');return {success:false,reason:'ALREADY',position:pos.rows[0].p};}
    const count=await c.query('SELECT COUNT(*)::int n FROM waitlist WHERE product_id=$1',[productId]);
    if(count.rows[0].n>=CONFIG.waitlistMax){await c.query('ROLLBACK');return {success:false,reason:'FULL'};}
    await c.query('INSERT INTO waitlist(product_id,user_id,username) VALUES($1,$2,$3)',[productId,user.id,user.username]);
    await c.query('COMMIT'); return {success:true,position:count.rows[0].n+1,total:count.rows[0].n+1};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function leaveWaitlist(productId,userId){
  const r=await pool.query('DELETE FROM waitlist WHERE product_id=$1 AND user_id=$2 RETURNING *',[productId,userId]);
  return r.rowCount>0;
}

async function notifyWaitlist(guild,product){
  const rows=(await pool.query('SELECT * FROM waitlist WHERE product_id=$1 ORDER BY joined_at ASC,id ASC',[product.id])).rows;
  for(let i=0;i<rows.length;i++){
    const entry=rows[i];
    try{
      const u=await client.users.fetch(entry.user_id);
      await u.send(`📦 **${product.name} voltou ao estoque!**\n\nSua posição é **#${i+1}**. Você tem **1 minuto** para aproveitar a oportunidade.\n⚠️ O estoque **não fica reservado**.`);
      await pool.query('UPDATE waitlist SET notified_at=NOW() WHERE id=$1',[entry.id]);
      await addHistory('WAITLIST_NOTIFY',{userId:entry.user_id,username:entry.username,productId:product.id,productName:product.name,details:{position:i+1}});
    }catch(e){console.error('DM lista de espera:',e.message);}
  }
}

async function createTicket(guild,user,product,quantity,total){
  const admin=guild.roles.cache.find(r=>r.name===CONFIG.roles.admin), owner=guild.roles.cache.find(r=>r.name===CONFIG.roles.owner);
  const overwrites=[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];
  for(const role of [admin,owner]) if(role) overwrites.push({id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  const ch=await guild.channels.create({name:`compra-${product.rap}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,80),type:ChannelType.GuildText,permissionOverwrites:overwrites,reason:`Compra ${user.tag}`});
  const purchase=(await pool.query(`INSERT INTO purchases(user_id,username,product_id,product_name,quantity,unit_price,total,ticket_id,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING') RETURNING *`,[user.id,user.username,product.id,product.name,quantity,product.price,total,ch.id])).rows[0];
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`purchase_complete:${purchase.id}`).setLabel('Marcar como entregue').setEmoji('✅').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_close:${purchase.id}`).setLabel('Fechar ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary));
  await ch.send({content:`🛒 **Novo pedido — Berovenda's**\n\n👤 Cliente: <@${user.id}>\n📦 Produto: **${product.name}**\n🔢 Quantidade: **${quantity}**\n💰 Total: **${money(total)}**\n📌 Status: **Pendente**`,components:[row]});
  return {channel:ch,purchase};
}

async function processPurchase(guild,user,productId,requested){
  const c=await pool.connect();
  try{await c.query('BEGIN');
    const r=await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[productId]);
    if(!r.rowCount){await c.query('ROLLBACK');return {success:false,reason:'NOT_FOUND'};}
    const p={...r.rows[0],price:Number(r.rows[0].price),stock:Number(r.rows[0].stock)};
    if(!p.active){await c.query('ROLLBACK');return {success:false,reason:'DISABLED',product:p};}
    if(p.stock<=0){await c.query('ROLLBACK');return {success:false,reason:'OUT',product:p};}
    const q=Math.min(requested,p.stock,CONFIG.maxQuantity), total=Number((p.price*q).toFixed(2));
    const up=(await c.query('UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1 RETURNING *',[productId,q])).rows[0];
    await c.query('COMMIT');
    let ticket;
    try{ticket=await createTicket(guild,user,p,q,total);}catch(e){await pool.query('UPDATE products SET stock=stock+$2 WHERE id=$1',[productId,q]);throw e;}
    await leaveWaitlist(productId,user.id);
    await addHistory('PURCHASE',{userId:user.id,username:user.username,productId:p.id,productName:p.name,quantity:q,details:{purchaseId:ticket.purchase.id,total,ticketId:ticket.channel.id}});
    return {success:true,product:{...p,stock:Number(up.stock)},quantity:q,requested,adjusted:q!==requested,total,ticket:ticket.channel,purchase:ticket.purchase};
  }catch(e){try{await c.query('ROLLBACK')}catch{} throw e;}finally{c.release();}
}

async function handleAdminStock(interaction){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  if(interaction.customId==='admin_stock'){
    const ps=await allProducts();
    return interaction.reply({content:'📦 **Gerenciamento de estoque**\nEscolha um produto:',components:[new ActionRowBuilder().addComponents(...ps.map(p=>new ButtonBuilder().setCustomId(`stock_product:${p.id}`).setLabel(`${p.name} • ${p.stock}`).setStyle(ButtonStyle.Danger)))],ephemeral:true});
  }
  if(interaction.customId.startsWith('stock_product:')){
    const id=interaction.customId.split(':')[1], p=await getProduct(id);
    return interaction.update({content:`📦 **${p.name}** — estoque atual: **${p.stock}**`,components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`stock_add:${id}`).setLabel('Adicionar').setEmoji('➕').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`stock_set:${id}`).setLabel('Definir').setEmoji('✏️').setStyle(ButtonStyle.Secondary))]});
  }
  if(interaction.customId.startsWith('stock_add:')||interaction.customId.startsWith('stock_set:')){
    const [mode,id]=interaction.customId.split(':');
    const modal=new ModalBuilder().setCustomId(`stock_modal:${mode}:${id}`).setTitle(mode==='stock_add'?'Adicionar estoque':'Definir estoque');
    const input=new TextInputBuilder().setCustomId('qty').setLabel('Quantidade').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: 10');
    modal.addComponents(new ActionRowBuilder().addComponents(input)); return interaction.showModal(modal);
  }
  if(interaction.customId.startsWith('stock_modal:')){
    const [,mode,id]=interaction.customId.split(':'), qty=Number(interaction.fields.getTextInputValue('qty'));
    if(!Number.isInteger(qty)||qty<0||(mode==='stock_add'&&qty===0)) return interaction.reply({content:'❌ Quantidade inválida.',ephemeral:true});
    const before=await getProduct(id); let after;
    if(mode==='stock_add') after=(await pool.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 RETURNING *',[id,qty])).rows[0];
    else after=(await pool.query('UPDATE products SET stock=$2,updated_at=NOW() WHERE id=$1 RETURNING *',[id,qty])).rows[0];
    const mapped={...after,price:Number(after.price),stock:Number(after.stock)};
    await adminLog(interaction.user,mode==='stock_add'?'ADD_STOCK':'SET_STOCK',{productId:id,productName:mapped.name,oldValue:before.stock,newValue:mapped.stock});
    if(before.stock===0 && mapped.stock>0) notifyWaitlist(interaction.guild,mapped).catch(console.error);
    return interaction.reply({content:`✅ Estoque atualizado: **${mapped.name}**\nAnterior: **${before.stock}**\nAtual: **${mapped.stock}**`,ephemeral:true});
  }
}

async function handleAdminPrices(interaction){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  if(interaction.customId==='admin_prices'){
    const ps=await allProducts();
    return interaction.reply({content:'💰 **Gerenciamento de preços**',components:[new ActionRowBuilder().addComponents(...ps.map(p=>new ButtonBuilder().setCustomId(`price_product:${p.id}`).setLabel(`${p.name} • ${money(p.price)}`).setStyle(ButtonStyle.Danger)))],ephemeral:true});
  }
  if(interaction.customId.startsWith('price_product:')){
    const id=interaction.customId.split(':')[1], p=await getProduct(id);
    const modal=new ModalBuilder().setCustomId(`price_modal:${id}`).setTitle(`Preço • ${p.name}`);
    const input=new TextInputBuilder().setCustomId('price').setLabel('Novo preço').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Exemplo: 3,50');
    modal.addComponents(new ActionRowBuilder().addComponents(input)); return interaction.showModal(modal);
  }
  if(interaction.customId.startsWith('price_modal:')){
    const id=interaction.customId.split(':')[1], raw=interaction.fields.getTextInputValue('price').replace(',','.'), value=Number(raw);
    if(!Number.isFinite(value)||value<0) return interaction.reply({content:'❌ Preço inválido.',ephemeral:true});
    const before=await getProduct(id); const after=(await pool.query('UPDATE products SET price=$2,updated_at=NOW() WHERE id=$1 RETURNING *',[id,value])).rows[0];
    await adminLog(interaction.user,'SET_PRICE',{productId:id,productName:after.name,oldValue:before.price,newValue:value});
    return interaction.reply({content:`✅ Preço de **${after.name}** alterado para **${money(value)}**.`,ephemeral:true});
  }
}

async function handleWaitlistAdmin(interaction){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  const rows=(await pool.query(`SELECT w.*,p.name product_name FROM waitlist w JOIN products p ON p.id=w.product_id ORDER BY w.joined_at ASC`)).rows;
  const text=rows.length?rows.map((r,i)=>`${i+1}. <@${r.user_id}> — **${r.product_name}**`).join('\n'):'Nenhum cliente aguardando.';
  return interaction.reply({content:`👥 **Lista de espera**\n\n${text}`,ephemeral:true});
}
async function handleLogs(interaction){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  const rows=(await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC,id DESC LIMIT 15')).rows;
  const text=rows.length?rows.map(r=>`• **${r.action}** — ${r.admin_name}${r.product_name?` — ${r.product_name}`:''}`).join('\n'):'Nenhum log.';
  return interaction.reply({content:`📋 **Logs administrativos — recentes**\n\n${text}`,ephemeral:true});
}
async function handleCoupons(interaction){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  return interaction.reply({content:'🎟️ **Cupons**\nA estrutura persistente já está criada no PostgreSQL. A criação/edição pelo painel fica reservada para o próximo ajuste visual, sem afetar compras atuais.',ephemeral:true});
}

async function completePurchase(interaction,purchaseId){
  if(!isAdmin(interaction.member)) return interaction.reply({content:'❌ Sem permissão.',ephemeral:true});
  const r=await pool.query(`UPDATE purchases SET status='COMPLETED',completed_at=NOW() WHERE id=$1 AND status<>'COMPLETED' RETURNING *`,[purchaseId]);
  if(!r.rowCount) return interaction.reply({content:'ℹ️ Compra já concluída ou não encontrada.',ephemeral:true});
  const p=r.rows[0];
  const member=await interaction.guild.members.fetch(p.user_id).catch(()=>null), customer=interaction.guild.roles.cache.find(x=>x.name===CONFIG.roles.customer);
  if(member&&customer) await member.roles.add(customer).catch(()=>{});
  const sales=findChannel(interaction.guild,CONFIG.channels.sales);
  if(sales){const user=await client.users.fetch(p.user_id).catch(()=>null); await sales.send({embeds:[new EmbedBuilder().setColor(CONFIG.brand.color).setTitle('✅ Produto entregue').setThumbnail(user?.displayAvatarURL()||null).addFields(
    {name:'Cliente',value:`<@${p.user_id}>`,inline:true},{name:'Produto',value:p.product_name,inline:true},{name:'Quantidade',value:String(p.quantity),inline:true},{name:'Valor',value:money(p.total),inline:true},{name:'Data',value:`<t:${Math.floor(Date.now()/1000)}:F>`})]});}
  await adminLog(interaction.user,'COMPLETE_PURCHASE',{productId:p.product_id,productName:p.product_name,details:{purchaseId:Number(p.id)}});
  return interaction.reply({content:'✅ Compra marcada como entregue e cliente atualizado.',ephemeral:true});
}

client.once('ready',async()=>{
  try{await pool.query('SELECT 1'); await setupDatabase(); console.log(`Berovenda's AutoSeller online como ${client.user.tag}`);}catch(e){console.error('Inicialização:',e);}
});

client.on('messageCreate',async(message)=>{
  if(message.author.bot||!message.guild)return; const content=message.content.trim();
  if(content==='+ping') return message.reply('🏓 Pong!');
  if(content==='+painel'){
    if(!isAdmin(message.member))return message.reply('❌ Sem permissão.'); const ch=findChannel(message.guild,CONFIG.channels.buy); if(!ch)return message.reply('❌ Canal de compras não encontrado.');
    const m=await ch.send(await createPurchasePanel()); await adminLog(message.author,'PUBLISH_PURCHASE_PANEL',{details:{channelId:ch.id,messageId:m.id}}); return message.reply(`✅ Painel publicado em ${ch}.`);
  }
  if(content==='+admin'){
    if(!isAdmin(message.member))return message.reply('❌ Sem permissão.'); const ch=findChannel(message.guild,CONFIG.channels.admin); if(!ch)return message.reply('❌ Canal administrativo não encontrado.');
    const m=await ch.send(await createAdminPanel()); await adminLog(message.author,'PUBLISH_ADMIN_PANEL',{details:{channelId:ch.id,messageId:m.id}}); return message.reply(`✅ Painel administrativo publicado em ${ch}.`);
  }
  if(content.startsWith('+hs')){
    if(!isAdmin(message.member))return message.reply('❌ Sem permissão.'); const n=Number(content.split(/\s+/)[1]); if(!Number.isInteger(n)||n<=0)return message.reply('❌ Use: `+hs 10`');
    const del=await pool.query(`DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY created_at ASC,id ASC LIMIT $1) RETURNING id`,[n]); const left=(await pool.query('SELECT COUNT(*)::int n FROM history')).rows[0].n;
    await adminLog(message.author,'CLEAR_HISTORY',{details:{requested:n,removed:del.rowCount,remaining:left}}); return message.reply(`🗑️ Histórico limpo\nRemovido: **${del.rowCount}**\nRestante: **${left}**`);
  }
});

client.on('interactionCreate',async(interaction)=>{
  try{
    const id=interaction.customId||'';
    if(id.startsWith('admin_stock')||id.startsWith('stock_')) return handleAdminStock(interaction);
    if(id.startsWith('admin_prices')||id.startsWith('price_')) return handleAdminPrices(interaction);
    if(id==='admin_waitlist') return handleWaitlistAdmin(interaction);
    if(id==='admin_logs') return handleLogs(interaction);
    if(id==='admin_coupons') return handleCoupons(interaction);
    if(id.startsWith('purchase_complete:')) return completePurchase(interaction,Number(id.split(':')[1]));
    if(id.startsWith('ticket_close:')){if(!isAdmin(interaction.member))return interaction.reply({content:'❌ Sem permissão.',ephemeral:true}); await interaction.reply({content:'🔒 Ticket será fechado.',ephemeral:true}); return setTimeout(()=>interaction.channel.delete().catch(()=>{}),1500);}
    if(!interaction.isButton())return;
    if(id==='buy_open'){
      const ps=await allProducts(); const text=ps.map(p=>`💎 **${p.name}** — ${money(p.price)}\n📦 ${p.active&&p.stock>0?`🟢 ${p.stock} disponíveis`:'🔴 Sem estoque'}`).join('\n\n');
      return interaction.reply({content:`🩸 **Berovenda's — Escolha seu produto**\n\n${text}`,components:[productButtons(ps)],ephemeral:true});
    }
    if(id.startsWith('buy_product:')){
      const pid=id.split(':')[1],p=await getProduct(pid); if(!p)return interaction.update({content:'❌ Produto não encontrado.',components:[]});
      if(!p.active)return interaction.update({content:'⛔ Produto indisponível.',components:[]});
      if(p.stock<=0){return interaction.update({content:`🔴 **${p.name} está sem estoque.**`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wait_join:${pid}`).setLabel('Entrar na lista de espera').setEmoji('👥').setStyle(ButtonStyle.Danger))]});}
      return interaction.update(await qtyMessage(pid,1));
    }
    if(id.startsWith('wait_join:')){
      const pid=id.split(':')[1],p=await getProduct(pid),r=await joinWaitlist(pid,interaction.user);
      if(!r.success&&r.reason==='ALREADY')return interaction.update({content:`👥 Você já está na lista de **${p.name}**. Posição **#${r.position}**.`,components:[]});
      if(!r.success&&r.reason==='FULL')return interaction.update({content:`🔴 Lista de espera de **${p.name}** cheia (10/10).`,components:[]});
      await addHistory('WAITLIST_JOIN',{userId:interaction.user.id,username:interaction.user.username,productId:p.id,productName:p.name,details:{position:r.position,total:r.total}});
      return interaction.update({content:`✅ Você entrou na lista de espera de **${p.name}**.\n👥 Posição: **#${r.position}**\n📊 **${r.total}/10**\n\nVocê será avisado **por DM** quando houver reposição.`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wait_leave:${pid}`).setLabel('Sair da espera').setStyle(ButtonStyle.Secondary))]});
    }
    if(id.startsWith('wait_leave:')){
      const pid=id.split(':')[1],p=await getProduct(pid),ok=await leaveWaitlist(pid,interaction.user.id); if(ok)await addHistory('WAITLIST_LEAVE',{userId:interaction.user.id,username:interaction.user.username,productId:p?.id,productName:p?.name});
      return interaction.update({content:ok?'✅ Você saiu da lista de espera.':'ℹ️ Você não estava na lista.',components:[]});
    }
    if(id.startsWith('qty_inc:')||id.startsWith('qty_dec:')){
      const [kind,pid,raw]=id.split(':'),q=Math.max(1,Math.min(CONFIG.maxQuantity,Number(raw)+(kind==='qty_inc'?1:-1))); return interaction.update(await qtyMessage(pid,q));
    }
    if(id.startsWith('qty_now:'))return interaction.deferUpdate();
    if(id.startsWith('qty_confirm:')){
      const [,pid,raw]=id.split(':'); await interaction.deferUpdate(); const r=await processPurchase(interaction.guild,interaction.user,pid,Number(raw));
      if(!r.success&&r.reason==='OUT')return interaction.editReply({content:'🔴 O produto acabou antes da confirmação.',components:[]});
      if(!r.success)return interaction.editReply({content:'❌ Não foi possível concluir o pedido.',components:[]});
      return interaction.editReply({content:`✅ **Pedido criado!**\n📦 ${r.product.name}\n🔢 Quantidade: **${r.quantity}**\n💰 Total: **${money(r.total)}**${r.adjusted?`\n⚠️ Quantidade ajustada ao estoque disponível.`:''}\n🎫 Ticket: ${r.ticket}`,components:[]});
    }
  }catch(e){console.error('Interação:',e); if(interaction.isRepliable()){const payload={content:'❌ Ocorreu um erro ao processar essa ação.',ephemeral:true}; if(interaction.replied||interaction.deferred)interaction.followUp(payload).catch(()=>{});else interaction.reply(payload).catch(()=>{});}}
});

client.on('error',console.error);
process.on('unhandledRejection',console.error);
client.login(process.env.DISCORD_TOKEN);
