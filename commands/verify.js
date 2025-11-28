const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Crypto = require('crypto');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

async function CreateOAuthState(DiscordId) {
    const State = Crypto.randomBytes(16).toString('hex');
    await fetch(`${process.env.WORKER_BASE_URL}/store-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            state: State,
            discordId: DiscordId,
            secret: process.env.WORKER_SHARED_SECRET
        })
    });
    return State;
}

function GetOAuthUrl(State) {
    return `https://apis.roblox.com/oauth/v1/authorize?client_id=${process.env.ROBLOX_CLIENT_ID}` +
           `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
           `&scope=openid+profile&response_type=code&state=${State}`;
}

async function FinalizeVerification(DiscordId, RobloxId, RobloxName) {
    const Db = await GetJsonBin();
    Db.VerifiedUsers = Db.VerifiedUsers || {};
    Db.VerifiedUsers[DiscordId] = { RobloxId, RobloxName };
    await SaveJsonBin(Db);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your Roblox account via OAuth'),

    execute: async function(Interaction) {
        await Interaction.deferReply({ ephemeral: true });
        const State = await CreateOAuthState(Interaction.user.id);
        const Url = GetOAuthUrl(State);

        const Row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Verify via Roblox")
                .setStyle(ButtonStyle.Link)
                .setURL(Url)
        );

        return Interaction.editReply({
            content: "Click the button below to verify your Roblox account via OAuth:",
            components: [Row]
        });
    },

    FinalizeVerification
};
