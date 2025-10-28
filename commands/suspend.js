const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SuspendUser, GetRobloxUserId, GetCurrentRank, SaveJsonBin, SetRank } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

function parseDuration(input) {
    const match = input.match(/^(\d+)([smhdwM])$/i);
    if (!match) throw new Error("Invalid duration format. Use 1s, 1m, 1h, 1d, 1w, 1M");

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        M: 30 * 24 * 60 * 60 * 1000
    };

    const durationMs = value * multipliers[unit];
    if (durationMs > multipliers.M) throw new Error("Maximum duration is 1 month.");
    if (durationMs < 1000) throw new Error("Minimum duration is 1 second.");
    return durationMs;
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
        if (!interaction.member.roles.cache.has(ALLOWED_ROLE))
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

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

            const embed = new EmbedBuilder()
                .setTitle("User Suspended")
                .setColor(0xff0000)
                .setDescription(`Successfully suspended **${username}** from rank **${currentRank.Name}**.`)
                .addFields(
                    { name: "Reason", value: reason, inline: false },
                    { name: "Duration", value: durationStr, inline: true },
                    { name: "Suspended By", value: `<@${interaction.user.id}>`, inline: true }
                );

            await interaction.editReply({ embeds: [embed] });

            db.Suspensions = db.Suspensions || {};
            db.Suspensions[userId] = {
                username,
                guildId,
                reason,
                issuedBy: interaction.user.id,
                issuedAt: Date.now(),
                endsAt: Date.now() + durationMs,
                oldRank: currentRank.Name,
                durationStr,
                active: true
            };
            await SaveJsonBin(db);

            const targetDiscordId = Object.keys(db.VerifiedUsers || {}).find(id => db.VerifiedUsers[id] === userId);
            if (targetDiscordId) {
                try {
                    const targetUser = await interaction.client.users.fetch(targetDiscordId);
                    await targetUser.send({
                        embeds: [{
                            title: "YOU HAVE BEEN SUSPENDED",
                            color: 0xff0000,
                            fields: [
                                { name: "Username", value: username, inline: true },
                                { name: "Current Rank", value: currentRank.Name, inline: true },
                                { name: "Reason", value: reason, inline: false },
                                { name: "Duration", value: durationStr, inline: true },
                                { name: "Suspended By", value: `<@${interaction.user.id}>`, inline: true }
                            ],
                            description: "You have been suspended from your rank. You may appeal by joining the administration server."
                        }]
                    });
                } catch {}
            }

            setTimeout(async () => {
                const dbCheck = await GetJsonBin();
                const suspension = dbCheck.Suspensions?.[userId];
                if (!suspension || !suspension.active) return;

                suspension.active = false;
                await SaveJsonBin(dbCheck);

                if (targetDiscordId) {
                    try {
                        const targetUser = await interaction.client.users.fetch(targetDiscordId);
                        await targetUser.send({
                            embeds: [{
                                title: "YOUR SUSPENSION HAS ENDED",
                                color: 0x00ff00,
                                fields: [
                                    { name: "Username", value: username, inline: true },
                                    { name: "Restored Rank", value: suspension.oldRank, inline: true },
                                    { name: "Original Duration", value: suspension.durationStr, inline: true }
                                ],
                                description: "Your suspension has ended. Your previous rank has been restored automatically."
                            }]
                        });

                        if (suspension.oldRank)
                            await SetRank(groupId, userId, suspension.oldRank, interaction.user.id, guildId, interaction.client);

                    } catch {}
                }
            }, durationMs).unref();

        } catch (err) {
            console.error(err);
            return interaction.editReply({ content: `Error: ${err.message}` });
        }
    }
};
