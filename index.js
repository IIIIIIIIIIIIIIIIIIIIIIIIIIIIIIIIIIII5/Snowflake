const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const Roblox = require('./roblox');

const BotToken = process.env.BOT_TOKEN;
const ClientId = process.env.CLIENT_ID;
const AdminId = process.env.ADMIN_ID;

const ClientBot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

ClientBot.Commands = new Collection();
ClientBot.PendingApprovals = Roblox.PendingApprovals;
ClientBot.botActive = true;

function GetCommandFiles(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files.push(...GetCommandFiles(full));
    else if (f.endsWith('.js')) files.push(full);
  }
  return Array.from(new Set(files.map(f => path.resolve(f))));
}

const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'));
for (const file of CommandFiles) {
  delete require.cache[require.resolve(file)];
  const cmd = require(file);
  if (cmd && cmd.data && cmd.execute) ClientBot.Commands.set(cmd.data.name, cmd);
}

async function RefreshGlobalCommands() {
  const rest = new REST({ version: '10' }).setToken(BotToken);
  const payload = Array.from(ClientBot.Commands.values()).map(c => c.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(ClientId), { body: payload });
    console.log(`Registered ${payload.length} global commands.`);
  } catch (err) {
    console.error('Failed to register global commands:', err.message);
  }
}

ClientBot.once('clientReady', async () => {
  console.log(`Logged in as ${ClientBot.user.tag}`);
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });
  await RefreshGlobalCommands();
  console.log('All global commands synced.');
});

ClientBot.on('interactionCreate', async interaction => {
  if (!ClientBot.botActive) return;
  if (interaction.isButton() && interaction.customId === 'done_verification') return Roblox.HandleVerificationButton(interaction);
  if (!interaction.isChatInputCommand()) return;
  const cmd = ClientBot.Commands.get(interaction.commandName);
  if (!cmd) return;
  try { await cmd.execute(interaction, ClientBot); } 
  catch (err) { 
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'An error occurred.', ephemeral: true }); 
    else await interaction.editReply({ content: `Error: ${err.message}` }); 
  }
});

ClientBot.on('messageCreate', async message => {
  if (!ClientBot.botActive) return;
  if (!message.content.startsWith('!')) return;
  if (message.author.id !== AdminId) return;

  const parts = message.content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const db = await Roblox.GetJsonBin();

  if (cmd === '!accept' || cmd === '!decline') {
    const groupId = parts[1];
    if (!groupId || !Roblox.PendingApprovals[groupId]) return message.reply('Invalid or unknown group ID.');
    const { requesterId } = Roblox.PendingApprovals[groupId];
    if (cmd === '!accept') { try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been accepted.`); } catch {} delete Roblox.PendingApprovals[groupId]; return message.channel.send(`Accepted group ${groupId} and notified <@${requesterId}>`); }
    else { try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`); } catch {} delete Roblox.PendingApprovals[groupId]; return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`); }
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1];
    const customToken = parts[2];
    if (!targetServerId || !customToken) return message.reply('Usage: !setbottoken <serverid> <token>');
    db.CustomTokens = db.CustomTokens || {};
    db.CustomTokens[targetServerId] = customToken;
    await Roblox.SaveJsonBin(db);
    return message.channel.send(`Custom Roblox token set for server ID ${targetServerId}.`);
  }
});

ClientBot.login(BotToken);
