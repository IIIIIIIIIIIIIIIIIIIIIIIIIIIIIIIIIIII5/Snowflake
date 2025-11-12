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

    const Target = interaction.options.getUser('user') || interaction.user;
    const Member = interaction.guild.members.cache.get(Target.id);
    const UserId = Target.id;
    const Db = await GetJsonBin();
    Db.Cooldowns = Db.Cooldowns || {};

    if (Member && Member.roles.cache.has(SFPLeadershipRole)) {
      return interaction.editReply({
        content: `Cooldown resets in: N/A\nTrainings left until cooldown: N/A`
      });
    }

    const Cd = Db.Cooldowns[UserId];
    if (!Cd || !Cd.lastTimestamp) {
      return interaction.editReply({
        content: `Cooldown resets in: Ready now!\nTrainings left until cooldown: 0/2`
      });
    }

    const Now = new Date();
    const LastTimestamp = new Date(Cd.lastTimestamp);
    const HoursSinceLast = (Now - LastTimestamp) / (1000 * 60 * 60);
    const TodayKey = Now.toISOString().slice(0, 10);
    const UsedToday = Cd.dates?.[TodayKey] || 0;

    if (HoursSinceLast >= 24) {
      return interaction.editReply({
        content: `Cooldown resets in: Ready now!\nTrainings left until cooldown: 0/2`
      });
    }

    const RemainingHours = Math.max(0, Math.floor(24 - HoursSinceLast));
    const TrainingsLeft = `${UsedToday}/2`;

    return interaction.editReply({
      content: `Cooldown resets in: ${RemainingHours}h\nTrainings left until cooldown: ${TrainingsLeft}`
    });
  }
};
