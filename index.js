const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const Roblox = require('./roblox');
const { startApi } = require('./api');

const BotToken = process.env.BOT_TOKEN;
const ClientId = process.env.CLIENT_ID;
const AdminId = process.env.ADMIN_ID;
const TestGuildId = '1386275140815425557';

const ClientBot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
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

async function RefreshCommands() {
  ClientBot.Commands.clear();

  const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'));
  for (const file of CommandFiles) {
    delete require.cache[require.resolve(file)];
    const cmd = require(file);
    if (cmd?.data && cmd?.execute) {
      ClientBot.Commands.set(cmd.data.name, cmd);
    }
  }

  const rest = new REST({ version: '10' }).setToken(BotToken);
  const payload = [...ClientBot.Commands.values()].map(c => c.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(ClientId, TestGuildId), { body: payload });
}

global.ClientBot = ClientBot;

ClientBot.once('clientReady', async () => {
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });
  await RefreshCommands();
  startApi();
});

ClientBot.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const command = ClientBot.Commands.get(interaction.commandName);
    if (command?.autocomplete) return command.autocomplete(interaction);
  }

  if (interaction.isButton() && interaction.customId === 'done_verification') {
    return Roblox.HandleVerificationButton(interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = ClientBot.Commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, ClientBot);
  } catch {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
    }
  }
});

ClientBot.on('messageCreate', async message => {
  if (!message.content.startsWith('!')) return;
  if (![AdminId, '804292216511791204', '1167121753672257576'].includes(message.author.id)) return;

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
    }

    try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`); } catch {}
    delete Roblox.PendingApprovals[groupId];
    return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`);
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1];
    const customToken = parts[2];
    if (!targetServerId || !customToken) return message.reply('Invalid format.');
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

    const match = targetMention.match(/^<@!?(\d+)>$/);
    if (!match) return message.reply('Invalid user mention.');

    const discordId = match[1];
    const currentMonth = new Date().toISOString().slice(0, 7);

    db.Trainings[discordId] ||= { hosted: {}, cohosted: {}, supervised: {} };
    db.Trainings[discordId][type] ||= {};

    const stat = db.Trainings[discordId][type];

    if (cmd === '!set') {
      stat[currentMonth] = value;
    } else {
      stat[currentMonth] = stat[currentMonth] || 0;
      stat[currentMonth] += cmd === '!add' ? value : -value;
    }

    stat.total = Object.entries(stat)
      .filter(([k]) => /^\d{4}-\d{2}$/.test(k))
      .reduce((a, [, v]) => a + v, 0);

    stat.lastMonth = currentMonth;

    await Roblox.SaveJsonBin(db);
    return message.channel.send(
      `Updated ${type} for <@${discordId}> — this month: ${stat[currentMonth]}, total: ${stat.total}`
    );
  }
});

ClientBot.login(BotToken);
