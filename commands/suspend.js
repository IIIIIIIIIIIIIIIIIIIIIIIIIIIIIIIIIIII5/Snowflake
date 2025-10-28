const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

function parseDuration(input) {
    const match = input.match(/^(\d+)([smhdwM])$/i);
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, M: 2592000000 };
    return value * multipliers[unit];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription("Suspend a Roblox user from their rank")
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true)),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        try {
            const db = await GetJsonBin();
            const guildId = interaction.guild.id;
            const groupId = db.ServerConfig?.[guildId]?.GroupId;
            if (!groupId) return interaction.editReply({ content: "Group ID not set. Run /config first." });

            const username = interaction.options.getString('username');
            const reason = interaction.options.getString('reason');
            const durationStr = interaction.options.getString('duration');
            const durationMs = parseDuration(durationStr);

            const userId = await GetRobloxUserId(username);
            const currentRank = await GetCurrentRank(groupId, userId);

            await SuspendUser(groupId, userId, interaction.user.id, guildId, interaction.client);

            db.Suspensions = db.Suspensions || {};
            db.Suspensions[userId] = {
                username,
                guildId,
                reason,
                issuedBy: interaction.user.id,
                issuedAt: Date.now(),
                endsAt: Date.now() + durationMs,
                durationStr,
                oldRank: currentRank.Name,
                active: true
            };
            await SaveJsonBin(db);

            const userEmbed = new EmbedBuilder()
                .setTitle("YOU HAVE BEEN SUSPENDED")
                .setColor(0xff0000)
                .setDescription(`Dear, **${username}**, you have been suspended from Snowflake Penitentiary from your rank **${currentRank.Name}**\n\nBelow are the details of your suspension:`)
                .addFields(
                    { name: "Username", value: username, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Duration", value: durationStr, inline: true },
                    { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)", inline: false }
                );

            const logEmbed = new EmbedBuilder()
                .setTitle("User Suspended")
                .setColor(0xff0000)
                .addFields(
                    { name: "Username", value: username, inline: true },
                    { name: "Suspended By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Duration", value: durationStr, inline: true }
                )
                .setTimestamp(new Date());

            const targetDiscordId = Object.keys(db.VerifiedUsers || {}).find(id => db.VerifiedUsers[id] === userId);
            if (targetDiscordId) {
                try {
                    const targetUser = await interaction.client.users.fetch(targetDiscordId);
                    await targetUser.send({ embeds: [userEmbed] });
                } catch {}
            }

            const logChannel = await interaction.client.channels.fetch('1424381038393556992').catch(() => null);
            if (logChannel?.isTextBased()) await logChannel.send({ embeds: [logEmbed] });

            await interaction.editReply({ content: `Successfully suspended ${username}. DM sent to the user.` });

        } catch (err) {
            return interaction.editReply({ content: `Error: ${err.message}` });
        }
    }
};
