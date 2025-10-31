const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const { GetRobloxUserId, StartVerification, HandleVerificationButton, GetJsonBin } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    if (db.VerifiedUsers?.[interaction.user.id]) {
      return interaction.editReply(
        "You're already verified. If you want to switch accounts, use `/reverify`."
      );
    }

    try {
      const username = interaction.options.getString('username');
      const userId = await GetRobloxUserId(username);

      const code = 'VERIFY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      StartVerification(interaction.user.id, userId, code);

      const button = new ButtonBuilder()
        .setCustomId('done_verification')
        .setLabel('Done')
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(button);

      await interaction.editReply({
        content: `Put this code in your Roblox profile description:\n\`${code}\`\nThen click the Done button when finished.`,
        components: [row]
      });
    } catch (err) {
      console.error('Verify command error:', err);
      return interaction.editReply({ content: 'Could not verify that Roblox username. Make sure it is valid.' });
    }
  }
};
