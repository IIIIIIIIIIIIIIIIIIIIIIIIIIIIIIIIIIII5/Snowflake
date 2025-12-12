const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const AllowedRoleIds = ["1443622126203572304", "1424007337210937445", "1386369108408406096"];
const TrainingChannelId = '1398706795840536696';
const MentionRoleId = '1404500986633916479';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host a training session')
    .addUserOption(opt => opt.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(opt => opt.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const Member = interaction.member;
    const CanHost = AllowedRoleIds.some(roleId => Member.roles.cache.has(roleId));
    if (!CanHost) return interaction.editReply({ content: 'You do not have permission to host a training.' });

    const Db = await GetJsonBin();
    Db.Cooldowns = Db.Cooldowns || {};
    Db.Certifications = Db.Certifications || {};

    const Host = interaction.user;
    const CoHost = interaction.options.getUser('cohost');
    const Supervisor = interaction.options.getUser('supervisor');

    const UserId = Host.id;
    const Now = new Date();
    const TodayKey = Now.toISOString().slice(0, 10);
    const IsLeadership = Member.roles.cache.has(SFPLeadershipRole);
    const Certifications = Db.Certifications[UserId] || [];
    const IsCertifiedHost = Certifications.includes('Certified Host');

    if (!IsCertifiedHost && !IsLeadership && !Supervisor) {
      return interaction.editReply({ content: 'User is not certified to host without a supervisor.' });
    }

    Db.Cooldowns[UserId] = Db.Cooldowns[UserId] || { dates: {}, lastTimestamp: null };
    const UserCd = Db.Cooldowns[UserId];
    UserCd.dates = UserCd.dates || {};

    const LastTimestamp = UserCd.lastTimestamp ? new Date(UserCd.lastTimestamp) : null;
    const HoursSinceLast = LastTimestamp ? (Now - LastTimestamp) / (1000 * 60 * 60) : Infinity;

    if (HoursSinceLast >= 24) UserCd.dates = {};

    const UsedToday = UserCd.dates[TodayKey] || 0;

    if (!IsLeadership && UsedToday >= 2) {
      const NextReset = 24 - Math.floor(HoursSinceLast > 0 && HoursSinceLast < 24 ? HoursSinceLast : 0);
      return interaction.editReply({ content: `You have hosted 2 trainings today.\nCooldown resets in: ${NextReset}h` });
    }

    UserCd.dates[TodayKey] = UsedToday + 1;
    UserCd.lastTimestamp = Now.toISOString();

    const Channel = await interaction.guild.channels.fetch(TrainingChannelId).catch(() => null);
    if (!Channel) return interaction.editReply({ content: 'Training channel not found.' });

    const Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('A TRAINING IS BEING HOSTED')
      .setDescription(
        `Host: <@${Host.id}>\n` +
        `Co-Host: ${CoHost ? `<@${CoHost.id}>` : 'None'}\n` +
        `Supervisor: ${Supervisor ? `<@${Supervisor.id}>` : 'None'}\n\n` +
        `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
      )
      .setTimestamp();

    await Channel.send({ content: `<@&${MentionRoleId}>`, embeds: [Embed] });

    const MonthKey = Now.toISOString().slice(0, 7);
    const AddTraining = (Id, Type) => {
      Db.Trainings = Db.Trainings || {};
      Db.Trainings[Id] = Db.Trainings[Id] || { hosted: {}, cohosted: {}, supervised: {} };
      const Section = Db.Trainings[Id][Type];
      if (Section.lastMonth !== MonthKey) {
        Section[MonthKey] = 0;
        Section.lastMonth = MonthKey;
      }
      Section[MonthKey] = (Section[MonthKey] || 0) + 1;
      Section.total = (Section.total || 0) + 1;
    };

    AddTraining(Host.id, 'hosted');
    if (CoHost) AddTraining(CoHost.id, 'cohosted');
    if (Supervisor) AddTraining(Supervisor.id, 'supervised');

    await SaveJsonBin(Db);

    return interaction.editReply({ content: `Training announcement sent to ${Channel.name}.` });
  }
};
