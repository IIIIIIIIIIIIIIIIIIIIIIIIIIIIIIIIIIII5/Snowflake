const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, SetRank } = require('../roblox');

const AllowedRole = "1398691449939169331";
const SfpLeadershipRole = "1386369108408406096";
const DiscordRoleId = "1402233297786109952";
const SuspensionLogChannelId = "1433025723932741694";

function FormatDuration(Ms) {
    const Seconds = Math.floor(Ms / 1000) % 60;
    const Minutes = Math.floor(Ms / (60 * 1000)) % 60;
    const Hours = Math.floor(Ms / (60 * 60 * 1000)) % 24;
    const Days = Math.floor(Ms / (24 * 60 * 60 * 1000)) % 7;
    const Weeks = Math.floor(Ms / (7 * 24 * 60 * 60 * 1000)) % 4;
    const Months = Math.floor(Ms / (30 * 24 * 60 * 60 * 1000));
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
        .setName('unsuspend')
        .setDescription('Remove a user\'s suspension')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username to unsuspend').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ending the suspension').setRequired(true))
        .addStringOption(opt => opt.setName('discordid').setDescription('Optional Discord ID to DM / role-manage')),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(AllowedRole) && !interaction.member.roles.cache.has(SfpLeadershipRole)) {
            return interaction.reply({ content: "You don't have permission.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = interaction.guild.id;

            if (!Db.ServerConfig?.[GuildId]?.GroupId)
                return interaction.editReply({ content: "Group ID not set. Run /config first." });

            const Username = interaction.options.getString('username');
            const Reason = interaction.options.getString('reason');
            const DiscordIdOption = interaction.options.getString('discordid');
            const UserId = await GetRobloxUserId(Username);

            const Suspension = Db.Suspensions?.[UserId];
            if (!Suspension || !Suspension.Active)
                return interaction.editReply({ content: `${Username} is not currently suspended.` });

            const EndsAt = Suspension.EndsAt ? Number(Suspension.EndsAt) : null;

            if (EndsAt && Date.now() < EndsAt)
                return interaction.editReply({ content: `${Username} is still within their suspension period.` });

            Suspension.Active = false;
            await SaveJsonBin(Db);

            const DurationStr = Suspension.IssuedAt && EndsAt ? FormatDuration(EndsAt - Suspension.IssuedAt) : 'N/A';
            const TargetDiscordId = DiscordIdOption || Object.keys(Db.VerifiedUsers || {}).find(id => Db.VerifiedUsers[id] === UserId);

            const UserEmbed = new EmbedBuilder()
                .setTitle('YOUR SUSPENSION HAS ENDED')
                .setColor(0x00ff00)
                .setDescription(`Dear, <@${TargetDiscordId}>, your suspension has ended. You have been ranked back to your original role.`);

            const LogEmbed = new EmbedBuilder()
                .setTitle('User Unsuspended')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Username', value: Username, inline: true },
                    { name: 'Unsuspended By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: Reason, inline: false },
                    { name: 'Duration', value: DurationStr, inline: true }
                )
                .setTimestamp(new Date());

            try {
                await SetRank(Db.ServerConfig[GuildId].GroupId, UserId, Suspension.OldRankName || Suspension.OldRankValue, 'SYSTEM', GuildId, interaction.client);
            } catch {}

            if (TargetDiscordId) {
                const Member = await interaction.guild.members.fetch(TargetDiscordId).catch(() => null);
                if (Member) {
                    const OldRoles = Member.roles.cache.map(r => r.id).filter(id => id !== interaction.guild.id);
                    if (OldRoles.length) await Member.roles.remove(OldRoles).catch(() => {});
                    await Member.roles.add(DiscordRoleId).catch(() => {});
                    try { await Member.send({ embeds: [UserEmbed] }); } catch {}
                } else {
                    try {
                        const TargetUser = await interaction.client.users.fetch(TargetDiscordId);
                        await TargetUser.send({ embeds: [UserEmbed] }).catch(() => {});
                    } catch {}
                }
            }

            const LogChannel = await interaction.client.channels.fetch(SuspensionLogChannelId).catch(() => null);
            if (LogChannel?.isTextBased()) await LogChannel.send({ embeds: [LogEmbed] });

            await interaction.editReply({ content: `Successfully unsuspended ${Username}. DM sent to the user.` });
        } catch (Err) {
            return interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
