const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const SFPLeadershipRole = '1386369108408406096';
const allowedRoleId = '1424007337210937445';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host a training session')
    .addUserOption(opt => opt.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(opt => opt.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const memberRole = interaction.member.roles.resolve(allowedRoleId);
    if (!memberRole && !interaction.member.roles.cache.has(SFPLeadershipRole))
      return interaction.editReply({ content: 'You do not have permission to host a training.' });

    const db = await GetJsonBin();
    const host = interaction.user;
    const cohost = interaction.options.getUser('cohost');
    const supervisor = interaction.options.getUser('supervisor');

    db.Cooldowns = db.Cooldowns || {};
    db.Cooldowns[host.id] = db.Cooldowns[host.id] || { dates: {}, lastTimestamp: null };

    const isExempt = interaction.member.roles.cache.has(SFPLeadershipRole);
    const todayKey = new Date().toISOString().slice(0, 10);
    const userCd = db.Cooldowns[host.id];
    const usedToday = userCd.dates[todayKey] || 0;

    if (!isExempt && usedToday >= 2) {
      return interaction.editReply({
        content: `You have hosted 2 times today.\nCooldown ends: ${userCd.lastTimestamp || 'N/A'}`
      });
    }

    userCd.dates[todayKey] = usedToday + 1;
    userCd.lastTimestamp = new Date().toLocaleString();

    const channelId = '1398706795840536696';
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.editReply({ content: 'Channel not found.' });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('A TRAINING IS BEING HOSTED')
      .setDescription(
        `Host: <@${host.id}>\n` +
        `Co-Host: ${cohost ? `<@${cohost.id}>` : 'None'}\n` +
        `Supervisor: ${supervisor ? `<@${supervisor.id}>` : 'None'}\n` +
        `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
      );

    await channel.send({ content: '<@&1404500986633916479>', embeds: [embed] });

    const monthKey = new Date().toISOString().slice(0, 7);
    const addTraining = (id, type) => {
      db.Trainings = db.Trainings || {};
      db.Trainings[id] = db.Trainings[id] || { hosted: {}, cohosted: {}, supervised: {} };
      const section = db.Trainings[id][type];
      if (section.lastMonth !== monthKey) {
        section[monthKey] = 0;
        section.lastMonth = monthKey;
      }
      section[monthKey] = (section[monthKey] || 0) + 1;
      section.total = (section.total || 0) + 1;
    };

    addTraining(host.id, 'hosted');
    if (cohost) addTraining(cohost.id, 'cohosted');
    if (supervisor) addTraining(supervisor.id, 'supervised');

    await SaveJsonBin(db);

    return interaction.editReply({ content: `Training announcement sent to ${channel.name}.` });
  }
};
