const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fetch = require('node-fetch');

const API_URL = process.env.VERIFY_API_URL;
const API_KEY = process.env.AUTHKEY;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const robloxUsername = interaction.options.getString('username');

    const res = await fetch(`${API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ discordUsername: interaction.user.username, robloxUsername })
    });
    const data = await res.json();
    if (!data.success) return interaction.editReply({ content: 'Failed to generate code', ephemeral: true });

    const code = data.code;

    const button = new ButtonBuilder()
      .setCustomId('submit_code')
      .setLabel('Enter Code')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);

    await interaction.editReply({
      content: `Join the [Roblox game](${process.env.VERIFY_GAME_URL}) to see your code.`,
      components: [row],
      ephemeral: true
    });

    const filter = i => i.customId === 'submit_code' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 5 * 60 * 1000, max: 1 });

    collector.on('collect', async btnInteraction => {
      const modal = new ModalBuilder()
        .setCustomId('submit_verification_code')
        .setTitle('Enter Verification Code')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('verification_code')
              .setLabel('Enter the code displayed in Roblox')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await btnInteraction.showModal(modal);
    });

    const modalFilter = i => i.type === InteractionType.ModalSubmit && i.customId === 'submit_verification_code' && i.user.id === interaction.user.id;
    const modalCollector = interaction.channel.createMessageComponentCollector({ filter: modalFilter, time: 5 * 60 * 1000 });

    modalCollector.on('collect', async modalInteraction => {
      const enteredCode = modalInteraction.fields.getTextInputValue('verification_code');

      const submitRes = await fetch(`${API_URL}/verify/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ code: enteredCode })
      });
      const submitData = await submitRes.json();

      if (submitData.success) return modalInteraction.reply({ content: `Verified! Linked Roblox ID: ${submitData.robloxId}`, ephemeral: true });
      return modalInteraction.reply({ content: 'Invalid code. Please try again.', ephemeral: true });
    });
  }
};
