const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unsuspend')
    .setDescription("Remove a user's suspension")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to unsuspend').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ending the suspension').setRequired(true)),

  async execute(interaction) {
    const GuildId = interaction.guild.id;

    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "You don't have permission.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      const db = await GetJsonBin();
      if (!db.ServerConfig?.[GuildId]?.GroupId)
        return interaction.editReply({ content: "Group ID not set. Run /config first." });

      const username = interaction.options.getString('username');
      const reason = interaction.options.getString('reason');
      const UserId = await GetRobloxUserId(username);

      const suspension = db.Suspensions?.[UserId];
      if (!suspension || !suspension.active)
        return interaction.editReply({ content: `${username} is not currently suspended.` });

      suspension.active = false;
      await SaveJsonBin(db);

      const embed = new EmbedBuilder()
        .setTitle("YOUR SUSPENSION HAS ENDED EARLY")
        .setColor(0x00ff00)
        .setDescription(`Dear, <@${interaction.user.id}>, your suspension which was issued on ${new Date(suspension.issuedAt).toLocaleDateString()} has ended early for the reason: **${reason}**.\n\nYou may run /getrole in the main server to receive your roles.`);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
