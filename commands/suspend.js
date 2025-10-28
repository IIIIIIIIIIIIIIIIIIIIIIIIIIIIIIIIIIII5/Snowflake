const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, SuspendUser, GetRobloxUserId } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription("Suspend a user")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to suspend').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const db = await GetJsonBin();
      const GuildId = interaction.guild.id;
      if (!db.ServerConfig?.[GuildId]?.GroupId) return interaction.editReply({ content: 'Group ID not set. Run /config first.' });
      
      const GroupId = db.ServerConfig[GuildId].GroupId;
      const username = interaction.options.getString('username');
      const UserId = await GetRobloxUserId(username);
      
      try {
        await SuspendUser(GroupId, UserId, interaction.user.id, GuildId, interaction.client);
        return interaction.editReply({ content: `Suspended ${username}` });
      } catch (err) {
        return interaction.editReply({ content: `Error: ${err.message}` });
      }
    }
};
