const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser } = require('../roblox');

const AllowedRole = "1398691449939169331";
const DiscordRoleId = "1402233297786109952";

function ParseDuration(input) {
    const match = input.match(/^(\d+)([smhdwM])$/i);
    if (!match) throw new Error("Invalid duration format");
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, M: 2592000000 };
    return value * multipliers[unit];
}

function FormatDuration(ms) {
    const Seconds = Math.floor(ms / 1000) % 60;
    const Minutes = Math.floor(ms / (60 * 1000)) % 60;
    const Hours = Math.floor(ms / (60 * 60 * 1000)) % 24;
    const Days = Math.floor(ms / (24 * 60 * 60 * 1000)) % 7;
    const Weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) % 4;
    const Months = Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
    let Result = [];
    if (Months) Result.push(`${Months} month${Months > 1 ? 's' : ''}`);
    if (Weeks) Result.push(`${Weeks} week${Weeks > 1 ? 's' : ''}`);
    if (Days) Result.push(`${Days} day${Days > 1 ? 's' : ''}`);
    if (Hours) Result.push(`${Hours} hour${Hours > 1 ? 's' : ''}`);
    if (Minutes) Result.push(`${Minutes} minute${Minutes > 1 ? 's' : ''}`);
    if (Seconds) Result.push(`${Seconds} second${Seconds > 1 ? 's' : ''}`);
    return Result.join(', ') || '0 seconds';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription("Suspend a Roblox user from their rank")
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true))
        .addStringOption(opt => opt.setName('discordid').setDescription('Optional Discord ID to remove roles and give a specific role')),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        if (!interaction.member.roles.cache.has(AllowedRole)) return interaction.reply({ content: "You don't have permission.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = interaction.guild.id;
            const GroupId = Db.ServerConfig?.[GuildId]?.GroupId;
            if (!GroupId) return interaction.editReply({ content: "Group ID not set. Run /config first." });

            const Username = interaction.options.getString('username');
            const Reason = interaction.options.getString('reason');
            const DurationStr = interaction.options.getString('duration');
            const DurationMs = ParseDuration(DurationStr);
            const DiscordIdOption = interaction.options.getString('discordid');

            const UserId = await GetRobloxUserId(Username);
            const CurrentRank = await GetCurrentRank(GroupId, UserId);

            await SuspendUser(GroupId, UserId, interaction.user.id, GuildId, interaction.client, DurationMs);

            Db.Suspensions = Db.Suspensions || {};
            Db.Suspensions[UserId] = {
                username: Username,
                guildId: GuildId,
                reason: Reason,
                issuedBy: interaction.user.id,
                issuedAt: Date.now(),
                endsAt: Date.now() + DurationMs,
                durationStr: DurationStr,
                oldRank: CurrentRank.Name,
                active: true
            };
            await SaveJsonBin(Db);

            const FullDuration = FormatDuration(DurationMs);

            const UserEmbed = new EmbedBuilder()
                .setTitle("YOU HAVE BEEN SUSPENDED")
                .setColor(0xff0000)
                .setDescription(`Dear, **${Username}**, you have been suspended from Snowflake Penitentiary from your rank **${CurrentRank.Name}**\n\nBelow are the details of your suspension:`)
                .addFields(
                    { name: "Username", value: Username, inline: false },
                    { name: "Reason", value: Reason, inline: false },
                    { name: "Duration", value: FullDuration, inline: false },
                    { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)", inline: false }
                );

            const LogEmbed = new EmbedBuilder()
                .setTitle("User Suspended")
                .setColor(0xff0000)
                .addFields(
                    { name: "Username", value: Username, inline: true },
                    { name: "Suspended By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Reason", value: Reason, inline: false },
                    { name: "Duration", value: FullDuration, inline: true }
                )
                .setTimestamp(new Date());

            let TargetDiscordId = DiscordIdOption || Object.keys(Db.VerifiedUsers || {}).find(id => Db.VerifiedUsers[id] === UserId);

            if (TargetDiscordId) {
                const Member = await interaction.guild.members.fetch(TargetDiscordId).catch(() => null);
                if (Member) {
                    const OldRoles = Member.roles.cache.map(r => r.id).filter(id => id !== interaction.guild.id);
                    if (OldRoles.length) await Member.roles.remove(OldRoles).catch(() => {});
                    await Member.roles.add(DISCORD_ROLE_ID).catch(() => {});
                    try { await Member.send({ embeds: [UserEmbed] }); } catch {}
                } else {
                    try {
                        const TargetUser = await interaction.client.users.fetch(TargetDiscordId);
                        await TargetUser.send({ embeds: [UserEmbed] }).catch(() => {});
                    } catch {}
                }
            }

            const LogChannel = await interaction.client.channels.fetch('1433025723932741694').catch(() => null);
            if (LogChannel?.isTextBased()) await LogChannel.send({ embeds: [LogEmbed] });

            await interaction.editReply({ content: `Successfully suspended ${Username}. DM sent to the user.` });

        } catch (Err) {
            return interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
