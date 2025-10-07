const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserInfo } = require('./roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your training stats')
    .addUserOption(opt => opt.setName('user').setDescription('The Discord user to view').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const db = await GetJsonBin();
    const target = interaction.options.getUser('user') || interaction.user;
    const trainings = db.Trainings?.[target.id] || { hosted: {}, cohosted: {}, supervised: {} };
    const monthKey = new Date().toISOString().slice(0, 7);

    const getStats = type => {
      const data = trainings[type] || {};
      if (data.lastMonth !== monthKey) { data[monthKey] = 0; data.lastMonth = monthKey; }
      return { monthly: data[monthKey] || 0, total: data.total || 0 };
    };

    const hosted = getStats('hosted');
    const cohosted = getStats('cohosted');
    const supervised = getStats('supervised');

    const robloxId = db.VerifiedUsers?.[target.id];
    let username = 'Not Verified', url, thumb;
    if (robloxId) {
      const info = await GetRobloxUserInfo(robloxId);
      username = info.name;
      url = `https://www.roblox.com/users/${robloxId}/profile`;
      thumb = `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`;
    }

    const embed = new EmbedBuilder()
      .setTitle(username)
      .setURL(url)
      .setColor(0x1abc9c)
      .addFields(
        { name: 'Trainings Hosted This Month', value: `${hosted.monthly}`, inline: true },
        { name: 'Trainings Co-Hosted This Month', value: `${cohosted.monthly}`, inline: true },
        { name: 'Trainings Supervised This Month', value: `${supervised.monthly}`, inline: true },
        { name: 'Trainings Hosted Total', value: `${hosted.total}`, inline: true },
        { name: 'Trainings Co-Hosted Total', value: `${cohosted.total}`, inline: true },
        { name: 'Trainings Supervised Total', value: `${supervised.total}`, inline: true }
      );

    if (thumb) embed.setThumbnail(thumb);
    return interaction.editReply({ embeds: [embed] });
  }
};
