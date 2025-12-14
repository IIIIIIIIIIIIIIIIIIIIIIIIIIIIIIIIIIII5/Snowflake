const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const AllowedRoleIds = ['1424007337210937445', '1386369108408406096', '1443622126203572304'];
const SFPLeadershipRole = '1424007337210937445';
const TrainingChannelId = '1398706795840536696';
const MentionRoleId = '1404500986633916479';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host a training session')
    .addUserOption(o => o.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(o => o.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!AllowedRoleIds.some(id => interaction.member.roles.cache.has(id))) {
      return interaction.editReply({ content: 'You do not have permission to host a training.' });
    }

    const Db = await GetJsonBin();
    Db.Cooldowns = Db.Cooldowns || {};
    Db.Certifications = Db.Certifications || {};
    Db.Trainings = Db.Trainings || {};

    const Host = interaction.user;
    let CoHost = interaction.options.getUser('cohost');
    let Supervisor = interaction.options.getUser('supervisor');

    const IsLeadership = interaction.member.roles.cache.has(SFPLeadershipRole);
    const Certs = Db.Certifications[Host.id] || [];

    if (!IsLeadership && !Certs.includes('Certified Host') && !Supervisor) {
      return interaction.editReply({ content: 'You are not certified to host without a supervisor.' });
    }

    const Channel = await interaction.guild.channels.fetch(TrainingChannelId).catch(() => null);
    if (!Channel) return interaction.editReply({ content: 'Training channel not found.' });

    const buildEmbed = () =>
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('A TRAINING IS BEING HOSTED')
        .setDescription(
          `Host: <@${Host.id}>\n` +
          `Co-Host: ${CoHost ? `<@${CoHost.id}>` : 'None'}\n` +
          `Supervisor: ${Supervisor ? `<@${Supervisor.id}>` : 'None'}\n\n` +
          `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('host_edit').setLabel('Edit').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('host_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('host_end').setLabel('End Training').setStyle(ButtonStyle.Success)
    );

    const Message = await Channel.send({ content: `<@&${MentionRoleId}>`, embeds: [buildEmbed()], components: [row] });

    const Collector = Message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });

    Collector.on('collect', async btn => {
      if (btn.user.id !== Host.id) return btn.reply({ content: 'Only the host can use these buttons.', ephemeral: true });

      if (btn.customId === 'host_cancel') {
        await btn.deferUpdate();
        await Message.delete().catch(() => {});
        await btn.followUp({ content: 'Training cancelled.', ephemeral: true });
        Collector.stop();
      }

      if (btn.customId === 'host_edit') {
        const modal = new ModalBuilder()
          .setCustomId(`host_edit_${Message.id}`)
          .setTitle('Edit Training')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('new_cohost').setLabel('New Co-Host (mention or ID)').setStyle(TextInputStyle.Short).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('new_supervisor').setLabel('New Supervisor (mention or ID)').setStyle(TextInputStyle.Short).setRequired(false)
            )
          );

        await btn.showModal(modal);
      }

      if (btn.customId === 'host_end') {
        await btn.deferUpdate();

        const MonthKey = new Date().toISOString().slice(0, 7);
        const add = (id, type) => {
          Db.Trainings[id] = Db.Trainings[id] || { hosted: {}, cohosted: {}, supervised: {} };
          const sec = Db.Trainings[id][type];
          sec[MonthKey] = (sec[MonthKey] || 0) + 1;
          sec.total = (sec.total || 0) + 1;
        };

        add(Host.id, 'hosted');
        if (CoHost) add(CoHost.id, 'cohosted');
        if (Supervisor) add(Supervisor.id, 'supervised');

        await SaveJsonBin(Db);
        await Message.delete().catch(() => {});
        await btn.followUp({ content: 'Training ended and logged.', ephemeral: true });
        Collector.stop();
      }
    });

    interaction.client.on('interactionCreate', async modal => {
      if (!modal.isModalSubmit()) return;
      if (modal.customId !== `host_edit_${Message.id}`) return;
      if (modal.user.id !== Host.id) return;

      const co = modal.fields.getTextInputValue('new_cohost');
      const sup = modal.fields.getTextInputValue('new_supervisor');

      if (co) {
        const id = co.replace(/\D/g, '');
        CoHost = await interaction.guild.members.fetch(id).then(m => m.user).catch(() => null);
      }

      if (sup) {
        const id = sup.replace(/\D/g, '');
        Supervisor = await interaction.guild.members.fetch(id).then(m => m.user).catch(() => null);
      }

      await Message.edit({ embeds: [buildEmbed()] });
      await modal.reply({ content: 'Training updated.', ephemeral: true });
    });

    return interaction.editReply({ content: `Training announcement sent to ${Channel.name}.` });
  }
};
