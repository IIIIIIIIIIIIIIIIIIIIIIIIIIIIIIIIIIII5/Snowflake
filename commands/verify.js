const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const { GetRobloxUserId, startVerification, isUserVerified } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const alreadyVerified = await isUserVerified(interaction.user.id);
    if (alreadyVerified) {
      return interaction.editReply(
        "You're already verified. If you want to switch your account, use `/reverify`."
      );
    }

    const username = interaction.options.getString('username');
    const userId = await GetRobloxUserId(username);

    const code = 'VERIFY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    startVerification(interaction.user.id, userId, code);

    const button = new ButtonBuilder()
      .setCustomId('done_verification')
      .setLabel('Done')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);

    return interaction.editReply({
      content: `Put this code in your Roblox profile description:\n${code}\nThen click the Done button when finished.`,
      components: [row]
    });
  }
};
