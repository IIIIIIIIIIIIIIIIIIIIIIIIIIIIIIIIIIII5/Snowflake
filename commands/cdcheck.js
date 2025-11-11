const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin } = require('../roblox');

const SFPLeadershipRole = '1386369108408406096';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cdcheck')
    .setDescription('Check a user\'s hosting cooldown')
    .addUserOption(opt => opt.setName('user').setDescription('User to check (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(target.id);

    if (member && member.roles.cache.has(SFPLeadershipRole)) {
      return interaction.editReply({ content: 'Cooldown Ends in: N/A' });
    }

    const userId = target.id;
    const db = await GetJsonBin();
    db.Cooldowns = db.Cooldowns || {};

    const cd = db.Cooldowns[userId];
    if (!cd || !cd.lastTimestamp) {
      return interaction.editReply({ content: 'Cooldown Ends in: N/A' });
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const usedToday = cd.dates?.[todayKey] || 0;

    if (usedToday < 2) {
      return interaction.editReply({ content: 'Cooldown Ends in: N/A' });
    }

    return interaction.editReply({ content: `Cooldown Ends in: ${cd.lastTimestamp}` });
  }
};
