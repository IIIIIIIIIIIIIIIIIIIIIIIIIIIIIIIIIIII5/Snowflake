const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('../roblox');

function formatNumber(num) {
  return num.toLocaleString();
}

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

    const ageDays = Math.floor((Date.now() - new Date(info.created).getTime()) / (1000 * 60 * 60 * 24));

    const pastNames = info.pastUsernames.length > 0
      ? info.pastUsernames.slice(0, 10).join(", ")
      : "None";

    const primaryGroup = info.groups.length > 0
      ? `${info.groups[0].name} — ${info.groups[0].role} (${info.groups[0].rank})`
      : "None";

    let components = [];
    if (info.presence.includes("In Game")) {
      const gameIdMatch = info.presence.match(/gameId=(\d+)/);
      let gameId = gameIdMatch ? gameIdMatch[1] : null;
      if (gameId) {
        const button = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Join Game")
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/games/${gameId}`)
        );
        components.push(button);
      }
    }

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Copy Roblox ID")
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("copy_id")
      )
    );

    const embed = new EmbedBuilder()
      .setTitle(`${info.displayName} (${info.username})`)
      .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
      .setThumbnail(info.avatar)
      .setColor(0x2b2d31)
      .addFields(
        { name: "User ID", value: `${info.id}`, inline: true },
        { name: "Created", value: info.created || "Unknown", inline: true },
        { name: "Account Age", value: `${ageDays} days`, inline: true },
        
        { name: "Banned", value: info.isBanned ? "Yes" : "No", inline: true },

        { name: "Friends", value: `${info.friendsCount}`, inline: true },
        { name: "Description", value: info.description.length > 1024 ? info.description.slice(0, 1021) + "..." : info.description }
      )
      .setTimestamp();

    return interaction.editReply({
      embeds: [embed],
      components
    });
  }
};
