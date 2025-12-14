const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const AllowedRoleIds = ['1424007337210937445', '1386369108408406096', '1443622126203572304'];
const TrainingChannelId = '1398706795840536696';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testhost')
    .setDescription('Host a simplified test training session')
    .addUserOption(opt => opt.setName('cohost').setDescription('Co-host (optional)'))
    .addUserOption(opt => opt.setName('supervisor').setDescription('Supervisor (optional)')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const Member = interaction.member;
    if (!AllowedRoleIds.some(r => Member.roles.cache.has(r))) 
      return interaction.editReply({ content: 'You cannot host a training.' });

    const Db = await GetJsonBin();
    Db.Trainings = Db.Trainings || {};

    const Host = interaction.user;
    let CoHost = interaction.options.getUser('cohost');
    let Supervisor = interaction.options.getUser('supervisor');

    const Channel = await interaction.guild.channels.fetch(TrainingChannelId);
    if (!Channel) return interaction.editReply({ content: 'Training channel not found.' });

    const Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('TEST TRAINING')
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

    Collector.on('collect', async i => {
      if (i.user.id !== Host.id) {
        await i.deferUpdate().catch(() => {});
        return i.followUp({ content: 'Only host can use these buttons.', ephemeral: true }).catch(() => {});
      }

      if (i.customId === 'cancel') {
        await i.deferUpdate().catch(() => {});
        await Message.delete().catch(() => {});
        return i.followUp({ content: 'Test training cancelled.', ephemeral: true }).catch(() => {});
      }

      if (i.customId === 'edit') {
        const Modal = new ModalBuilder()
          .setCustomId('edit_training_modal')
          .setTitle('Edit Training');

        const CoHostInput = new TextInputBuilder()
          .setCustomId('new_cohost')
          .setLabel('New Co-Host (mention/ID, leave blank to keep)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const SupervisorInput = new TextInputBuilder()
          .setCustomId('new_supervisor')
          .setLabel('New Supervisor (mention/ID, leave blank to keep)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        Modal.addComponents(new ActionRowBuilder().addComponents(CoHostInput));
        Modal.addComponents(new ActionRowBuilder().addComponents(SupervisorInput));

        return i.showModal(Modal);
      }

      if (i.customId === 'end_training') {
        await i.deferUpdate().catch(() => {});
        const MonthKey = new Date().toISOString().slice(0, 7);
        const AddTraining = (Id, Type) => {
          Db.Trainings[Id] = Db.Trainings[Id] || { hosted: {}, cohosted: {}, supervised: {} };
          const Section = Db.Trainings[Id][Type];
          Section[MonthKey] = (Section[MonthKey] || 0) + 1;
          Section.total = (Section.total || 0) + 1;
        };

        AddTraining(Host.id, 'hosted');
        if (CoHost) AddTraining(CoHost.id, 'cohosted');
        if (Supervisor) AddTraining(Supervisor.id, 'supervised');

        await SaveJsonBin(Db);
        await Message.delete().catch(() => {});
        return i.followUp({ content: 'Test training ended.', ephemeral: true }).catch(() => {});
      }
    });

    const ModalCollector = Channel.createMessageComponentCollector({ componentType: ComponentType.ModalSubmit, time: 3600000 });

    ModalCollector.on('collect', async m => {
      if (m.customId !== 'edit_training_modal' || m.user.id !== Host.id) 
        return m.reply({ content: 'Only host can edit.', ephemeral: true }).catch(() => {});

      await m.deferReply({ ephemeral: true }).catch(() => {});

      const newCoHost = m.fields.getTextInputValue('new_cohost');
      const newSupervisor = m.fields.getTextInputValue('new_supervisor');

      if (newCoHost) {
        const coHostId = newCoHost.replace(/\D/g, '');
        CoHost = await interaction.guild.members.fetch(coHostId).catch(() => null);
      }
      if (newSupervisor) {
        const supId = newSupervisor.replace(/\D/g, '');
        Supervisor = await interaction.guild.members.fetch(supId).catch(() => null);
      }

      const UpdatedEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('TEST TRAINING')
        .setDescription(
          `Host: <@${Host.id}>\n` +
          `Co-Host: ${CoHost ? `<@${CoHost.id}>` : 'None'}\n` +
          `Supervisor: ${Supervisor ? `<@${Supervisor.id}>` : 'None'}\n\n` +
          `[Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
        )
        .setTimestamp();

      await Message.edit({ embeds: [UpdatedEmbed] }).catch(() => {});
      await m.editReply({ content: 'Training updated.' }).catch(() => {});
    });

    return interaction.editReply({ content: `Test training sent to ${Channel.name}.` }).catch(() => {});
  }
};
