const { REST, Routes } = require('discord.js');

const BotToken = process.env.BOT_TOKEN;
const ClientId = process.env.CLIENT_ID;

const rest = new REST({ version: '10' }).setToken(BotToken);

(async () => {
  const globalCommands = await rest.get(
    Routes.applicationCommands(ClientId)
  );

  for (const cmd of globalCommands) {
    await rest.delete(
      Routes.applicationCommand(ClientId, cmd.id)
    );
    console.log('Deleted global command:', cmd.name);
  }
})();
