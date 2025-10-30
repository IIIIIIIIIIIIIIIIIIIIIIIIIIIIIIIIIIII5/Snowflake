const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fetch = require('node-fetch');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const API_URL = process.env.VERIFY_API_URL;
const API_KEY = process.env.AUTHKEY;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Switch your linked Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your new Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username');

    const db = await GetJsonBin();
    db.VerifiedUsers = db.VerifiedUsers || {};
    if (db.VerifiedUsers[interaction.user.id]) delete db.VerifiedUsers[interaction.user.id];
    await SaveJsonBin(db);

    const button = new ButtonBuilder()
      .setCustomId('start_reverification')
      .setLabel('Start Reverification')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.editReply({
      content: `Click the button to start reverification for **${username}**. Join the [Roblox game](${process.env.VERIFY_GAME_URL}) to see your new code.`,
      components: [row],
      ephemeral: true
    });

    const filter = i => i.customId === 'start_reverification' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 5 * 60 * 1000, max: 1 });

    collector.on('collect', async btnInteraction => {
      await fetch(`${API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ discordUsername: interaction.user.username, robloxUsername: username })
      });

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
      const code = modalInteraction.fields.getTextInputValue('verification_code');

      const response = await fetch(`${API_URL}/verify/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ code })
      });

      const data = await response.json();
      if (data.success) return modalInteraction.reply({ content: `Verified! Linked to Roblox ID: ${data.robloxId}`, ephemeral: true });
      return modalInteraction.reply({ content: `Invalid code. Please try again.`, ephemeral: true });
    });
  }
};
