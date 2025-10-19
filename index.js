const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const Roblox = require('./roblox');
const { StartApi } = require('./api');

const BotToken = process.env.BOT_TOKEN;
const ClientId = process.env.CLIENT_ID;
const AdminId = process.env.ADMIN_ID;

const ClientBot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

ClientBot.Commands = new Collection();
ClientBot.PendingApprovals = Roblox.PendingApprovals;

function GetCommandFiles(dir) {
  console.log(`[GetCommandFiles] Scanning directory: ${dir}`);
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      console.log(`[GetCommandFiles] Entering subdirectory: ${full}`);
      files.push(...GetCommandFiles(full));
    } else if (f.endsWith('.js')) {
      console.log(`[GetCommandFiles] Found command file: ${full}`);
      files.push(full);
    }
  }
  return files;
}

const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'));
for (const file of CommandFiles) {
  try {
    delete require.cache[require.resolve(file)];
    const cmd = require(file);
    if (cmd && cmd.data && cmd.execute) {
      console.log(`[CommandLoader] Loaded command: ${cmd.data.name}`);
      ClientBot.Commands.set(cmd.data.name, cmd);
    } else {
      console.log(`[CommandLoader] Invalid command format in: ${file}`);
    }
  } catch (err) {
    console.log(`[CommandLoader] Error loading ${file}:`, err);
  }
}

console.log(`Loaded ${ClientBot.Commands.size} commands:`);
for (const [name] of ClientBot.Commands) console.log(` - /${name}`);

async function RefreshCommands() {
  console.log('[RefreshCommands] Starting registration...');
  const rest = new REST({ version: '10' }).setToken(BotToken);
  const payload = Array.from(ClientBot.Commands.values()).map(c => c.data.toJSON());
  try {
    console.log('[RefreshCommands] Clearing global commands...');
    await rest.put(Routes.applicationCommands(ClientId), { body: [] });
    console.log('[RefreshCommands] Registering new global commands...');
    await rest.put(Routes.applicationCommands(ClientId), { body: payload });
    console.log(`Registered ${payload.length} global commands.`);
  } catch (err) {
    console.log('[RefreshCommands] Registration failed:', err);
  }
}

global.ClientBot = ClientBot;

ClientBot.once('ready', async () => {
  console.log(`Logged in as ${ClientBot.user.tag}`);
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });
  await RefreshCommands();
  StartApi();
});

ClientBot.on('interactionCreate', async interaction => {
  console.log(`[Interaction] Received: ${interaction.type}`);
  if (interaction.isButton() && interaction.customId === 'done_verification') {
    console.log('[Interaction] Handling verification button');
    return Roblox.HandleVerificationButton(interaction);
  }
  if (!interaction.isChatInputCommand()) return;
  const cmd = ClientBot.Commands.get(interaction.commandName);
  if (!cmd) {
    console.log(`[Interaction] Unknown command: ${interaction.commandName}`);
    return;
  }
  try {
    console.log(`[Interaction] Executing command: ${interaction.commandName}`);
    await cmd.execute(interaction, ClientBot);
  } catch (err) {
    console.log(`[Interaction] Error executing ${interaction.commandName}:`, err);
    if (!interaction.replied && !interaction.deferred)
      await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
  }
});

