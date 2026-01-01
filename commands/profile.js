const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { GetJsonBin, GetRobloxUsername, GetCurrentRank, FetchRoles } = require("../roblox");

const BIN_ID = process.env.SNOWFLAKE_MODERATION_BIN_ID;
const API_KEY = process.env.SNOWFLAKE_JSONBIN_API_KEY;

async function GetModerationData() {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { "X-Master-Key": API_KEY }
  });
  const data = await res.json();
  return data.record || [];
}

function FormatCertifications(certArray) {
  if (!Array.isArray(certArray) || certArray.length === 0) return ["None"];
  const counts = {};
  for (const cert of certArray) {
    if (cert !== "Certified Host") counts[cert] = (counts[cert] || 0) + 1;
  }
  const result = [];
  const added = new Set();
  for (const cert of certArray) {
    if (cert !== "Certified Host" && !added.has(cert)) {
      const count = counts[cert];
      result.push(count > 1 ? `${cert} **x${count}**` : cert);
      added.add(cert);
    }
  }
  if (certArray.includes("Certified Host")) result.push("Certified Host");
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your group statistics.")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The Discord user to view.").setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const db = await GetJsonBin();
    const moderationData = await GetModerationData();
    const target = interaction.options.getUser("user") || interaction.user;

    if (target.id === "1167121753672257576" && interaction.user.id !== target.id) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("ayo ur a stalker")
            .setDescription("didn't ask you to check my profile")
            .setColor(0xff0000)
        ]
      });
    }

    let verifiedEntry = db.VerifiedUsers?.[target.id] ?? null;
    if (verifiedEntry === "" || verifiedEntry === "null" || verifiedEntry === "undefined") verifiedEntry = null;

    let username = "Not Verified";
    let avatarUrl = target.displayAvatarURL({ size: 128 });
    let robloxId = null;

    if ((typeof verifiedEntry === "string" && /^\d+$/.test(verifiedEntry)) || typeof verifiedEntry === "number") {
      robloxId = Number(verifiedEntry);
      try {
        username = (await GetRobloxUsername(robloxId)) || "Unknown User";
        const thumbRes = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=420x420&format=Png&isCircular=false`
        );
        const thumbData = await thumbRes.json();
        avatarUrl = thumbData?.data?.[0]?.imageUrl || avatarUrl;
      } catch {}
    } else if (typeof verifiedEntry === "string") {
      username = verifiedEntry;
    }

    let groupEmbed;

    if (!robloxId) {
      groupEmbed = new EmbedBuilder()
        .setTitle(`${username}'s Group Stats`)
        .setColor(0xe74c3c)
        .setDescription("This user is not verified with Roblox.");
    } else {
      const guildId = interaction.guild?.id;
      const serverConfig = guildId ? db.ServerConfig?.[guildId] : null;

      let groupRank = "Unknown";
      let warnings = "None";
      let lastPunishment = "No punishments found";

      if (serverConfig?.GroupId) {
        const roles = await FetchRoles(serverConfig.GroupId);
        const currentRank = await GetCurrentRank(serverConfig.GroupId, robloxId).catch(() => null);
        if (currentRank) groupRank = roles[currentRank.Name.toLowerCase()]?.Name || currentRank.Name;
      }

      const userModeration = moderationData.filter(m => m.user === target.id);
      if (userModeration.length) {
        const warnCount = userModeration.filter(m => m.type === "warn").length;
        warnings = warnCount ? String(warnCount) : "None";
        const last = userModeration[userModeration.length - 1];
        if (last?.timestamp) lastPunishment = new Date(last.timestamp).toLocaleString("en-GB");
      }

      const certDisplay = FormatCertifications(db.Certifications?.[target.id] || []).join("\n");

      const departments = [];
      const deptList = [
        { name: "Facility Staffing Commission", id: 7918467 },
        { name: "Community Management", id: 8565254 },
        { name: "Moderation Team", id: 7010801 },
        { name: "Operations Management", id: 9765582 }
      ];

      for (const dept of deptList) {
        const r = await GetCurrentRank(dept.id, robloxId).catch(() => null);
        const rankId = r?.Role?.Rank ?? r?.role?.Rank ?? r?.Rank ?? r?.rank ?? r?.Id ?? r?.id ?? null;
        if (rankId == null) continue;
        if (dept.name === "Operations Management" && Number(rankId) < 201) continue;
        departments.push(dept.name);
      }

      if (!departments.length) departments.push("None");

      groupEmbed = new EmbedBuilder()
        .setTitle(`${username}'s Group Stats`)
        .setColor(0x5865f2)
        .setThumbnail(avatarUrl)
        .addFields(
          { name: "Group Rank", value: groupRank },
          { name: "Warnings", value: warnings },
          { name: "Last Punishment", value: lastPunishment },
          { name: "Certifications", value: certDisplay },
          { name: "Departments", value: departments.join(", ") }
        );
    }

    await interaction.editReply({ embeds: [groupEmbed] });
  }
};
