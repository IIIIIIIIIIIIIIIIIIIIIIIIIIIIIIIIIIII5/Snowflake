const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
const ClientId = process.env.CLIENT_ID;
const GuildId = '1386275140815425557';

(async () => {
  const cmds = await rest.get(
    Routes.applicationGuildCommands(ClientId, GuildId)
  );

  for (const cmd of cmds) {
    await rest.delete(
      Routes.applicationGuildCommand(ClientId, GuildId, cmd.id)
    );
    console.log('Deleted:', cmd.name);
  }
})();
