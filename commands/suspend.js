const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SuspendUser, GetRobloxUserId, GetCurrentRank } = require('../roblox');
const { SaveJsonBin } = require('../utils');

const ALLOWED_ROLE = "1398691449939169331";

function parseDuration(input) {
  const match = input.match(/^(\d+)([smhdwM])$/i);
  if (!match) throw new Error("Invalid duration format. Use 1h, 1d, 1w, 1M, etc.");
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    M: 1000 * 60 * 60 * 24 * 30
  };
  const duration = value * multipliers[unit];
  if (duration > multipliers.M) throw new Error("Maximum suspension duration is 1 month.");
  if (duration < 1000) throw new Error("Minimum suspension duration is 1 second.");
  return duration;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription("Suspend a Roblox user from their rank.")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to suspend').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 1w, 1M)').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      const db = await GetJsonBin();
      const GuildId = interaction.guild.id;
      if (!db.ServerConfig?.[GuildId]?.GroupId)
        return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

      const GroupId = db.ServerConfig[GuildId].GroupId;
      const username = interaction.options.getString('username');
      const reason = interaction.options.getString('reason');
      const durationStr = interaction.options.getString('duration');

      const durationMs = parseDuration(durationStr);
      const UserId = await GetRobloxUserId(username);
      const current = await GetCurrentRank(GroupId, UserId);

      await SuspendUser(GroupId, UserId, interaction.user.id, GuildId, interaction.client);

      const suspensionEmbed = new EmbedBuilder()
        .setTitle('YOU HAVE BEEN SUSPENDED')
        .setColor(0xff0000)
        .setDescription(`Dear, <@${interaction.user.id}> you have been suspended from your rank in Snowflake Penitentiary**${current.Name}** for the reason (**${reason}**).\n\nBelow are the details of your suspension:`)
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Current Rank', value: current.Name, inline: true },
          { name: 'Reason for Suspension', value: reason, inline: false },
          { name: 'Duration', value: durationStr, inline: true },
          { name: 'Appeal', value: '[Join Administration Server](https://discord.gg/ZSJuzdVAee)', inline: false }
        );

      await interaction.editReply({ embeds: [suspensionEmbed] });

      db.Suspensions = db.Suspensions || {};
      db.Suspensions[UserId] = {
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
        const suspension = dbCheck.Suspensions?.[UserId];
        if (!suspension || !suspension.active) return;

        suspension.active = false;
        await SaveJsonBin(dbCheck);

        const endEmbed = new EmbedBuilder()
          .setTitle('YOUR SUSPENSION HAS ENDED')
          .setColor(0x00ff00)
          .setDescription(`Dear, <@${interaction.user.id}> your suspension which was issued on ${new Date(suspension.issuedAt).toLocaleDateString()} has reached its duration and your suspension has been officially lifted.\n\nYou may run /getrole in the main server to regain your roles.`);

        await interaction.followUp({ embeds: [endEmbed] });
      }, durationMs).unref();

    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