ClientBot.on('messageCreate', async message => {
  console.log(`[Message] Received: ${message.content}`);
  if (!message.content.startsWith('!')) return;
  if (message.author.id !== AdminId) {
    console.log(`[Message] Ignored: Not from admin (${message.author.id})`);
    return;
  }

  const parts = message.content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  console.log(`[Message] Command triggered: ${cmd}`);

  const db = await Roblox.GetJsonBin();
  db.Trainings = db.Trainings || {};

  if (cmd === '!accept' || cmd === '!decline') {
    const groupId = parts[1];
    console.log(`[Message] ${cmd} for groupId: ${groupId}`);
    if (!groupId || !Roblox.PendingApprovals[groupId]) {
      console.log('[Message] Invalid group ID or no pending approval');
      return message.reply('Invalid group ID or no pending approval.');
    }
    const { requesterId } = Roblox.PendingApprovals[groupId];
    console.log(`[Message] Found requesterId: ${requesterId}`);
    if (cmd === '!accept') {
      try {
        await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been accepted.`);
        console.log(`[Message] Sent acceptance DM to ${requesterId}`);
      } catch (err) {
        console.log(`[Message] Failed to send DM to ${requesterId}:`, err);
      }
      delete Roblox.PendingApprovals[groupId];
      console.log(`[Message] Removed pending approval for ${groupId}`);
      return message.channel.send(`Accepted group ${groupId} and notified <@${requesterId}>`);
    } else {
      try {
        await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`);
        console.log(`[Message] Sent decline DM to ${requesterId}`);
      } catch (err) {
        console.log(`[Message] Failed to send DM to ${requesterId}:`, err);
      }
      delete Roblox.PendingApprovals[groupId];
      console.log(`[Message] Removed pending approval for ${groupId}`);
      return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`);
    }
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1];
    const customToken = parts[2];
    console.log(`[Message] setbottoken for ${targetServerId}`);
    if (!targetServerId || !customToken) {
      console.log('[Message] Invalid format for setbottoken');
      return message.reply('Invalid format. Use `!setbottoken <serverId> <token>`');
    }
    db.CustomTokens = db.CustomTokens || {};
    db.CustomTokens[targetServerId] = customToken;
    await Roblox.SaveJsonBin(db);
    console.log(`[Message] Saved custom token for ${targetServerId}`);
    return message.channel.send(`Custom Roblox token set for server ID ${targetServerId}.`);
  }

  if (cmd === '!add' || cmd === '!remove' || cmd === '!set') {
    const targetMention = parts[1];
    const type = parts[2]?.toLowerCase();
    const value = Number(parts[3]);
    console.log(`[Message] ${cmd} for ${targetMention}, type: ${type}, value: ${value}`);
    if (!targetMention || !type || isNaN(value)) {
      console.log('[Message] Invalid format for training command');
      return message.reply('Invalid command format.');
    }
    const userIdMatch = targetMention.match(/^<@!?(\d+)>$/);
    if (!userIdMatch) {
      console.log('[Message] Invalid user mention');
      return message.reply('Invalid user mention.');
    }
    const discordId = userIdMatch[1];
    console.log(`[Message] Parsed discordId: ${discordId}`);
    db.Trainings[discordId] = db.Trainings[discordId] || { hosted: {}, cohosted: {}, supervised: {} };
    db.Trainings[discordId][type] = db.Trainings[discordId][type] || {};
    const stat = db.Trainings[discordId][type];
    const currentMonth = new Date().toISOString().slice(0, 7);
    console.log(`[Message] Current month: ${currentMonth}`);
    if (cmd === '!set') {
      stat[currentMonth] = value;
      console.log(`[Message] Set ${type} to ${value}`);
    } else {
      stat[currentMonth] = stat[currentMonth] || 0;
      stat[currentMonth] += cmd === '!add' ? value : -value;
      console.log(`[Message] Updated ${type} by ${cmd === '!add' ? '+' : '-'}${value}`);
    }
    stat.lastMonth = currentMonth;
    stat.total = Object.keys(stat).filter(k => k !== 'lastMonth').reduce((acc, k) => acc + stat[k], 0);
    console.log(`[Message] Final stat: ${JSON.stringify(stat)}`);
    await Roblox.SaveJsonBin(db);
    console.log(`[Message] Saved training stats for ${discordId}`);
    return message.channel.send(`Updated ${type} for <@${discordId}> — this month: ${stat[currentMonth]}, total: ${stat.total}`);
  }
});

ClientBot.login(BotToken);
