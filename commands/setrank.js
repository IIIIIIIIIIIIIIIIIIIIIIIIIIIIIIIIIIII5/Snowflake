const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, SetRank } = require('../roblox');

const ALLOWED_ROLE = '1423332095001890908';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription("Set a user's rank")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(opt => opt.setName('rankname').setDescription('Rank name').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const groupId = db.ServerConfig[guildId].GroupId;
    const username = interaction.options.getString('username');
    const rankName = interaction.options.getString('rankname');
    const userId = await GetRobloxUserId(username);

    try {
      await SetRank(groupId, userId, rankName, interaction.user.id, guildId);
      return interaction.editReply({ content: `Set ${username} to rank ${rankName}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
