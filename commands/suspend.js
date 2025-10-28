const { SlashCommandBuilder } = require('discord.js');
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
  return duration;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription("Suspend a user")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to suspend').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 1w, 1M)').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    const GuildId = interaction.guild.id;
    if (!db.ServerConfig?.[GuildId]?.GroupId)
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const GroupId = db.ServerConfig[GuildId].GroupId;
    const username = interaction.options.getString('username');
    const reason = interaction.options.getString('reason');
    const durationStr = interaction.options.getString('duration');

    try {
      const durationMs = parseDuration(durationStr);
      const UserId = await GetRobloxUserId(username);
      const current = await GetCurrentRank(GroupId, UserId);

      await SuspendUser(GroupId, UserId, interaction.user.id, GuildId, interaction.client);

      const suspensionMsg =
        "YOU HAVE BEEN SUSPENDED\n\n" +
        "Dear, <@" + interaction.user.id + "> you have been suspended from Snowflake Penitentiary from your rank **" + current.Name + "** for the reason **" + reason + "**.\n\n" +
        "Below are the details of your suspension:\n\n" +
        "**Username:** " + username + "\n" +
        "**Current Rank:** " + current.Name + "\n" +
        "**Reason for Suspension:** " + reason + "\n" +
        "**Duration:** " + durationStr + "\n\n" +
        "If you believe you were suspended unfairly you may appeal your suspension in the administration server:\nhttps://discord.gg/ZSJuzdVAee";

      await interaction.editReply({ content: suspensionMsg });

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
        const suspension = db.Suspensions[UserId];
        if (!suspension || !suspension.active) return;

        suspension.active = false;
        await SaveJsonBin(db);

        const endMsg =
          "YOUR SUSPENSION HAS ENDED\n\n" +
          "Dear, <@" + interaction.user.id + "> your suspension which was issued on " + new Date(suspension.issuedAt).toLocaleDateString() +
          " has reached its duration and your suspension has been officially lifted.\n\n" +
          "You may run /getrole in the main server to regain your roles.";

        try {
          await interaction.followUp({ content: endMsg });
        } catch {}
      }, durationMs);

    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
