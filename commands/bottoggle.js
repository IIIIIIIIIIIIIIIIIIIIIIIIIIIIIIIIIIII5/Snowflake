const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bottoggle')
    .setDescription('Turn the bot on or off')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Choose to turn the bot on or off')
        .setRequired(true)
        .addChoices(
          { name: 'on', value: 'on' },
          { name: 'off', value: 'off' }
        )),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (interaction.user.id !== process.env.ADMIN_ID) {
      return interaction.editReply({ content: 'You do not have permission to use this command.' });
    }

    const mode = interaction.options.getString('mode');
    interaction.client.botActive = mode === 'on';
    return interaction.editReply({ content: `Bot is now turned **${mode.toUpperCase()}**.` });
  }
};
