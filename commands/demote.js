const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, GetCurrentRank, FetchRoles, SetRank } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a user')
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId) return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const groupId = db.ServerConfig[guildId].GroupId;
    const username = interaction.options.getString('username');
    const userId = await GetRobloxUserId(username);

    try {
      const current = await GetCurrentRank(groupId, userId);
      const roles = Object.values(await FetchRoles(groupId)).sort((a, b) => a.Rank - b.Rank);
      const index = roles.findIndex(r => r.Rank === current.Rank);
      if (index <= 0) throw new Error('Cannot demote further');
      const newRole = roles[index - 1];
      await SetRank(groupId, userId, newRole.Name, interaction.user.id, guildId);
      return interaction.editReply({ content: `Demoted ${username} to ${newRole.Name}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
}
