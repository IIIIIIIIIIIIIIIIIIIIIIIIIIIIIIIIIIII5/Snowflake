const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');
const { GetRobloxUserId, startVerification, GetJsonBin, SaveJsonBin } = require('../roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Switch your linked Roblox account')
    .addStringOption(opt => opt.setName('username').setDescription('Your new Roblox username').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username');
    const userId = await GetRobloxUserId(username);

    const dbData = await GetJsonBin();
    dbData.VerifiedUsers = dbData.VerifiedUsers || {};
    if (dbData.VerifiedUsers[interaction.user.id]) delete dbData.VerifiedUsers[interaction.user.id];
    await SaveJsonBin(dbData);

    const code = 'VERIFY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    startVerification(interaction.user.id, userId, code);

    try {
      await interaction.user.send(
        `Join the Roblox game and enter the code displayed below along with your Discord username:\nYour new verification code: ${code}`
      );

      return interaction.editReply({
        content: 'I have sent you a DM with your new verification code.',
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
