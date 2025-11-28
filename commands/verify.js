const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

async function createOAuthState(discordId) {
    const state = crypto.randomBytes(16).toString('hex');
    await fetch(`${process.env.WORKER_BASE_URL}/store-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            state,
            discordId,
            secret: process.env.WORKER_SHARED_SECRET
        })
    });
    return state;
}

function getOAuthUrl(state) {
    return `https://apis.roblox.com/oauth/v1/authorize?client_id=${process.env.ROBLOX_CLIENT_ID}` +
           `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
           `&scope=openid+profile&response_type=code&state=${state}`;
}

async function finalizeVerification(discordId, robloxId, robloxName) {
    const db = await GetJsonBin();
    db.VerifiedUsers = db.VerifiedUsers || {};
    db.VerifiedUsers[discordId] = { robloxId };
    await SaveJsonBin(db);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your Roblox account via OAuth'),
    execute: async function(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const state = await createOAuthState(interaction.user.id);
        const url = getOAuthUrl(state);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Verify via Roblox")
                .setStyle(ButtonStyle.Link)
                .setURL(url)
        );
        return interaction.editReply({
            content: "Click the button below to verify your Roblox account via OAuth:",
            components: [row]
        });
    },
    FinalizeVerification: finalizeVerification
};
