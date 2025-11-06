const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { GetJsonBin, GetRobloxUserId, SetRank, SendRankLog } = require('../roblox');

const AllowedRole = '1423332095001890908';
const SFPLeadershipRole = '1386369108408406096';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription("Set a user's rank")
    .addStringOption(opt =>
      opt.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('rankname')
        .setDescription('Rank name')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    try {
      const db = await GetJsonBin();
      const guildId = interaction.guild.id;
      const groupId = db.ServerConfig?.[guildId]?.GroupId;
      if (!groupId) return interaction.respond([]);

      const focused = (interaction.options.getFocused() || '').toLowerCase();

      const res = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
      const roles = res.data.roles || [];

      const filtered = roles
        .filter(r => r.name.toLowerCase().includes(focused))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 25);

      const options = filtered.map(r => ({
        name: `${r.name} (${r.id})`,
        value: String(r.id)
      }));

      return interaction.respond(options);
    } catch {
      return interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(AllowedRole) && !interaction.member.roles.cache.has(SFPLeadershipRole))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    const groupId = db.ServerConfig?.[guildId]?.GroupId;
    if (!groupId) return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const username = interaction.options.getString('username');
    const roleId = interaction.options.getString('rankname');
    const userId = await GetRobloxUserId(username);

    try {
      await SetRank(groupId, userId, Number(roleId), interaction.user.id, guildId);
      await SendRankLog(guildId, interaction.client, interaction.user.id, userId, "Set Rank", roleId);
      return interaction.editReply({ content: `Set ${username} to role ID ${roleId}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
