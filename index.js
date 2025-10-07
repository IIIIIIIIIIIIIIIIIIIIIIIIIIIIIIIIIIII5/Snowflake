const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const Roblox = require('../roblox');

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

function GetCommandFiles(Dir) {
  let Files = [];
  for (const F of fs.readdirSync(Dir)) {
    const Full = path.join(Dir, F);
    if (fs.statSync(Full).isDirectory()) Files = Files.concat(GetCommandFiles(Full));
    else if (F.endsWith('.js')) Files.push(Full);
  }
  return Files;
}

const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'));
for (const File of CommandFiles) {
  const Cmd = require(File);
  if (Cmd && Cmd.data && Cmd.execute) ClientBot.Commands.set(Cmd.data.name, Cmd);
}

ClientBot.once('ready', async () => {
  console.log(`Logged in as ${ClientBot.user.tag}`);
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching });

  const Rest = new REST({ version: '10' }).setToken(BotToken);
  const CommandsPayload = Array.from(ClientBot.Commands.values()).map(c => c.data.toJSON());

  await ClientBot.guilds.fetch();

  for (const [GuildId, Guild] of ClientBot.guilds.cache) {
    try {
      await Rest.put(Routes.applicationGuildCommands(ClientId, GuildId), { body: CommandsPayload });
      console.log(`Commands registered for guild ${GuildId}`);
    } catch (Err) {
      console.error(`Failed to register commands for ${GuildId}:`, Err.message);
    }
  }

  console.log('All guild commands synced.');
});

ClientBot.on('interactionCreate', async Interaction => {
  if (Interaction.isButton() && Interaction.customId === 'done_verification') {
    return Roblox.HandleVerificationButton(Interaction);
  }

  if (!Interaction.isChatInputCommand()) return;
  const Cmd = ClientBot.Commands.get(Interaction.commandName);
  if (!Cmd) return;

  try {
    await Cmd.execute(Interaction, ClientBot);
  } catch (Err) {
    console.error('Command error:', Err);
    if (!Interaction.replied && !Interaction.deferred) {
      await Interaction.reply({ content: 'An error occurred.', ephemeral: true });
    } else {
      await Interaction.editReply({ content: `Error: ${Err.message}` });
    }
  }
});

ClientBot.on('messageCreate', async Message => {
  if (!Message.content.startsWith('!')) return;
  if (Message.author.id !== AdminId) return;

  const Parts = Message.content.split(/\s+/);
  const Cmd = Parts[0].toLowerCase();
  const Db = await Roblox.GetJsonBin();

  if (Cmd === '!accept' || Cmd === '!decline') {
    const GroupId = Parts[1];
    if (!GroupId || !Roblox.PendingApprovals[GroupId]) return Message.reply('Invalid or unknown group ID.');
    const { requesterId } = Roblox.PendingApprovals[GroupId];

    if (Cmd === '!accept') {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been accepted.`); } catch {}
      delete Roblox.PendingApprovals[GroupId];
      return Message.channel.send(`Accepted group ${GroupId} and notified <@${requesterId}>`);
    } else {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been declined.`); } catch {}
      delete Roblox.PendingApprovals[GroupId];
      return Message.channel.send(`Declined group ${GroupId} and notified <@${requesterId}>`);
    }
  }

  if (Cmd === '!setbottoken') {
    const TargetServerId = Parts[1];
    const CustomToken = Parts[2];
    if (!TargetServerId || !CustomToken) return Message.reply('Usage: !setbottoken <serverid> <token>');
    Db.CustomTokens = Db.CustomTokens || {};
    Db.CustomTokens[TargetServerId] = CustomToken;
    await Roblox.SaveJsonBin(Db);
    return Message.channel.send(`Custom Roblox token set for server ID ${TargetServerId}.`);
  }
});

ClientBot.login(BotToken);
