require('dotenv').config();
const path = require('path');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require('discord.js');
const Database = require('better-sqlite3');

// Setup Path Database (Mendukung Railway Volume agar data persisten)
const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const dbDir = volumePath || __dirname;
const dbPath = path.join(dbDir, 'raid_bot.db');

// Inisialisasi Database SQLite
const db = new Database(dbPath);

// Setup Schema Database
db.exec(`
    -- TABLE UNTUK FEATURE RECRUITMENT (/createparty)
    CREATE TABLE IF NOT EXISTS party_recruits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        channel_id TEXT,
        message_id TEXT,
        title TEXT,
        host_id TEXT,
        co_host_id TEXT DEFAULT NULL,
        status TEXT DEFAULT 'Open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS party_recruit_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        role_code TEXT,
        slot_index INTEGER,
        user_id TEXT DEFAULT NULL
    );

    -- TABLE UNTUK FEATURE SALARY PANEL
    CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        channel_id TEXT,
        message_id TEXT,
        title TEXT,
        host_id TEXT,
        co_host_id TEXT DEFAULT NULL,
        status TEXT DEFAULT 'OPEN'
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        name TEXT,
        qty INTEGER DEFAULT 1,
        price INTEGER DEFAULT 0,
        is_sold INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stamp_loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        user_id TEXT,
        stamps INTEGER DEFAULT 1,
        cost_per_stamp INTEGER DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS gold_drops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        amount INTEGER,
        note TEXT
    );

    CREATE TABLE IF NOT EXISTS salary_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        user_id TEXT
    );

    -- TABLE UNTUK TANDA GAJI LUNAS (MARK PAID STATUS)
    CREATE TABLE IF NOT EXISTS salary_paid_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_id INTEGER,
        user_id TEXT
    );
`);

// Auto-Migration untuk kolom co_host_id
try { db.exec("ALTER TABLE parties ADD COLUMN co_host_id TEXT DEFAULT NULL;"); } catch (e) {}

// Konfigurasi Default Roles untuk Recruitment
const DEFAULT_ROLES = [
    { code: 'FU', name: 'FU', slots: 2, emoji: '🔴' },
    { code: 'PR', name: 'PR', slots: 1, emoji: '🏹' },
    { code: 'MC', name: 'MC', slots: 1, emoji: '🪓' },
    { code: 'SM', name: 'SM', slots: 1, emoji: '💥' },
    { code: 'Tank', name: 'Tank', slots: 1, emoji: '🛡️' },
    { code: 'ICE STACK', name: 'Ice Stack', slots: 1, emoji: '❄️' },
    { code: 'ARCHER', name: 'Archer', slots: 2, emoji: '🎯' },
    { code: 'DPS', name: 'DPS', slots: 3, emoji: '⚔️' }
];

// Inisialisasi Client Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    allowedMentions: {
        parse: ['everyone', 'roles', 'users'],
        repliedUser: true
    }
});

// Register Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('createparty')
        .setDescription('Buat panel party recruitment baru')
        .addStringOption(opt => 
            opt.setName('title')
               .setDescription('Nama Raid / Party (Contoh: GDN HC SPAM)')
               .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('set-salary')
        .setDescription('Buat panel perhitungan gaji raid baru (Khusus Host/Co-Host)')
        .addStringOption(opt => 
            opt.setName('title')
               .setDescription('Nama Raid / Party (Contoh: GDN HC SPAM)')
               .setRequired(true)
        )
].map(cmd => cmd.toJSON());

