const { SlashCommandBuilder } = require("discord.js");
const { GetJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser } = require("../roblox");
const { SaveJsonBin } = require("../utils");

const ALLOWED_ROLE = "1423332095001890908";

function parseDuration(input) {
  const match = input.match(/^(\d+)([smhdwM])$/i);
  if (!match) throw new Error("Invalid duration format. Use 1h, 1d, 1w, 1m, etc.");
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    M: 1000 * 60 * 60 * 24 * 30,
  };

  return value * multipliers[unit];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suspend")
    .setDescription("Suspend a Roblox user from their rank.")
    .addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for suspension").setRequired(true))
    .addStringOption(opt => opt.setName("duration").setDescription("Duration (e.g. 1h, 1d, 1w, 1m)").setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString("username");
    const reason = interaction.options.getString("reason");
    const durationStr = interaction.options.getString("duration");

    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.editReply({ content: "Group ID not set. Run /config first." });

    const groupId = db.ServerConfig[guildId].GroupId;

    try {
      const durationMs = parseDuration(durationStr);
      const userId = await GetRobloxUserId(username);
      const current = await GetCurrentRank(groupId, userId);

      await SuspendUser(groupId, userId, interaction.user.id, guildId);

      const message =
`# YOU HAVE BEEN SUSPENDED

Dear, <@${interaction.user.id}> you have been suspended from Snowflake Penitentiary from your rank **${current.Name}** for the reason **${reason}**. 

Below are the details of your suspension:

**Username:** ${username}
**Current Rank:** ${current.Name}
**Reason for Suspension:** ${reason}
**Duration:** ${durationStr}

If you believe you were suspended unfairly you may appeal your suspension in the [administration](https://discord.gg/ZSJuzdVAee) server.`;

      await interaction.editReply({ content: message });

      db.Suspensions = db.Suspensions || {};
      db.Suspensions[userId] = {
        username,
        guildId,
        issuedBy: interaction.user.id,
        reason,
        durationMs,
        issuedAt: Date.now(),
        endsAt: Date.now() + durationMs,
        active: true,
      };

      await SaveJsonBin(db);

      setTimeout(async () => {
        const currentData = db.Suspensions[userId];
        if (!currentData || !currentData.active) return;

        currentData.active = false;
        await SaveJsonBin(db);

        const endMessage =
`# YOUR SUSPENSION HAS ENDED

Dear, <@${interaction.user.id}> your suspension which was issued on ${new Date(currentData.issuedAt).toLocaleDateString()} has reached its duration and your suspension has been officially lifted, you may run /getrole in the main server.`;

        try {
          await interaction.followUp({ content: endMessage, ephemeral: false });
        } catch {}
      }, durationMs);
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  },
};
