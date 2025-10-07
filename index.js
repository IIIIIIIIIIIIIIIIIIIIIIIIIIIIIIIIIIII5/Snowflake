const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const roblox = require('./roblox');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.PendingApprovals = roblox.PendingApprovals;

const commandFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !['index.js','roblox.js'].includes(f));
for (const file of commandFiles) {
  const cmd = require(path.join(__dirname, file));
  if (cmd && cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  const commandsPayload = Array.from(client.commands.values()).map(c => c.data.toJSON());

  await client.guilds.fetch();

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commandsPayload });
      console.log(`Commands registered for guild ${guildId}`);
    } catch (err) {
      console.error(`Failed to register commands for ${guildId}:`, err.message);
    }
  }

  console.log('All guild commands synced.');
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId === 'done_verification') {
    return roblox.handleVerificationButton(interaction);
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error('Command error:', err);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    else await interaction.editReply({ content: `Error: ${err.message}` });
  }
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith('!')) return;
  if (message.author.id !== process.env.ADMIN_ID) return;

  const parts = message.content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const db = await roblox.GetJsonBin();

  if (cmd === '!accept' || cmd === '!decline') {
    const groupId = parts[1];
    if (!groupId || !roblox.PendingApprovals[groupId]) return message.reply('Invalid or unknown group ID.');
    const { requesterId } = roblox.PendingApprovals[groupId];
    if (cmd === '!accept') {
      try { await client.users.send(requesterId, `Your group config (ID: ${groupId}) has been accepted.`); } catch {}
      delete roblox.PendingApprovals[groupId];
      return message.channel.send(`Accepted group ${groupId} and notified <@${requesterId}>`);
    } else {
      try { await client.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`); } catch {}
      delete roblox.PendingApprovals[groupId];
      return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`);
    }
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1];
    const customToken = parts[2];
    if (!targetServerId || !customToken) return message.reply('Usage: !setbottoken <serverid> <token>');
    db.CustomTokens = db.CustomTokens || {};
    db.CustomTokens[targetServerId] = customToken;
    await roblox.SaveJsonBin(db);
    return message.channel.send(`Custom Roblox token set for server ID ${targetServerId}.`);
  }
});

client.login(BOT_TOKEN);
