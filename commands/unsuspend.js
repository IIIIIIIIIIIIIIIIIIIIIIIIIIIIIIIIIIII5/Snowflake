const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, SetRank } = require('../roblox');

const AllowedRole = "1398691449939169331";
const DiscordRoleId = "1402233297786109952";

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
        .setName('unsuspend')
        .setDescription("Remove a user's suspension")
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username to unsuspend').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ending the suspension').setRequired(true)),

    async execute(interaction) {
        const GuildId = interaction.guild.id;
        if (!interaction.member.roles.cache.has(AllowedRole))
            return interaction.reply({ content: "You don't have permission.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            if (!Db.ServerConfig?.[GuildId]?.GroupId)
                return interaction.editReply({ content: "Group ID not set. Run /config first." });

            const Username = interaction.options.getString('username');
            const Reason = interaction.options.getString('reason');
            const UserId = await GetRobloxUserId(Username);

            const Suspension = Db.Suspensions?.[UserId];
            if (!Suspension || !Suspension.active)
                return interaction.editReply({ content: `${Username} is not currently suspended.` });

            Suspension.active = false;
            await SaveJsonBin(Db);

            const DurationStr = Suspension.issuedAt && Suspension.endsAt
                ? FormatDuration(Suspension.endsAt - Suspension.issuedAt)
                : 'N/A';

            const TargetDiscordId = Object.keys(Db.VerifiedUsers || {}).find(id => Db.VerifiedUsers[id] === UserId);

            const UserEmbed = new EmbedBuilder()
                .setTitle("YOUR SUSPENSION HAS ENDED EARLY")
                .setColor(0x00ff00)
                .setDescription(
                    `Dear, <@${TargetDiscordId}>, your suspension has ended early.\n\n` +
                    `You have been ranked to your original role and may run **/getrole**.\n\n` +
                    `If you have not been ranked please open a ticket in the [Administration](https://discord.gg/ZSJuzdVAee) server.`
                );

            const LogEmbed = new EmbedBuilder()
                .setTitle("User Unsuspended")
                .setColor(0x00ff00)
                .addFields(
                    { name: "Username", value: Username, inline: true },
                    { name: "Unsuspended By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Reason", value: Reason, inline: false },
                    { name: "Duration", value: DurationStr, inline: true }
                )
                .setTimestamp(new Date());

            if (Suspension.oldRank)
                await SetRank(Db.ServerConfig[GuildId].GroupId, UserId, Suspension.oldRank, interaction.user.id, GuildId, interaction.client);

            if (TargetDiscordId) {
                try {
                    const Member = await interaction.guild.members.fetch(TargetDiscordId).catch(() => null);
                    if (Member) {
                        const OldRoles = Member.roles.cache.map(r => r.id).filter(id => id !== interaction.guild.id);
                        if (OldRoles.length) await Member.roles.remove(OldRoles);
                        await Member.roles.add(DiscordRoleId).catch(() => {});
                        await Member.send({ embeds: [UserEmbed] }).catch(() => {});
                    } else {
                        const TargetUser = await interaction.client.users.fetch(TargetDiscordId);
                        await TargetUser.send({ embeds: [UserEmbed] }).catch(() => {});
                    }
                } catch {}
            }

            const LogChannel = await interaction.client.channels.fetch('1433025723932741694').catch(() => null);
            if (LogChannel?.isTextBased())
                await LogChannel.send({ embeds: [LogEmbed] });

            await interaction.editReply({ content: `Successfully unsuspended ${Username}. DM sent to the user.` });

        } catch (Err) {
            return interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
