const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { GetJsonBin, GetRobloxUserInfo, GetCurrentRank, FetchRoles } = require("../roblox");

const BIN_ID = process.env.SNOWFLAKE_MODERATION_BIN_ID;
const API_KEY = process.env.SNOWFLAKE_JSONBIN_API_KEY;

async function GetModerationData() {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { "X-Master-Key": API_KEY }
  });
  const data = await res.json();
  return data.record || [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your training and group statistics.")
    .addUserOption(opt => opt.setName("user").setDescription("The Discord user to view.").setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const db = await GetJsonBin();
    const moderationData = await GetModerationData();
    const target = interaction.options.getUser("user") || interaction.user;

    const trainings = db.Trainings?.[target.id] || { hosted: {}, cohosted: {}, supervised: {} };
    const monthKey = new Date().toISOString().slice(0, 7);

    const getStats = (type) => {
      const data = trainings[type] || {};
      if (data.lastMonth !== monthKey) {
        data[monthKey] = 0;
        data.lastMonth = monthKey;
      }
      if (!("total" in data)) data.total = 0;
      return { monthly: data[monthKey] || 0, total: data.total };
    };

    const hosted = getStats("hosted");
    const cohosted = getStats("cohosted");
    const supervised = getStats("supervised");

    const robloxId = db.VerifiedUsers?.[target.id];
    let username = "Not Verified";
    let avatarUrl = target.displayAvatarURL({ size: 128 });

    if (robloxId) {
      try {
        const name = await GetRobloxUserInfo(robloxId);
        username = name || "Unknown User";

        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=420x420&format=Png&isCircular=false`);
        const thumbData = await thumbRes.json();
        avatarUrl = thumbData?.data?.[0]?.imageUrl || avatarUrl;
      } catch {
        username = "Unknown User";
      }
    }

    const hostingEmbed = new EmbedBuilder()
      .setTitle(`${username}'s Hosting Stats`)
      .setColor(0x1abc9c)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: "Trainings Hosted (Monthly)", value: `${hosted.monthly}`, inline: true },
        { name: "Trainings Co-Hosted (Monthly)", value: `${cohosted.monthly}`, inline: true },
        { name: "Trainings Supervised (Monthly)", value: `${supervised.monthly}`, inline: true },
        { name: "Total Hosted", value: `${hosted.total}`, inline: true },
        { name: "Total Co-Hosted", value: `${cohosted.total}`, inline: true },
        { name: "Total Supervised", value: `${supervised.total}`, inline: true }
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`show_hosting_${target.id}`).setLabel("📊").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`show_group_${target.id}`).setLabel("🔗").setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.editReply({ embeds: [hostingEmbed], components: [buttons] });

    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async btn => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: "This menu isn’t for you.", ephemeral: true });

      if (btn.customId === `show_hosting_${target.id}`) {
        await btn.update({ embeds: [hostingEmbed], components: [buttons] });
      }

      if (btn.customId === `show_group_${target.id}`) {
        let groupEmbed;

        if (!robloxId) {
          groupEmbed = new EmbedBuilder()
            .setTitle(`${username}'s Group Stats`)
            .setColor(0xe74c3c)
            .setDescription("This user is not verified with Roblox.");
        } else {
          const serverConfig = db.ServerConfig?.[interaction.guild.id];
          let groupRank = "Unknown", warnings = "None", lastPunishment = "No punishments found";

          if (serverConfig?.GroupId) {
            const roles = await FetchRoles(serverConfig.GroupId);
            const currentRank = await GetCurrentRank(serverConfig.GroupId, robloxId).catch(() => null);
            if (currentRank) groupRank = roles[currentRank.Name.toLowerCase()]?.Name || currentRank.Name;
          }

          const userModeration = moderationData.filter(m => m.user === target.id);
          if (userModeration.length > 0) {
            const warnCount = userModeration.filter(m => m.type === "warn").length;
            warnings = warnCount > 0 ? String(warnCount) : "None";

            const lastAction = userModeration[userModeration.length - 1];
            if (lastAction?.IssuedAt) lastPunishment = new Date(lastAction.IssuedAt).toLocaleString('en-GB');
          }

          const userCerts = Array.isArray(db.Certifications?.[target.id]) ? db.Certifications[target.id] : [];
          const certCounts = {};
          userCerts.forEach(c => certCounts[c] = (certCounts[c] || 0) + 1);
          const certDisplay = Object.keys(certCounts).length > 0
            ? Object.entries(certCounts).map(([cert, count]) => `${count}x ${cert}`).join(", ")
            : "None";

          groupEmbed = new EmbedBuilder()
            .setTitle(`${username}'s Group Stats`)
            .setColor(0x5865f2)
            .setThumbnail(avatarUrl)
            .addFields(
              { name: "Group Rank", value: groupRank, inline: true },
              { name: "Warnings", value: warnings, inline: true },
              { name: "Last Punishment", value: lastPunishment, inline: true },
              { name: "Certifications", value: certDisplay, inline: true }
            );
        }

        await btn.update({ embeds: [groupEmbed], components: [buttons] });
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    });
  }
};
