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
    const CanHost = AllowedRoleIds.some(id => Member.roles.cache.has(id));
    if (!CanHost) return interaction.editReply({ content: 'You do not have permission to host a training.' });

    const Db = await GetJsonBin();
    Db.Trainings = Db.Trainings || {};

    const Host = interaction.user;
    let CoHost = interaction.options.getUser('cohost');
    let Supervisor = interaction.options.getUser('supervisor');

    const Channel = await interaction.guild.channels.fetch(TrainingChannelId).catch(() => null);
    if (!Channel) return interaction.editReply({ content: 'Training channel not found.' });

    const buildEmbed = () =>
      new EmbedBuilder()
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
      new ButtonBuilder().setCustomId('test_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('test_edit').setLabel('Edit').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('test_end').setLabel('End Training').setStyle(ButtonStyle.Success)
    );

    const Message = await Channel.send({ embeds: [buildEmbed()], components: [Buttons] });

    const Collector = Message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 3600000
    });

    Collector.on('collect', async btn => {
      if (btn.user.id !== Host.id) {
        return btn.reply({ content: 'Only the host can use these buttons.', ephemeral: true });
      }

      if (btn.customId === 'test_cancel') {
        await btn.deferUpdate();
        await Message.delete().catch(() => {});
        await btn.followUp({ content: 'Test training cancelled.', ephemeral: true });
        Collector.stop();
      }

      if (btn.customId === 'test_edit') {
        const Modal = new ModalBuilder()
          .setCustomId('test_edit_modal')
          .setTitle('Edit Test Training');

        const CoHostInput = new TextInputBuilder()
          .setCustomId('new_cohost')
          .setLabel('New Co-Host (mention or ID)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const SupervisorInput = new TextInputBuilder()
          .setCustomId('new_supervisor')
          .setLabel('New Supervisor (mention or ID)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        Modal.addComponents(
          new ActionRowBuilder().addComponents(CoHostInput),
          new ActionRowBuilder().addComponents(SupervisorInput)
        );

        await btn.showModal(Modal);

        const modal = await btn.awaitModalSubmit({
          time: 300000,
          filter: m => m.customId === 'test_edit_modal' && m.user.id === Host.id
        }).catch(() => null);

        if (!modal) return;

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
        await modal.reply({ content: 'Test training updated.', ephemeral: true });
      }

      if (btn.customId === 'test_end') {
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
        await btn.followUp({ content: 'Test training ended and logged.', ephemeral: true });
        Collector.stop();
      }
    });

    return interaction.editReply({ content: `Test training announcement sent to ${Channel.name}.` });
  }
};
