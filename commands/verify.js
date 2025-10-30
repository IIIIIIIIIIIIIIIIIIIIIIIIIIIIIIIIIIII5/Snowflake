const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({
      content: "Join the Roblox game. The game will generate a unique code for you. Once you see it, enter it in Discord to complete verification.",
      ephemeral: true
    });
  }
};
