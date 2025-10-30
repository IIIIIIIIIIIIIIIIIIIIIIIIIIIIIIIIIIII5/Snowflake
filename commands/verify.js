const { SlashCommandBuilder } = require('discord.js');
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
        "You're already verified. If you want to switch your account, use /reverify."
      );
    }

    const username = interaction.options.getString('username');
    const userId = await GetRobloxUserId(username);

    const code = 'VERIFY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    startVerification(interaction.user.id, userId, code);

    try {
      await interaction.user.send(
        `Join the Roblox game and enter the code displayed below along with your Discord username:\nYour verification code: ${code}`
      );

      return interaction.editReply({
        content: 'I have sent you a DM with instructions to verify your Roblox account.',
        ephemeral: true
      });
    } catch (err) {
      return interaction.editReply({
        content: 'I could not DM you. Please make sure your DMs are open and try again.',
        ephemeral: true
      });
    }
  }
};
