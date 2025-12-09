const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lookup a Roblox user from a Discord user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Discord user to look up')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let db;
    try {
      db = await GetJsonBin();
    } catch (err) {
      return interaction.editReply({
        content: `Failed to load verification: ${err.message}`
      });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const robloxId = db.VerifiedUsers?.[target.id];

    if (!robloxId) {
      return interaction.editReply({
        content: `${target.tag} has not verified a Roblox account.`
      });
    }

    let info;
    try {
      info = await GetRobloxUserInfo(robloxId);
    } catch (err) {
      return interaction.editReply({
        content: `Failed to contact Roblox API: ${err.message}`
      });
    }

    let groupList = "None";
    if (info.groups.length > 0) {
      groupList = info.groups
        .slice(0, 5)
        .map(g => `• **${g.name}** — ${g.role} (${g.rank})`)
        .join("\n");
    }

    const pastNames = info.pastUsernames.length > 0 ? info.pastUsernames.slice(0, 10).join(", "): "None";

    const embed = new EmbedBuilder()
      .setTitle(`${info.displayName} (${info.username})`)
      .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
      .setThumbnail(info.avatar)
      .setColor(0x2b2d31)
      .addFields(
        { name: "User ID", value: `${info.id}`, inline: true },
        { name: "Created", value: info.created || "Unknown", inline: true },
        { name: "Banned", value: info.isBanned ? "Yes" : "No", inline: true },

        { name: "Presence", value: info.presence || "Unknown", inline: true },
        { name: "Badges", value: `${info.badgeCount}`, inline: true },
        { name: "RAP", value: `${info.rap}`, inline: true },

        { name: "Friends", value: `${info.friendsCount}`, inline: true },
        { name: "Followers", value: `${info.followersCount}`, inline: true },
        { name: "Following", value: `${info.followingCount}`, inline: true },

        { name: "Past Usernames", value: pastNames, inline: false },
        { name: "Groups", value: groupList, inline: false },

        {
          name: "Description",
          value:
            info.description.length > 1024
              ? info.description.slice(0, 1021) + "..."
              : info.description
        }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
