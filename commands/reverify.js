const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fetch = require('node-fetch');

const API_URL = process.env.VERIFY_API_URL;
const API_KEY = process.env.AUTHKEY;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Switch your linked Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your new Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const robloxUsername = interaction.options.getString('username');

    const db = await require('../roblox').GetJsonBin();
    db.VerifiedUsers = db.VerifiedUsers || {};
    if (db.VerifiedUsers[interaction.user.id]) delete db.VerifiedUsers[interaction.user.id];
    await require('../roblox').SaveJsonBin(db);

    const res = await fetch(`${API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ discordUsername: interaction.user.username, robloxUsername })
    });
    const data = await res.json();
    if (!data.success) return interaction.editReply({ content: 'Failed to generate code', ephemeral: true });

    const button = new ButtonBuilder()
      .setCustomId('submit_reverification_code')
      .setLabel('Enter Code')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.editReply({
      content: `Join the [Roblox game](${process.env.VERIFY_GAME_URL}) to see your new verification code.`,
      components: [row],
      ephemeral: true
    });

    const filter = i => i.customId === 'submit_reverification_code' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 5 * 60 * 1000, max: 1 });

    collector.on('collect', async btnInteraction => {
      const modal = new ModalBuilder()
        .setCustomId('submit_verification_code_modal')
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

    const modalFilter = i => i.type === InteractionType.ModalSubmit && i.customId === 'submit_verification_code_modal' && i.user.id === interaction.user.id;
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
