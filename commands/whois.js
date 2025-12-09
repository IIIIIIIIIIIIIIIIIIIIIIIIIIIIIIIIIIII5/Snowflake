const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('../roblox');

async function safeCall(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))
  ]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lookup a Roblox user from a Discord user')
    .addUserOption(opt => opt.setName('user').setDescription('The Discord user to look up').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let db;
    try {
      db = await safeCall(GetJsonBin());
    } catch (err) {
      return interaction.editReply({ content: `Failed to load verification database: ${err.message}` });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const robloxId = db.VerifiedUsers?.[target.id];

    if (!robloxId)
      return interaction.editReply({ content: `${target.tag} has not verified a Roblox account.` });

    let info;
    try {
      info = await safeCall(GetRobloxUserInfo(robloxId));
    } catch (err) {
      return interaction.editReply({ content: `Failed to contact Roblox API: ${err.message}` });
    }

    return interaction.editReply({
      content: `[${info.name}](https://www.roblox.com/users/${robloxId}/profile)`
    });
  }
};
