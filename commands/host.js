const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host a training session')
    .addUserOption(opt => opt.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(opt => opt.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    const allowedRoleId = '1424007337210937445';
    const memberRole = interaction.member.roles.resolve(allowedRoleId);
    if (!memberRole) return interaction.editReply({ content: 'You do not have permission to host a training.' });

    const host = interaction.user;
    const cohost = interaction.options.getUser('cohost');
    const supervisor = interaction.options.getUser('supervisor');

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
