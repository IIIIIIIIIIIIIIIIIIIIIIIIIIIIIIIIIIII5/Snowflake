const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('./roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lookup a Roblox user from a Discord user')
    .addUserOption(opt => opt.setName('user').setDescription('The Discord user to look up').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = await GetJsonBin();
    const target = interaction.options.getUser('user') || interaction.user;
    const robloxId = db.VerifiedUsers?.[target.id];
    if (!robloxId) return interaction.editReply({ content: `${target.tag} has not verified a Roblox account.` });

    const info = await GetRobloxUserInfo(robloxId);
    return interaction.editReply({ content: `[${info.name}](https://www.roblox.com/users/${robloxId}/profile)` });
  }
};
