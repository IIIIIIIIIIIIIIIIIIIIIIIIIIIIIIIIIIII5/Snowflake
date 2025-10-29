const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, SetRoleByNameNoChecks, UnsuspendUserByRecord } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unsuspend')
    .setDescription('Remove a user\'s suspension')
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to unsuspend').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ending the suspension').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) return interaction.reply({ content: "You don't have permission.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      const db = await GetJsonBin();
      const guildId = interaction.guild.id;
      if (!db.ServerConfig?.[guildId]?.GroupId) return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

      const username = interaction.options.getString('username');
      const reason = interaction.options.getString('reason');
      const userId = await GetRobloxUserId(username);

      const suspension = db.Suspensions?.[userId];
      if (!suspension || !suspension.active) return interaction.editReply({ content: `${username} is not currently suspended.` });

      await UnsuspendUserByRecord(userId, guildId, interaction.client, interaction.user.id, reason);

      suspension.active = false;
      suspension.endedAt = Date.now();
      suspension.endedBy = interaction.user.id;
      suspension.endedReason = reason;
      await SaveJsonBin(db);

      const embed = new EmbedBuilder()
        .setTitle('YOUR SUSPENSION HAS ENDED EARLY')
        .setColor(0x00ff00)
        .setDescription(`Dear, **${username}**, your suspension which was issued on ${new Date(suspension.issuedAt).toLocaleDateString()} has ended early for the reason: **${reason}**.\n\nYou may run /getrole in the main server to receive your roles.`)
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Reason', value: reason, inline: false }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