client.once('clientReady', async () => {
    console.log(`🤖 Bot Berhasil Login sebagai ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Slash Commands (/createparty & /set-salary) Berhasil Didaftarkan!');
    } catch (error) {
        console.error('❌ Gagal mendaftarkan slash command:', error);
    }
});

// Helper Format Tag User
function formatUser(userId) {
    if (!userId) return '';
    if (/^\d+$/.test(userId)) return `<@${userId}>`;
    if (!userId.startsWith('@')) return `@${userId}`;
    return userId;
}

// ==========================================
// 1. RENDER FUNCTION: RECRUITMENT PANEL
// ==========================================
async function renderRecruitPanel(partyId) {
    const party = db.prepare('SELECT * FROM party_recruits WHERE id = ?').get(partyId);
    const allSlots = db.prepare('SELECT * FROM party_recruit_slots WHERE party_id = ? ORDER BY id ASC').all(partyId);

    let rolesDescription = '**Roles**\n';
    DEFAULT_ROLES.forEach(r => {
        const slotsForRole = allSlots.filter(s => s.role_code === r.code);
        const slotText = slotsForRole.map(s => s.user_id ? `<@${s.user_id}>` : '*empty*').join(', ');
        rolesDescription += `**${r.name}** — ${slotText}\n`;
    });

    const filledUsers = new Set(allSlots.filter(s => s.user_id !== null).map(s => s.user_id));
    const totalFilled = filledUsers.size;

    let statusEmojiText = '🟢 Open';
    if (party.status === 'Locked') statusEmojiText = '🔒 Locked';
    if (party.status === 'Done') statusEmojiText = '✅ Done';
    if (party.status === 'Cancelled') statusEmojiText = '❌ Cancelled';

    const embed = new EmbedBuilder()
        .setTitle(party.title)
        .setColor(party.status === 'Open' ? 0x2b2d31 : 0x1e1f22)
        .setDescription(rolesDescription)
        .addFields(
            { name: 'Host', value: `<@${party.host_id}>`, inline: true },
            { name: 'Slot', value: `${totalFilled}/8`, inline: true },
            { name: 'Status', value: statusEmojiText, inline: true }
        )
        .setFooter({ text: 'Klik tombol role di bawah untuk join' });

    const isClosed = party.status === 'Done' || party.status === 'Cancelled';

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec_role_FU_${partyId}`).setLabel('FU').setStyle(ButtonStyle.Primary).setEmoji('🔴').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_PR_${partyId}`).setLabel('PR').setStyle(ButtonStyle.Primary).setEmoji('🏹').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_MC_${partyId}`).setLabel('MC').setStyle(ButtonStyle.Primary).setEmoji('🪓').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_SM_${partyId}`).setLabel('SM').setStyle(ButtonStyle.Primary).setEmoji('💥').setDisabled(isClosed)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec_role_MT_${partyId}`).setLabel('MT').setStyle(ButtonStyle.Primary).setEmoji('🛡️').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_ICE STACKING_${partyId}`).setLabel('Ice Stack').setStyle(ButtonStyle.Primary).setEmoji('❄️').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_ARCHER_${partyId}`).setLabel('Archer').setStyle(ButtonStyle.Primary).setEmoji('🎯').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_role_DPS_${partyId}`).setLabel('DPS').setStyle(ButtonStyle.Primary).setEmoji('⚔️').setDisabled(isClosed)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec_cancel_role_${partyId}`).setLabel('Cancel My Role').setStyle(ButtonStyle.Secondary).setDisabled(isClosed)
    );

    const lockLabel = party.status === 'Locked' ? 'Unlock Party' : 'Lock Party';
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec_lock_${partyId}`).setLabel(lockLabel).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_remove_member_${partyId}`).setLabel('Remove Member').setStyle(ButtonStyle.Danger).setEmoji('⛔').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_done_${partyId}`).setLabel('Done').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_cancel_run_${partyId}`).setLabel('Cancel Run').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setDisabled(isClosed)
    );

    const row5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec_edit_title_${partyId}`).setLabel('Edit Title').setStyle(ButtonStyle.Secondary).setEmoji('✏️').setDisabled(isClosed),
        new ButtonBuilder().setCustomId(`rec_notify_${partyId}`).setLabel('Notify Again').setStyle(ButtonStyle.Primary).setEmoji('📣').setDisabled(isClosed)
    );

    return { content: '@here', embeds: [embed], components: [row1, row2, row3, row4, row5], allowedMentions: { parse: ['everyone'] } };
}

// ==========================================
// 2. RENDER FUNCTION: SALARY PANEL
// ==========================================
async function renderSalaryPanel(partyId, isClosed = false) {
    const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
    const items = db.prepare('SELECT * FROM items WHERE party_id = ?').all(partyId);
    const loans = db.prepare('SELECT * FROM stamp_loans WHERE party_id = ?').all(partyId);
    const drops = db.prepare('SELECT * FROM gold_drops WHERE party_id = ?').all(partyId);
    const recipients = db.prepare('SELECT * FROM salary_recipients WHERE party_id = ?').all(partyId);
    const paidUsers = db.prepare('SELECT user_id FROM salary_paid_users WHERE party_id = ?').all(partyId).map(p => p.user_id);

    let totalStampGold = 0;
    let loanText = loans.length > 0 ? '' : '*(kosong)*';
    loans.forEach(l => {
        const cost = l.stamps * l.cost_per_stamp;
        totalStampGold += cost;
        loanText += `• ${formatUser(l.user_id)} — ${l.stamps} stamp (${cost}g)\n`;
    });

    let sudahLakuText = '';
    let belumLakuText = '';
    let totalItemGold = 0;

    items.forEach(i => {
        if (i.is_sold) {
            sudahLakuText += `• ${i.qty}x ${i.name} — **${i.price}g**\n`;
            totalItemGold += i.price;
        } else {
            belumLakuText += `• ${i.qty}x ${i.name}\n`;
        }
    });

    if (!sudahLakuText) sudahLakuText = '*(kosong)*';
    if (!belumLakuText) belumLakuText = '*(kosong)*';

    let dropText = '';
    let totalDropGold = 0;
    drops.forEach(d => {
        totalDropGold += d.amount;
        dropText += `• ${d.amount}g (${d.note || 'Drop Raid'})\n`;
    });
    if (!dropText) dropText = '*(kosong)*';

    const grandTotal = totalItemGold + totalDropGold;
    const feePajak = Math.floor(grandTotal * 0.02);
    const yangDibagikan = grandTotal - totalStampGold - feePajak;

    const gajiPokok = Math.floor(yangDibagikan / 8);

    const allUserIdsSet = new Set();
    loans.forEach(l => allUserIdsSet.add(l.user_id));
    recipients.forEach(r => allUserIdsSet.add(r.user_id));

    const cappedUserIds = Array.from(allUserIdsSet).slice(0, 8);

    let statusGajiText = `💡 **Gaji Pokok:** **${gajiPokok}g** / player (dari ${yangDibagikan}g ÷ 8 player)\n\n`;

    if (cappedUserIds.length > 0) {
        cappedUserIds.forEach(userId => {
            const userLoans = loans.filter(l => l.user_id === userId);
            let stampRefund = 0;
            userLoans.forEach(l => {
                stampRefund += (l.stamps * l.cost_per_stamp);
            });

            const totalGajiUser = gajiPokok + stampRefund;
            const detailText = stampRefund > 0 ? ` *(termasuk stamp loan +${stampRefund}g)*` : '';

            const statusEmoji = paidUsers.includes(userId) ? '✅' : '❌';

            statusGajiText += `${statusEmoji} ${formatUser(userId)} — **${totalGajiUser}g**${detailText}\n`;
        });
    } else {
        statusGajiText += '*(Belum ada player di-tag)*';
    }

    let hostDescription = `**Host:** <@${party.host_id}>`;
    if (party.co_host_id) {
        hostDescription += `\n**Co-Host:** <@${party.co_host_id}>`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`💰 Salary — ${party.title}`)
        .setColor(isClosed || party.status === 'CLOSED' ? 0x2b2d31 : 0x00FF7F)
        .setDescription(hostDescription)
        .addFields(
            { name: '📋 Sealstamp Loan', value: loanText, inline: false },
            { name: '✅ Sudah Laku', value: sudahLakuText, inline: false },
            { name: '⏳ Belum Laku', value: belumLakuText, inline: false },
            { name: '🪙 Gold Drops', value: dropText, inline: false },
            { 
                name: '📊 Summary', 
                value: `Total: **${grandTotal}g**\nDikurangi Sealstamp: **${totalStampGold}g**\nTotal Fee (2.0%): **${feePajak}g**\nYang Dibagikan: **${yangDibagikan}g**`,
                inline: false 
            },
            { name: '💳 Status Gaji', value: statusGajiText, inline: false }
        )
        .setFooter({ text: `Run ID: ${party.id} | Status: ${isClosed || party.status === 'CLOSED' ? 'CLOSED 🔒' : 'OPEN'}` });

    if (isClosed || party.status === 'CLOSED') {
        return { embeds: [embed], components: [] };
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sal_add_item_${partyId}`).setLabel('Set Harga Item').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`sal_change_item_status_${partyId}`).setLabel('Change Status Item').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`sal_delete_item_${partyId}`).setLabel('Delete Item').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sal_add_gold_${partyId}`).setLabel('Add Gold Drop').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sal_stamp_loan_${partyId}`).setLabel('Catat Sealstamp Loan').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`sal_remove_stamp_${partyId}`).setLabel('Remove Stamp Loan').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sal_set_cohost_${partyId}`).setLabel('Set Co-Host').setStyle(ButtonStyle.Secondary).setEmoji('👑'),
        new ButtonBuilder().setCustomId(`sal_mark_paid_${partyId}`).setLabel('Mark Paid').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sal_close_panel_${partyId}`).setLabel('Close Panel').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ==========================================
