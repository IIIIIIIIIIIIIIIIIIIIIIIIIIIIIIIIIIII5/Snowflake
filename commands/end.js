const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endtraining')
    .setDescription('Delete your training message'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const host = interaction.user;
    const channel = interaction.channel;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return interaction.editReply({ content: 'No messages found in this channel.' });

    const trainingMessage = messages.find(
      m => m.embeds.length > 0 &&
           m.embeds[0].title === 'A TRAINING IS BEING HOSTED' &&
           m.embeds[0].description.includes(`<@${host.id}>`)
    );

    if (!trainingMessage) {
      return interaction.editReply({ content: 'No training embed found for you in this channel.' });
    }

    await trainingMessage.delete().catch(() => null);

    return interaction.editReply({ content: 'Your training announcement has been deleted.' });
  }
};
