const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, SetRank } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (60 * 1000)) % 60;
    const hours = Math.floor(ms / (60 * 60 * 1000)) % 24;
    const days = Math.floor(ms / (24 * 60 * 60 * 1000)) % 7;
    const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) % 4;
    const months = Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
    let result = [];
    if (months) result.push(`${months} month${months > 1 ? 's' : ''}`);
    if (weeks) result.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
    if (days) result.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours) result.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes) result.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    if (seconds) result.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
    return result.join(', ') || '0 seconds';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsuspend')
        .setDescription("Remove a user's suspension")
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username to unsuspend').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ending the suspension').setRequired(true)),

    async execute(interaction) {
        const GuildId = interaction.guild.id;
        if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) return interaction.reply({ content: "You don't have permission.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        try {
            const db = await GetJsonBin();
            if (!db.ServerConfig?.[GuildId]?.GroupId) return interaction.editReply({ content: "Group ID not set. Run /config first." });

            const username = interaction.options.getString('username');
            const reason = interaction.options.getString('reason');
            const UserId = await GetRobloxUserId(username);

            const suspension = db.Suspensions?.[UserId];
            if (!suspension || !suspension.active) return interaction.editReply({ content: `${username} is not currently suspended.` });

            suspension.active = false;
            await SaveJsonBin(db);

            const durationStr = suspension.issuedAt && suspension.endsAt ? formatDuration(suspension.endsAt - suspension.issuedAt) : 'N/A';

            const userEmbed = new EmbedBuilder()
                .setTitle("YOUR SUSPENSION HAS ENDED EARLY")
                .setColor(0x00ff00)
                .setDescription(`Dear, **${username}**, your suspension which was issued on ${new Date(suspension.issuedAt).toLocaleDateString()} has ended early\n\nBelow are the details of your suspension:`)
                .addFields(
                    { name: "Username", value: username, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Duration", value: durationStr, inline: true },
                    { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)", inline: false }
                );

            const logEmbed = new EmbedBuilder()
                .setTitle("User Unsuspended")
                .setColor(0x00ff00)
                .addFields(
                    { name: "Username", value: username, inline: true },
                    { name: "Unsuspended By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Duration", value: durationStr, inline: true }
                )
                .setTimestamp(new Date());

            if (suspension.oldRank)
                await SetRank(db.ServerConfig[GuildId].GroupId, UserId, suspension.oldRank, interaction.user.id, GuildId, interaction.client);

            const targetDiscordId = Object.keys(db.VerifiedUsers || {}).find(id => db.VerifiedUsers[id] === UserId);
            if (targetDiscordId) {
                try {
                    const targetUser = await interaction.client.users.fetch(targetDiscordId);
                    await targetUser.send({ embeds: [userEmbed] });
                } catch {}
            }

            const logChannel = await interaction.client.channels.fetch('1424381038393556992').catch(() => null);
            if (logChannel?.isTextBased()) await logChannel.send({ embeds: [logEmbed] });

            await interaction.editReply({ content: `Successfully unsuspended ${username}. DM sent to the user.` });

        } catch (err) {
            return interaction.editReply({ content: `Error: ${err.message}` });
        }
    }
};
