const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SuspendUser, GetRobloxUserId, GetCurrentRank, SaveJsonBin } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

function parseDuration(input) {
  const match = input.match(/^(\d+)([smhdwM])$/i);
  if (!match) throw new Error("Invalid duration format. Use 1s,1m,1h,1d,1w,1M");

  const value = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s:1000, m:60000, h:3600000, d:86400000, w:604800000, M:2592000000 };
  const durationMs = value * multipliers[unit];
  if (durationMs > multipliers.M) throw new Error("Maximum duration is 1 month.");
  if (durationMs < 1000) throw new Error("Minimum duration is 1 second.");
  return durationMs;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription("Suspend a Roblox user from their rank")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }

    const GuildId = interaction.guild.id;

    if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const db = await GetJsonBin();
      const groupId = db.ServerConfig?.[GuildId]?.GroupId;
      if (!groupId) return interaction.editReply({ content: "Group ID not set. Run /config first." });

      const username = interaction.options.getString('username');
      const reason = interaction.options.getString('reason');
      const durationStr = interaction.options.getString('duration');
      const durationMs = parseDuration(durationStr);

      const userId = await GetRobloxUserId(username);
      const current = await GetCurrentRank(groupId, userId);

      await SuspendUser(groupId, userId, interaction.user.id, GuildId, interaction.client);

      const embed = new EmbedBuilder()
        .setTitle("YOU HAVE BEEN SUSPENDED")
        .setColor(0xff0000)
        .setDescription(`Dear, <@${interaction.user.id}>, you have been suspended from Snowflake Penitentiary from your rank **${current.Name}** for the reason (**${reason}**).\n\nBelow are the details of your suspension:`)
        .addFields(
          { name: "Username", value: username, inline: true },
          { name: "Current Rank", value: current.Name, inline: true },
          { name: "Reason", value: reason, inline: false },
          { name: "Duration", value: durationStr, inline: true },
          { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)", inline: false }
        );

      await interaction.editReply({ embeds: [embed] });

      db.Suspensions = db.Suspensions || {};
      db.Suspensions[userId] = {
        username,
        guildId: GuildId,
        reason,
        issuedBy: interaction.user.id,
        issuedAt: Date.now(),
        endsAt: Date.now() + durationMs,
        durationStr,
        active: true
      };

      await SaveJsonBin(db);

      setTimeout(async () => {
        const dbCheck = await GetJsonBin();
        const suspension = dbCheck.Suspensions?.[userId];
        if (!suspension || !suspension.active) return;

        suspension.active = false;
        await SaveJsonBin(dbCheck);

        const endEmbed = new EmbedBuilder()
          .setTitle("YOUR SUSPENSION HAS ENDED")
          .setColor(0x00ff00)
          .setDescription(`Dear, <@${interaction.user.id}>, your suspension issued on ${new Date(suspension.issuedAt).toLocaleDateString()} has reached its duration and has been lifted.\n\nYou may run /getrole in the main server to regain your roles.`);

        await interaction.followUp({ embeds: [endEmbed] });
      }, durationMs).unref();

    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