// 3. MAIN INTERACTION HANDLER
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        // A. COMMANDS HANDLING
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'createparty') {
                const title = interaction.options.getString('title');

                const stmt = db.prepare('INSERT INTO party_recruits (guild_id, channel_id, title, host_id) VALUES (?, ?, ?, ?)');
                const info = stmt.run(interaction.guildId, interaction.channelId, title, interaction.user.id);
                const partyId = info.lastInsertRowid;

                const insertSlot = db.prepare('INSERT INTO party_recruit_slots (party_id, role_code, slot_index) VALUES (?, ?, ?)');
                DEFAULT_ROLES.forEach(r => {
                    for (let i = 1; i <= r.slots; i++) {
                        insertSlot.run(partyId, r.code, i);
                    }
                });

                const panelData = await renderRecruitPanel(partyId);
                await interaction.reply({ ...panelData, allowedMentions: { parse: ['everyone'] } });
                const msg = await interaction.fetchReply();

                db.prepare('UPDATE party_recruits SET message_id = ? WHERE id = ?').run(msg.id, partyId);
            }

            if (interaction.commandName === 'set-salary') {
                const title = interaction.options.getString('title');

                if (interaction.channel.isThread()) {
                    const parentMsg = await interaction.channel.fetchStarterMessage().catch(() => null);
                    if (parentMsg) {
                        const recruitParty = db.prepare('SELECT * FROM party_recruits WHERE message_id = ?').get(parentMsg.id);
                        if (recruitParty && recruitParty.host_id !== interaction.user.id) {
                            return interaction.reply({ 
                                content: `❌ Hanya Host (<@${recruitParty.host_id}>) yang berhak membuat Salary Panel untuk party ini!`, 
                                flags: MessageFlags.Ephemeral 
                            });
                        }
                    }
                }

                const stmt = db.prepare('INSERT INTO parties (guild_id, channel_id, title, host_id) VALUES (?, ?, ?, ?)');
                const info = stmt.run(interaction.guildId, interaction.channelId, title, interaction.user.id);
                const partyId = info.lastInsertRowid;

                const panelData = await renderSalaryPanel(partyId);
                await interaction.reply(panelData);
                const msg = await interaction.fetchReply();

                db.prepare('UPDATE parties SET message_id = ? WHERE id = ?').run(msg.id, partyId);
            }
        }

        // B. BUTTON INTERACTIONS
        if (interaction.isButton()) {
            const id = interaction.customId;

            // --- HANDLER RECRUITMENT BUTTONS ---
            if (id.startsWith('rec_')) {
                if (id.startsWith('rec_role_')) {
                    const parts = id.split('_');
                    const roleCode = parts[2];
                    const partyId = parseInt(parts[3]);

                    const party = db.prepare('SELECT * FROM party_recruits WHERE id = ?').get(partyId);
                    if (!party || party.status === 'Done' || party.status === 'Cancelled') {
                        return interaction.reply({ content: '🔒 Party ini sudah selesai atau dibatalkan.', flags: MessageFlags.Ephemeral });
                    }

                    if (party.status === 'Locked') {
                        return interaction.reply({ content: '🔒 Party sedang dikunci oleh Host.', flags: MessageFlags.Ephemeral });
                    }

                    const allSlots = db.prepare('SELECT * FROM party_recruit_slots WHERE party_id = ?').all(partyId);
                    const existingUserSlot = allSlots.find(s => s.user_id === interaction.user.id);
                    const uniqueFilled = new Set(allSlots.filter(s => s.user_id !== null).map(s => s.user_id));

                    if (!existingUserSlot && uniqueFilled.size >= 8) {
                        return interaction.reply({ content: '❌ Party sudah penuh (8/8 Player)!', flags: MessageFlags.Ephemeral });
                    }

                    const availableSlot = allSlots.find(s => s.role_code === roleCode && s.user_id === null);
                    if (!availableSlot && (!existingUserSlot || existingUserSlot.role_code !== roleCode)) {
                        return interaction.reply({ content: `❌ Slot role **${roleCode}** sudah penuh!`, flags: MessageFlags.Ephemeral });
                    }

                    if (existingUserSlot) {
                        db.prepare('UPDATE party_recruit_slots SET user_id = NULL WHERE id = ?').run(existingUserSlot.id);
                    }

                    db.prepare('UPDATE party_recruit_slots SET user_id = ? WHERE id = ?').run(interaction.user.id, availableSlot.id);

                    const panelData = await renderRecruitPanel(partyId);
                    return await interaction.update(panelData);
                }

                if (id.startsWith('rec_cancel_role_')) {
                    const partyId = parseInt(id.split('_')[3]);
                    db.prepare('UPDATE party_recruit_slots SET user_id = NULL WHERE party_id = ? AND user_id = ?').run(partyId, interaction.user.id);

                    const panelData = await renderRecruitPanel(partyId);
                    return await interaction.update(panelData);
                }

                const partyId = parseInt(id.split('_')[id.split('_').length - 1]);
                const party = db.prepare('SELECT * FROM party_recruits WHERE id = ?').get(partyId);

                if (!party) return;

                const isHostOrCoHost = (interaction.user.id === party.host_id) || (party.co_host_id && interaction.user.id === party.co_host_id);
                if (!isHostOrCoHost) {
                    return interaction.reply({ content: `❌ Hanya Host (<@${party.host_id}>) atau Co-Host yang dapat mengatur panel ini.`, flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('rec_lock_')) {
                    const newStatus = party.status === 'Locked' ? 'Open' : 'Locked';
                    db.prepare('UPDATE party_recruits SET status = ? WHERE id = ?').run(newStatus, partyId);
                    const panelData = await renderRecruitPanel(partyId);
                    return await interaction.update(panelData);
                }

                if (id.startsWith('rec_remove_member_')) {
                    const slots = db.prepare('SELECT DISTINCT user_id FROM party_recruit_slots WHERE party_id = ? AND user_id IS NOT NULL').all(partyId);
                    if (slots.length === 0) {
                        return interaction.reply({ content: '❌ Belum ada member yang join party.', flags: MessageFlags.Ephemeral });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_rec_kick_${partyId}`)
                        .setPlaceholder('Pilih member yang ingin dikeluarkan...');

                    for (const s of slots) {
                        let displayName = `User ID: ${s.user_id}`;
                        try {
                            const member = await interaction.guild.members.fetch(s.user_id);
                            displayName = member.displayName || member.user.username;
                        } catch (e) {}

                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(displayName)
                                .setValue(s.user_id)
                        );
                    }

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return interaction.reply({ content: '⛔ **Pilih member untuk dikeluarkan dari party:**', components: [row], flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('rec_done_')) {
                    db.prepare("UPDATE party_recruits SET status = 'Done' WHERE id = ?").run(partyId);

                    const slots = db.prepare('SELECT DISTINCT user_id FROM party_recruit_slots WHERE party_id = ? AND user_id IS NOT NULL').all(partyId);
                    const memberMentions = slots.map(s => `<@${s.user_id}>`).join(' ');

                    try {
                        let thread = interaction.message.thread;
                        if (!thread) {
                            thread = await interaction.message.startThread({
                                name: `Party ${party.title} - Members`,
                                autoArchiveDuration: 1440,
                                reason: 'Party Selesai - Membuat Thread Roster Member & Salary'
                            });
                        }

                        if (slots.length > 0) {
                            await thread.send(`🎉 **Party ${party.title} Selesai!**\n\n**Daftar Member:**\n${memberMentions}`);
                        } else {
                            await thread.send(`🎉 **Party ${party.title} Selesai!** *(Belum ada member yang mendaftar)*.`);
                        }

                        const stmtSal = db.prepare('INSERT INTO parties (guild_id, channel_id, title, host_id, co_host_id) VALUES (?, ?, ?, ?, ?)');
                        const salInfo = stmtSal.run(interaction.guildId, thread.id, party.title, party.host_id, party.co_host_id);
                        const salPartyId = salInfo.lastInsertRowid;

                        const insertRecipient = db.prepare('INSERT INTO salary_recipients (party_id, user_id) VALUES (?, ?)');
                        slots.forEach(s => {
                            insertRecipient.run(salPartyId, s.user_id);
                        });

                        const salPanelData = await renderSalaryPanel(salPartyId);
                        const salMsg = await thread.send(salPanelData);

                        db.prepare('UPDATE parties SET message_id = ? WHERE id = ?').run(salMsg.id, salPartyId);

                    } catch (threadErr) {
                        console.error('Gagal membuat thread / salary panel:', threadErr);
                    }

                    const panelData = await renderRecruitPanel(partyId);
                    return await interaction.update(panelData);
                }

                if (id.startsWith('rec_cancel_run_')) {
                    db.prepare("UPDATE party_recruits SET status = 'Cancelled' WHERE id = ?").run(partyId);
                    const panelData = await renderRecruitPanel(partyId);
                    return await interaction.update(panelData);
                }

                if (id.startsWith('rec_edit_title_')) {
                    const modal = new ModalBuilder().setCustomId(`modal_rec_edit_title_${partyId}`).setTitle('Edit Title Party');
                    const input = new TextInputBuilder().setCustomId('title_input').setLabel('Judul Party Baru').setStyle(TextInputStyle.Short).setValue(party.title).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (id.startsWith('rec_notify_')) {
                    await interaction.reply({ 
                        content: `@here Panggilan party **${party.title}**! Silakan klik tombol role untuk join.`, 
                        allowedMentions: { parse: ['everyone'] }
                    });
                }
            }

            // --- HANDLER SALARY PANEL BUTTONS ---
            if (id.startsWith('sal_')) {
                const partyId = parseInt(id.split('_')[id.split('_').length - 1]);
                const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);

                if (!party || party.status === 'CLOSED') {
                    return interaction.reply({ content: '🔒 Sesi party ini sudah ditutup.', flags: MessageFlags.Ephemeral });
                }

                const isHostOrCoHost = (interaction.user.id === party.host_id) || (party.co_host_id && interaction.user.id === party.co_host_id);
                if (!isHostOrCoHost) {
                    return interaction.reply({ content: `❌ Hanya Host (<@${party.host_id}>) atau Co-Host yang dapat mengatur panel ini.`, flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('sal_add_item_')) {
                    const modal = new ModalBuilder().setCustomId(`modal_sal_item_${partyId}`).setTitle('Tambah / Set Harga Item');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel('Nama Item Loot').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_qty').setLabel('Jumlah (Qty)').setStyle(TextInputStyle.Short).setValue('1').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_price').setLabel('Harga Gold (Isi 0 Jika Belum Laku)').setStyle(TextInputStyle.Short).setValue('0').setRequired(false))
                    );
                    return interaction.showModal(modal);
                }

                if (id.startsWith('sal_change_item_status_')) {
                    const modal = new ModalBuilder().setCustomId(`modal_sal_markpaid_${partyId}`).setTitle('Change Status Item (Set Laku)');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel('Nama Item yang Belum Laku').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_price').setLabel('Harga Penjualan (Gold)').setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return interaction.showModal(modal);
                }

                if (id.startsWith('sal_delete_item_')) {
                    const items = db.prepare('SELECT * FROM items WHERE party_id = ?').all(partyId);

                    if (items.length === 0) {
                        return interaction.reply({ content: '❌ Tidak ada item di panel gaji untuk dihapus.', flags: MessageFlags.Ephemeral });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_sal_delete_item_${partyId}`)
                        .setPlaceholder('Pilih item yang ingin dihapus...');

                    items.forEach(i => {
                        const statusText = i.is_sold ? `Sudah Laku (${i.price}g)` : 'Belum Laku';
                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${i.qty}x ${i.name}`)
                                .setValue(`${i.id}`)
                                .setDescription(`Status: ${statusText}`)
                        );
                    });

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return interaction.reply({ content: '🗑️ **Pilih item yang ingin dihapus dari panel gaji:**', components: [row], flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('sal_add_gold_')) {
                    const modal = new ModalBuilder().setCustomId(`modal_sal_addgold_${partyId}`).setTitle('Tambah Gold Drop');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gold_amount').setLabel('Jumlah Gold').setStyle(TextInputStyle.Short).setRequired(true)));
                    return interaction.showModal(modal);
                }

                if (id.startsWith('sal_stamp_loan_')) {
                    const modal = new ModalBuilder().setCustomId(`modal_sal_stamp_${partyId}`).setTitle('Catat Pinjaman Stamp');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('Nickname / Tag / User ID Player').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stamp_count').setLabel('Jumlah Stamp (1 Stamp = 5g)').setStyle(TextInputStyle.Short).setValue('1').setRequired(true))
                    );
                    return interaction.showModal(modal);
                }

                if (id.startsWith('sal_remove_stamp_')) {
                    const loans = db.prepare('SELECT * FROM stamp_loans WHERE party_id = ?').all(partyId);

                    if (loans.length === 0) {
                        return interaction.reply({ content: '❌ Tidak ada catatan Sealstamp Loan untuk dihapus.', flags: MessageFlags.Ephemeral });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_sal_delete_stamp_${partyId}`)
                        .setPlaceholder('Pilih catatan stamp loan yang ingin dihapus...');

                    for (const l of loans) {
                        const cost = l.stamps * l.cost_per_stamp;
                        let displayName = l.user_id.replace(/^<@!?|>$/g, '');
                        const cleanDigits = displayName.replace(/\D/g, '');

                        if (/^\d+$/.test(cleanDigits) && interaction.guild) {
                            try {
                                const member = await interaction.guild.members.fetch(cleanDigits);
                                displayName = member.displayName || member.user.username;
                            } catch (e) {}
                        }

                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(displayName)
                                .setValue(`${l.id}`)
                                .setDescription(`${l.stamps} stamp (${cost}g)`)
                        );
                    }

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return interaction.reply({ content: '🗑️ Pilih catatan Sealstamp Loan yang ingin dihapus:', components: [row], flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('sal_set_cohost_')) {
                    const loans = db.prepare('SELECT user_id FROM stamp_loans WHERE party_id = ?').all(partyId);
                    const recipients = db.prepare('SELECT user_id FROM salary_recipients WHERE party_id = ?').all(partyId);
                    const allUserIdsSet = new Set([...loans.map(l => l.user_id), ...recipients.map(r => r.user_id)]);
                    const cappedUserIds = Array.from(allUserIdsSet).slice(0, 8);

                    if (cappedUserIds.length === 0) {
                        return interaction.reply({ content: '❌ Belum ada member di Status Gaji.', flags: MessageFlags.Ephemeral });
                    }

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_sal_set_cohost_${partyId}`)
                        .setPlaceholder('Pilih member party untuk dijadikan Co-Host...');

                    for (const uId of cappedUserIds) {
                        let displayName = `User: ${uId.replace(/^<@!?|>$/g, '')}`;
                        const cleanDigits = uId.replace(/[<@!>]/g, '');
                        if (/^\d+$/.test(cleanDigits) && interaction.guild) {
                            try {
                                const member = await interaction.guild.members.fetch(cleanDigits);
                                displayName = member.displayName || member.user.username;
                            } catch (e) {}
                        }

                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(displayName)
                                .setValue(uId)
                        );
                    }

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return interaction.reply({ content: '👑 **Pilih member dari party untuk dijadikan Co-Host:**', components: [row], flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('sal_mark_paid_')) {
                    const loans = db.prepare('SELECT user_id FROM stamp_loans WHERE party_id = ?').all(partyId);
                    const recipients = db.prepare('SELECT user_id FROM salary_recipients WHERE party_id = ?').all(partyId);
                    const allUserIdsSet = new Set([...loans.map(l => l.user_id), ...recipients.map(r => r.user_id)]);
                    const cappedUserIds = Array.from(allUserIdsSet).slice(0, 8);

                    if (cappedUserIds.length === 0) {
                        return interaction.reply({ content: '❌ Belum ada player di Status Gaji.', flags: MessageFlags.Ephemeral });
                    }

                    const paidUsers = db.prepare('SELECT user_id FROM salary_paid_users WHERE party_id = ?').all(partyId).map(p => p.user_id);

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_sal_toggle_paid_${partyId}`)
                        .setPlaceholder('Pilih player (bisa pilih banyak sekaligus)...')
                        .setMinValues(1)
                        .setMaxValues(cappedUserIds.length);

                    for (const uId of cappedUserIds) {
                        let displayName = `User: ${uId.replace(/^<@!?|>$/g, '')}`;
                        const cleanDigits = uId.replace(/[<@!>]/g, '');
                        if (/^\d+$/.test(cleanDigits) && interaction.guild) {
                            try {
                                const member = await interaction.guild.members.fetch(cleanDigits);
                                displayName = member.displayName || member.user.username;
                            } catch (e) {}
                        }

                        const isPaid = paidUsers.includes(uId);
                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(displayName)
                                .setValue(uId)
                                .setDescription(`Status saat ini: ${isPaid ? 'Sudah Dibayar (✅)' : 'Belum Dibayar (❌)'}`)
                        );
                    }

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return interaction.reply({ content: '💳 **Pilih player (bisa lebih dari satu) untuk diubah status pembayaran gajinya:**', components: [row], flags: MessageFlags.Ephemeral });
                }

                if (id.startsWith('sal_close_panel_')) {
                    db.prepare("UPDATE parties SET status = 'CLOSED' WHERE id = ?").run(partyId);

                    const closedPayload = await renderSalaryPanel(partyId, true);
                    await interaction.update(closedPayload);

                    try {
                        let targetThread = null;
                        if (interaction.channel.isThread()) {
                            targetThread = interaction.channel;
                        } else if (interaction.message.thread) {
                            targetThread = interaction.message.thread;
                        }

                        if (targetThread) {
                            await targetThread.setArchived(true, 'Salary Panel Closed by Host');
                        }
                    } catch (threadErr) {
                        console.error('Gagal menutup thread:', threadErr);
                    }
                }
            }
        }

        // C. SELECT MENU HANDLERS
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('select_rec_kick_')) {
                const partyId = parseInt(interaction.customId.split('_')[3]);
                const targetUserId = interaction.values[0];

                db.prepare('UPDATE party_recruit_slots SET user_id = NULL WHERE party_id = ? AND user_id = ?').run(partyId, targetUserId);

                const party = db.prepare('SELECT * FROM party_recruits WHERE id = ?').get(partyId);
                const channel = await client.channels.fetch(party.channel_id);
                const message = await channel.messages.fetch(party.message_id);

                const updatedPanel = await renderRecruitPanel(partyId);
                await message.edit(updatedPanel);

                return interaction.update({ content: `✅ <@${targetUserId}> telah dikeluarkan dari party.`, components: [] });
            }

            if (interaction.customId.startsWith('select_sal_set_cohost_')) {
                const partyId = parseInt(interaction.customId.split('_')[4]);
                const selectedCoHost = interaction.values[0];

                db.prepare('UPDATE parties SET co_host_id = ? WHERE id = ?').run(selectedCoHost, partyId);

                const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
                const channel = await client.channels.fetch(party.channel_id);
                const message = await channel.messages.fetch(party.message_id);

                const updatedPanel = await renderSalaryPanel(partyId);
                await message.edit(updatedPanel);

                return interaction.update({ content: `👑 <@${selectedCoHost}> telah dipilih menjadi **Co-Host** panel gaji!`, components: [] });
            }

            if (interaction.customId.startsWith('select_sal_delete_stamp_')) {
                const partyId = parseInt(interaction.customId.split('_')[4]);
                const loanId = parseInt(interaction.values[0]);

                db.prepare('DELETE FROM stamp_loans WHERE id = ?').run(loanId);

                const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
                const channel = await client.channels.fetch(party.channel_id);
                const message = await channel.messages.fetch(party.message_id);

                const updatedPanel = await renderSalaryPanel(partyId);
                await message.edit(updatedPanel);

                return interaction.update({ content: '✅ Catatan Sealstamp Loan berhasil dihapus!', components: [] });
            }

            if (interaction.customId.startsWith('select_sal_delete_item_')) {
                const partyId = parseInt(interaction.customId.split('_')[4]);
                const itemId = parseInt(interaction.values[0]);

                const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
                db.prepare('DELETE FROM items WHERE id = ?').run(itemId);

                const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
                const channel = await client.channels.fetch(party.channel_id);
                const message = await channel.messages.fetch(party.message_id);

                const updatedPanel = await renderSalaryPanel(partyId);
                await message.edit(updatedPanel);

                return interaction.update({ content: `✅ Item **${item ? item.name : ''}** berhasil dihapus dari panel gaji!`, components: [] });
            }

            if (interaction.customId.startsWith('select_sal_toggle_paid_')) {
                const partyId = parseInt(interaction.customId.split('_')[4]);
                const selectedUserIds = interaction.values;

                selectedUserIds.forEach(targetUserId => {
                    const existing = db.prepare('SELECT * FROM salary_paid_users WHERE party_id = ? AND user_id = ?').get(partyId, targetUserId);

                    if (existing) {
                        db.prepare('DELETE FROM salary_paid_users WHERE id = ?').run(existing.id);
                    } else {
                        db.prepare('INSERT INTO salary_paid_users (party_id, user_id) VALUES (?, ?)').run(partyId, targetUserId);
                    }
                });

                const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
                const channel = await client.channels.fetch(party.channel_id);
                const message = await channel.messages.fetch(party.message_id);

                const updatedPanel = await renderSalaryPanel(partyId);
                await message.edit(updatedPanel);

                return interaction.update({ content: `✅ Status pembayaran gaji untuk **${selectedUserIds.length} player** yang dipilih telah diperbarui!`, components: [] });
            }
        }

        // D. MODAL SUBMIT HANDLERS
        if (interaction.isModalSubmit()) {
            const id = interaction.customId;

            if (id.startsWith('modal_rec_edit_title_')) {
                const partyId = parseInt(id.split('_')[4]);
                const newTitle = interaction.fields.getTextInputValue('title_input');

                db.prepare('UPDATE party_recruits SET title = ? WHERE id = ?').run(newTitle, partyId);
                const panelData = await renderRecruitPanel(partyId);
                return await interaction.update(panelData);
            }

            if (id.startsWith('modal_sal_item_')) {
                const partyId = parseInt(id.split('_')[3]);
                const name = interaction.fields.getTextInputValue('item_name');
                const qty = parseInt(interaction.fields.getTextInputValue('item_qty')) || 1;
                const price = parseInt(interaction.fields.getTextInputValue('item_price')) || 0;
                const isSold = price > 0 ? 1 : 0;

                db.prepare('INSERT INTO items (party_id, name, qty, price, is_sold) VALUES (?, ?, ?, ?, ?)').run(partyId, name, qty, price, isSold);
                const panelData = await renderSalaryPanel(partyId);
                await interaction.update(panelData);
            }

            if (id.startsWith('modal_sal_markpaid_')) {
                const partyId = parseInt(id.split('_')[3]);
                const name = interaction.fields.getTextInputValue('item_name');
                const price = parseInt(interaction.fields.getTextInputValue('item_price')) || 0;

                const existing = db.prepare('SELECT * FROM items WHERE party_id = ? AND LOWER(name) LIKE LOWER(?) AND is_sold = 0').get(partyId, `%${name}%`);
                if (existing) {
                    db.prepare('UPDATE items SET price = ?, is_sold = 1 WHERE id = ?').run(price, existing.id);
                    const panelData = await renderSalaryPanel(partyId);
                    await interaction.update(panelData);
                } else {
                    return interaction.reply({ 
                        content: `❌ Item dengan nama "${name}" tidak ditemukan di daftar **Belum Laku** (atau item tersebut sudah berstatus Laku).`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            }

            if (id.startsWith('modal_sal_addgold_')) {
                const partyId = parseInt(id.split('_')[3]);
                const amount = parseInt(interaction.fields.getTextInputValue('gold_amount')) || 0;

                db.prepare('INSERT INTO gold_drops (party_id, amount, note) VALUES (?, ?, ?)').run(partyId, amount, 'Drop Raid');
                const panelData = await renderSalaryPanel(partyId);
                await interaction.update(panelData);
            }

            if (id.startsWith('modal_sal_stamp_')) {
                const partyId = parseInt(id.split('_')[3]);
                let inputUser = interaction.fields.getTextInputValue('user_id').trim();
                const stamps = parseInt(interaction.fields.getTextInputValue('stamp_count')) || 1;

                let resolvedUserId = inputUser;
                const cleanDigits = inputUser.replace(/[<@!>]/g, '');
                if (/^\d+$/.test(cleanDigits)) {
                    resolvedUserId = cleanDigits;
                } else if (interaction.guild) {
                    const searchQuery = inputUser.replace(/^@/, '');
                    try {
                        const fetchedMembers = await interaction.guild.members.fetch({ query: searchQuery, limit: 1 });
                        const foundMember = fetchedMembers.first();
                        if (foundMember) resolvedUserId = foundMember.user.id;
                    } catch (e) {}
                }

                db.prepare('INSERT INTO stamp_loans (party_id, user_id, stamps, cost_per_stamp) VALUES (?, ?, ?, ?)').run(partyId, resolvedUserId, stamps, 5);
                const panelData = await renderSalaryPanel(partyId);
                await interaction.update(panelData);
            }
        }
    } catch (err) {
        console.error('Error handling interaction:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);