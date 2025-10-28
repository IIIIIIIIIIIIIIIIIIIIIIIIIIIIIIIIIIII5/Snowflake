const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, SetRank } = require('../roblox');

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

      const targetDiscordId = Object.keys(db.VerifiedUsers || {}).find(id => db.VerifiedUsers[id] === UserId);
      if (targetDiscordId) {
        try {
          const targetUser = await interaction.client.users.fetch(targetDiscordId);
          const durationStr = suspension.durationStr || 'N/A';

          await targetUser.send({
            embeds: [{
              title: "YOU HAVE BEEN SUSPENDED",
              color: 0xff0000,
              description: `Dear, **${username}**, you have been suspended from Snowflake Penitentiary from your rank **${suspension.oldRank || 'Unknown'}** for the reason (**${reason}**).\n\nBelow are the details of your suspension:`,
              fields: [
                { name: "Username", value: username, inline: true },
                { name: "Reason", value: reason, inline: false },
                { name: "Duration", value: durationStr, inline: true },
                { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)", inline: false }
              ]
            }]
          });

          if (suspension.oldRank)
            await SetRank(db.ServerConfig[GuildId].GroupId, UserId, suspension.oldRank, interaction.user.id, GuildId, interaction.client);

        } catch {}
      }

      await interaction.editReply({ content: `Successfully unsuspended ${username}. DM sent to the user.` });

    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
