const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const AllowedRoleIds = ['1424007337210937445', '1386369108408406096', '1443622126203572304'];
const TrainingChannelId = '1398706795840536696';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testhost')
    .setDescription('Host a test training session')
    .addUserOption(opt => opt.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(opt => opt.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const Member = interaction.member;
    const CanHost = AllowedRoleIds.some(roleId => Member.roles.cache.has(roleId));
    if (!CanHost) return interaction.editReply({ content: 'You do not have permission to host a training.' });

    const Db = await GetJsonBin();
    Db.Trainings = Db.Trainings || {};

    const Host = interaction.user;
    let CoHost = interaction.options.getUser('cohost');
    let Supervisor = interaction.options.getUser('supervisor');

    const Channel = await interaction.guild.channels.fetch(TrainingChannelId).catch(() => null);
    if (!Channel) return interaction.editReply({ content: 'Training channel not found.' });

    let Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('A TEST TRAINING IS BEING HOSTED')
      .setDescription(
        `Host: <@${Host.id}>\n` +
        `Co-Host: ${CoHost ? `<@${CoHost.id}>` : 'None'}\n` +
        `Supervisor: ${Supervisor ? `<@${Supervisor.id}>` : 'None'}\n\n` +
        `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
      )
      .setTimestamp();

    const Buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('edit').setLabel('Edit').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('end_training').setLabel('End Training').setStyle(ButtonStyle.Success)
    );

    const Message = await Channel.send({ embeds: [Embed], components: [Buttons] });

    const Collector = Message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });

    Collector.on('collect', async btnInteraction => {
      if (btnInteraction.user.id !== Host.id) return btnInteraction.reply({ content: 'Only the host can interact with these buttons.', ephemeral: true });

      if (btnInteraction.customId === 'cancel') {
        await Message.delete().catch(() => {});
        return btnInteraction.reply({ content: 'Test training has been cancelled.', ephemeral: true });
      }

      if (btnInteraction.customId === 'edit') {
        const Modal = new ModalBuilder()
          .setCustomId('edit_training_modal')
          .setTitle('Edit Test Training');

        const CoHostInput = new TextInputBuilder()
          .setCustomId('new_cohost')
          .setLabel('New Co-Host (mention or ID, leave blank to keep)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const SupervisorInput = new TextInputBuilder()
          .setCustomId('new_supervisor')
          .setLabel('New Supervisor (mention or ID, leave blank to keep)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        Modal.addComponents(new ActionRowBuilder().addComponents(CoHostInput));
        Modal.addComponents(new ActionRowBuilder().addComponents(SupervisorInput));

        await btnInteraction.showModal(Modal);
      }

      if (btnInteraction.customId === 'end_training') {
        const MonthKey = new Date().toISOString().slice(0, 7);
        const AddTraining = (Id, Type) => {
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
        await Message.delete().catch(() => {});
        return btnInteraction.reply({ content: 'Test training ended and logged successfully.', ephemeral: true });
      }
    });

    const ModalCollector = Channel.createMessageComponentCollector({ componentType: ComponentType.ModalSubmit, time: 3600000 });

    ModalCollector.on('collect', async modalInteraction => {
      if (modalInteraction.customId !== 'edit_training_modal') return;
      if (modalInteraction.user.id !== Host.id) return modalInteraction.reply({ content: 'Only the host can edit this training.', ephemeral: true });

      const newCoHostInput = modalInteraction.fields.getTextInputValue('new_cohost');
      const newSupervisorInput = modalInteraction.fields.getTextInputValue('new_supervisor');

      if (newCoHostInput) {
        const coHostId = newCoHostInput.replace(/\D/g, '');
        CoHost = await interaction.guild.members.fetch(coHostId).catch(() => null);
      }

      if (newSupervisorInput) {
        const supervisorId = newSupervisorInput.replace(/\D/g, '');
        Supervisor = await interaction.guild.members.fetch(supervisorId).catch(() => null);
      }

      Embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('A TEST TRAINING IS BEING HOSTED')
        .setDescription(
          `Host: <@${Host.id}>\n` +
          `Co-Host: ${CoHost ? `<@${CoHost.id}>` : 'None'}\n` +
          `Supervisor: ${Supervisor ? `<@${Supervisor.id}>` : 'None'}\n\n` +
          `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
        )
        .setTimestamp();

      await Message.edit({ embeds: [Embed] });
      await modalInteraction.reply({ content: 'Test training updated successfully.', ephemeral: true });
    });

    return interaction.editReply({ content: `Test training announcement sent to ${Channel.name}.` });
  }
};
