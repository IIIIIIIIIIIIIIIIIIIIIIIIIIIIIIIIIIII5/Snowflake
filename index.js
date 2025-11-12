const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const Roblox = require('./roblox');
const { StartApi } = require('./api');
const loaCommand = require('./commands/loa.js');

const BotToken = process.env.BOT_TOKEN;
const ClientId = process.env.CLIENT_ID;
const AdminId = process.env.ADMIN_ID;
const TestGuildId = '1386275140815425557';

const ClientBot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

ClientBot.Commands = new Collection();
ClientBot.PendingApprovals = Roblox.PendingApprovals;

function GetCommandFiles(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files.push(...GetCommandFiles(full));
    else if (f.endsWith('.js')) files.push(full);
  }
  return files;
}

const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'));
for (const file of CommandFiles) {
  try {
    delete require.cache[require.resolve(file)];
    const cmd = require(file);
    if (cmd && cmd.data && cmd.execute) ClientBot.Commands.set(cmd.data.name, cmd);
  } catch {}
}

async function RefreshCommands() {
  const rest = new REST({ version: '10' }).setToken(BotToken);
  const payload = Array.from(ClientBot.Commands.values()).map(c => c.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(ClientId), { body: payload });
  } catch {}
}

global.ClientBot = ClientBot;

ClientBot.once('ready', async () => {
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });
  await RefreshCommands();
  StartApi();

  loaCommand.StartAutoCheck(ClientBot);
});

ClientBot.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const command = ClientBot.Commands.get(interaction.commandName);
    if (command?.autocomplete) return command.autocomplete(interaction);
  }
  if (interaction.isButton() && interaction.customId === 'done_verification')
    return Roblox.HandleVerificationButton(interaction);
  if (!interaction.isChatInputCommand()) return;
  const cmd = ClientBot.Commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction, ClientBot);
  } catch {
    if (!interaction.replied && !interaction.deferred)
      await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
  }
});

ClientBot.on('messageCreate', async message => {
  if (!message.content.startsWith('!')) return;
  if (message.author.id !== AdminId && message.author.id !== '804292216511791204') return;

  const parts = message.content.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  const db = await Roblox.GetJsonBin();
  db.Trainings = db.Trainings || {};

  if (cmd === '!accept' || cmd === '!decline') {
    const groupId = parts[1];
    if (!groupId || !Roblox.PendingApprovals[groupId]) return message.reply('Invalid group ID or no pending approval.');
    const { requesterId } = Roblox.PendingApprovals[groupId];
    if (cmd === '!accept') {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been accepted.`); } catch {}
      delete Roblox.PendingApprovals[groupId];
      return message.channel.send(`Accepted group ${groupId} and notified <@${requesterId}>`);
    } else {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`); } catch {}
      delete Roblox.PendingApprovals[groupId];
      return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`);
    }
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1];
    const customToken = parts[2];
    if (!targetServerId || !customToken)
      return message.reply('Invalid format. Use `!setbottoken <serverId> <token>`');
    db.CustomTokens = db.CustomTokens || {};
    db.CustomTokens[targetServerId] = customToken;
    await Roblox.SaveJsonBin(db);
    return message.channel.send(`Custom Roblox token set for server ID ${targetServerId}.`);
  }

  if (cmd === '!add' || cmd === '!remove' || cmd === '!set') {
    const targetMention = parts[1];
    const type = parts[2]?.toLowerCase();
    const value = Number(parts[3]);
    if (!targetMention || !type || isNaN(value)) return message.reply('Invalid command format.');
    const userIdMatch = targetMention.match(/^<@!?(\d+)>$/);
    if (!userIdMatch) return message.reply('Invalid user mention.');
    const discordId = userIdMatch[1];
    db.Trainings[discordId] = db.Trainings[discordId] || { hosted: {}, cohosted: {}, supervised: {} };
    db.Trainings[discordId][type] = db.Trainings[discordId][type] || {};
    const stat = db.Trainings[discordId][type];
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (cmd === '!set') {
      stat[currentMonth] = value;
      stat.total = value;
    } else {
      stat[currentMonth] = stat[currentMonth] || 0;
      stat[currentMonth] += cmd === '!add' ? value : -value;
      stat.total = Object.keys(stat)
        .filter(k => k !== 'lastMonth')
        .reduce((acc, k) => acc + stat[k], 0);
    }

    stat.lastMonth = currentMonth;
    await Roblox.SaveJsonBin(db);
    return message.channel.send(`Updated ${type} for <@${discordId}> — this month: ${stat[currentMonth]}, total: ${stat.total}`);
  }
});

ClientBot.login(BotToken);
