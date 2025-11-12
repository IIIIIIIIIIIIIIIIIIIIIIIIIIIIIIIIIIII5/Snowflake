const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin } = require('../roblox');

const SFPLeadershipRole = '1386369108408406096';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cdcheck')
    .setDescription("Check a user's hosting cooldown")
    .addUserOption(opt => opt.setName('user').setDescription('User to check (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(target.id);

    const db = await GetJsonBin();
    db.Cooldowns = db.Cooldowns || {};

    if (member && member.roles.cache.has(SFPLeadershipRole)) {
      return interaction.editReply({
        content: `Cooldown resets in: N/A\nTrainings left until cooldown: N/A`
      });
    }

    const userId = target.id;
    const cd = db.Cooldowns[userId];

    if (!cd || !cd.lastTimestamp) {
      return interaction.editReply({
        content: `Cooldown resets in: N/A\nTrainings left until cooldown: 2/2`
      });
    }

    const now = new Date();
    const last = new Date(cd.lastTimestamp);
    const difference = (now - last) / (1000 * 60 * 60);

    if (difference >= 24) {
      return interaction.editReply({
        content: `Cooldown resets in: Ready now!\nTrainings left until cooldown: 2/2`
      });
    }

    const remaining = 24 - Math.floor(difference);
    const todayKey = new Date().toISOString().slice(0, 10);
    const usedToday = cd.dates?.[todayKey] || 0;
    const trainingsLeft = 2 - usedToday;

    return interaction.editReply({
      content: `Cooldown resets in: ${remaining}h\nTrainings left until cooldown: ${trainingsLeft}/2`
    });
  }
};
