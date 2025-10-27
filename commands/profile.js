const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { GetJsonBin, GetRobloxUserInfo, getCurrentRank, fetchRoles } = require("../roblox");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your training and group statistics.")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The Discord user to view.").setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const db = await GetJsonBin();
    const target = interaction.options.getUser("user") || interaction.user;
    const trainings = db.Trainings?.[target.id] || { hosted: {}, cohosted: {}, supervised: {} };
    const monthKey = new Date().toISOString().slice(0, 7);

    const getStats = type => {
      const data = trainings[type] || {};
      if (data.lastMonth !== monthKey) {
        data[monthKey] = 0;
        data.lastMonth = monthKey;
      }
      return { monthly: data[monthKey] || 0, total: data.total || 0 };
    };

    const hosted = getStats("hosted");
    const cohosted = getStats("cohosted");
    const supervised = getStats("supervised");

    const robloxId = db.VerifiedUsers?.[target.id];
    let username = "Not Verified";
    let url, avatarUrl;

    if (robloxId) {
      const info = await GetRobloxUserInfo(robloxId);
      username = info.name;
      url = `https://www.roblox.com/users/${robloxId}/profile`;
      const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=420x420&format=Png&isCircular=false`);
      const thumbData = await thumbRes.json();
      avatarUrl = thumbData?.data?.[0]?.imageUrl;
    }

    const statsEmbed = new EmbedBuilder()
      .setTitle(`${username}'s Hosting Statistics`)
      .setURL(url)
      .setColor(0x1abc9c)
      .setThumbnail(avatarUrl || target.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: "Trainings Hosted (Monthly)", value: `${hosted.monthly}`, inline: true },
        { name: "Trainings Co-Hosted (Monthly)", value: `${cohosted.monthly}`, inline: true },
        { name: "Trainings Supervised (Monthly)", value: `${supervised.monthly}`, inline: true },
        { name: "Total Hosted", value: `${hosted.total}`, inline: true },
        { name: "Total Co-Hosted", value: `${cohosted.total}`, inline: true },
        { name: "Total Supervised", value: `${supervised.total}`, inline: true }
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`show_hosting_${target.id}`).setLabel("📊 Hosting Stats").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`show_group_${target.id}`).setLabel("🔗 Group Stats").setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.editReply({ embeds: [statsEmbed], components: [buttons] });

    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async btn => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: "This menu isn’t for you.", ephemeral: true });

      if (btn.customId === `show_hosting_${target.id}`) {
        await btn.update({ embeds: [statsEmbed], components: [buttons] });
      }

      if (btn.customId === `show_group_${target.id}`) {
        let groupEmbed;
        if (!robloxId) {
          groupEmbed = new EmbedBuilder()
            .setTitle(`${username}'s Group Statistics`)
            .setColor(0xe74c3c)
            .setDescription("This user is not verified with Roblox.");
        } else {
          const serverConfig = db.ServerConfig?.[interaction.guild.id];
          let groupName = "Unknown", groupRank = "Unknown", warnings = "None", lastPunishment = "Nil";

          if (serverConfig?.GroupId) {
            const roles = await fetchRoles(serverConfig.GroupId);
            const currentRank = await getCurrentRank(serverConfig.GroupId, robloxId).catch(() => null);
            if (currentRank) groupRank = roles[currentRank]?.name || "Unknown";
          }

          if (db.Warnings?.[robloxId]) warnings = String(db.Warnings[robloxId].length || 0);
          if (db.LastPunishments?.[robloxId]) lastPunishment = db.LastPunishments[robloxId];

          groupEmbed = new EmbedBuilder()
            .setTitle(`${username}'s Group Statistics`)
            .setURL(url)
            .setColor(0x5865f2)
            .setThumbnail(avatarUrl || target.displayAvatarURL({ size: 128 }))
            .addFields(
              { name: "Group Rank", value: groupRank, inline: true },
              { name: "Warnings", value: warnings === "0" ? "None" : warnings, inline: true },
              { name: "Last Punishment", value: lastPunishment || "Nil", inline: true }
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
