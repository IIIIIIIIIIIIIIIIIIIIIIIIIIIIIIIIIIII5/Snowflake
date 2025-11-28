const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Switch your linked Roblox account'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const state = crypto.randomBytes(16).toString("hex");

    await fetch(`${process.env.WORKER_BASE_URL}/store-state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        discordId: interaction.user.id,
        secret: process.env.WORKER_SHARED_SECRET
      })
    });

    const url =
      `https://apis.roblox.com/oauth/v1/authorize?` +
      `client_id=${process.env.ROBLOX_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
      `&scope=openid+profile` +
      `&response_type=code` +
      `&state=${state}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Reverify via Roblox")
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    );

    return interaction.editReply({
      content: "Click the button below to switch your linked Roblox account via OAuth:",
      components: [row]
    });
  }
};
