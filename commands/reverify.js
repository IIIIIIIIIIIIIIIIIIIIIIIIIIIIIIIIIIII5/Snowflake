const { SlashCommandBuilder } = require('discord.js');
const { startVerification, GetJsonBin, SaveJsonBin } = require('../roblox');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Switch your linked Roblox account'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const dbData = await GetJsonBin();
    dbData.VerifiedUsers = dbData.VerifiedUsers || {};
    if (dbData.VerifiedUsers[interaction.user.id]) delete dbData.VerifiedUsers[interaction.user.id];
    await SaveJsonBin(dbData);

    const code = 'VERIFY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    startVerification(interaction.user.id, null, code);

    return interaction.editReply({
      content: "Join the Roblox game. The game will generate a new code for you. Once you see it, enter it in Discord to complete verification.",
      ephemeral: true
    });
  }
};
