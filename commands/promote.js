const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, GetCurrentRank, FetchRoles, SetRank } = require('../roblox');

const ALLOWED_ROLE = '1423332095001890908';
const SFPLeadershipRole = '1386369108408406096';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user')
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE) && !interaction.member.roles.cache.has(SFPLeadershipRole))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const groupId = db.ServerConfig[guildId].GroupId;
    const username = interaction.options.getString('username');
    const userId = await GetRobloxUserId(username);

    try {
      const current = await GetCurrentRank(groupId, userId);
      const roles = Object.values(await FetchRoles(groupId)).sort((a, b) => a.Rank - b.Rank);
      const index = roles.findIndex(r => r.Rank === current.Rank);
      if (index === -1 || index === roles.length - 1) throw new Error('Cannot promote further');
      const newRole = roles[index + 1];
      await SetRank(groupId, userId, newRole.Name, interaction.user.id, guildId);
      return interaction.editReply({ content: `Promoted ${username} to ${newRole.Name}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
