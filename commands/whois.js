const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lookup a Roblox user from a Discord user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The Discord user to look up')
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

    const embed = new EmbedBuilder()
      .setTitle(`${info.displayName} (${info.username})`)
      .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
      .setThumbnail(info.avatar)
      .setColor(0x2b2d31)
      .addFields(
        { name: "User ID", value: `${info.id}`, inline: true },
        { name: "Created", value: info.created || "Unknown", inline: true },
        { name: "Banned?", value: info.isBanned ? "Yes" : "No", inline: true },

        { name: "Friends", value: `${info.friendsCount}`, inline: false },
        { name: "Followers", value: `${info.followersCount}`, inline: true },
        { name: "Following", value: `${info.followingCount}`, inline: true },

        { name: "Description", value: info.description.length > 1024 ? info.description.slice(0, 1021) + "..." : info.description }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
