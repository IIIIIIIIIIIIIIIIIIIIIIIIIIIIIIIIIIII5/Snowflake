const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser, SetRank } = require('../roblox');

const AllowedRole = "1398691449939169331";
const DiscordRoleId = "1402233297786109952";
const SuspensionLogChannelId = "1433025723932741694";

function ParseDuration(Input) {
    const Match = Input.match(/^(\d+)([smhdwM])$/i);
    if (!Match) throw new Error("Invalid duration format");
    const Value = parseInt(Match[1]);
    const Unit = Match[2];
    const Multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, M: 2592000000 };
    return Value * Multipliers[Unit];
}

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

function FormatDate(DateObj) {
    const Day = DateObj.getDate();
    const Month = DateObj.toLocaleString('default', { month: 'long' });
    const Year = DateObj.getFullYear();
    const Hours = DateObj.getHours() % 12 || 12;
    const Minutes = DateObj.getMinutes().toString().padStart(2, '0');
    const AmPm = DateObj.getHours() >= 12 ? 'PM' : 'AM';
    const Suffix = Day % 10 === 1 && Day !== 11 ? 'st' : Day % 10 === 2 && Day !== 12 ? 'nd' : Day % 10 === 3 && Day !== 13 ? 'rd' : 'th';
    return `On ${Day}${Suffix} ${Month}, ${Year} at ${Hours}:${Minutes} ${AmPm}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription("Suspend a Roblox user from their rank")
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true))
        .addStringOption(opt => opt.setName('discordid').setDescription('Optional Discord ID to remove roles and give a specific role')),

    async execute(Interaction) {
        if (!Interaction.guild) return Interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        if (!Interaction.member.roles.cache.has(AllowedRole)) return Interaction.reply({ content: "You don't have permission.", ephemeral: true });

        await Interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = Interaction.guild.id;
            const GroupId = Db.ServerConfig?.[GuildId]?.GroupId;
            if (!GroupId) return Interaction.editReply({ content: "Group ID not set. Run /config first." });

            const Username = Interaction.options.getString('username');
            const Reason = Interaction.options.getString('reason');
            const DurationStr = Interaction.options.getString('duration');
            const DurationMs = ParseDuration(DurationStr);
            const DiscordIdOption = Interaction.options.getString('discordid');

            const UserId = await GetRobloxUserId(Username);
            const TargetCurrentRank = await GetCurrentRank(GroupId, UserId);

            const IssuerRobloxId = Object.keys(Db.VerifiedUsers || {}).find(id => Db.VerifiedUsers[id] === Interaction.user.id);
            if (IssuerRobloxId) {
                if (IssuerRobloxId === UserId) return Interaction.editReply({ content: "You cannot suspend yourself.", ephemeral: true });
                const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
                if (TargetCurrentRank.Rank >= IssuerRank.Rank) return Interaction.editReply({ content: "You cannot suspend a user with equal or higher rank.", ephemeral: true });
            }

            await SuspendUser(GroupId, UserId, Interaction.user.id, GuildId, Interaction.client, DurationMs);

            Db.Suspensions = Db.Suspensions || {};
            Db.Suspensions[UserId] = {
                Username,
                GuildId,
                Reason,
                IssuedBy: Interaction.user.id,
                IssuedAt: Date.now(),
                EndsAt: Date.now() + DurationMs,
                DurationStr,
                OldRankId: TargetCurrentRank.Rank,
                OldRankName: TargetCurrentRank.Name,
                Active: true
            };
            await SaveJsonBin(Db);

            const FullDuration = FormatDuration(DurationMs);

            const UserEmbed = new EmbedBuilder()
                .setTitle("YOU HAVE BEEN SUSPENDED")
                .setColor(0xff0000)
                .setDescription(`Dear, **${Username}**, you have been suspended from Snowflake Penitentiary from your rank **${TargetCurrentRank.Name}**\n\nDetails of your suspension:`)
                .addFields(
                    { name: "Username", value: Username },
                    { name: "Reason", value: Reason },
                    { name: "Duration", value: FullDuration },
                    { name: "Appeal", value: "[Join Administration Server](https://discord.gg/ZSJuzdVAee)" }
                );

            const LogEmbed = new EmbedBuilder()
                .setTitle("User Suspended")
                .setColor(0xff0000)
                .addFields(
                    { name: "Username", value: Username, inline: true },
                    { name: "Suspended By", value: `<@${Interaction.user.id}>`, inline: true },
                    { name: "Reason", value: Reason },
                    { name: "Duration", value: FullDuration }
                )
                .setTimestamp();

            let TargetDiscordId = DiscordIdOption || Object.keys(Db.VerifiedUsers || {}).find(id => Db.VerifiedUsers[id] === UserId);
            if (TargetDiscordId) {
                const Member = await Interaction.guild.members.fetch(TargetDiscordId).catch(() => null);
                if (Member) {
                    const OldRoles = Member.roles.cache.map(r => r.id).filter(id => id !== Interaction.guild.id);
                    if (OldRoles.length) await Member.roles.remove(OldRoles).catch(() => {});
                    await Member.roles.add(DiscordRoleId).catch(() => {});
                    try { await Member.send({ embeds: [UserEmbed] }); } catch {}
                } else {
                    try {
                        const TargetUser = await Interaction.client.users.fetch(TargetDiscordId);
                        await TargetUser.send({ embeds: [UserEmbed] }).catch(() => {});
                    } catch {}
                }
            }

            const LogChannel = await Interaction.client.channels.fetch(SuspensionLogChannelId).catch(() => null);
            if (LogChannel?.isTextBased()) await LogChannel.send({ embeds: [LogEmbed] });

            setTimeout(async () => {
                Db.Suspensions[UserId].Active = false;
                await SaveJsonBin(Db);

                let RankedBack = "No";
                try {
                    await SetRank(GroupId, UserId, Db.Suspensions[UserId].OldRankId, 0, GuildId, Interaction.client);
                    await new Promise(r => setTimeout(r, 5000));
                    const AfterRank = await GetCurrentRank(GroupId, UserId);
                    if (
                        String(AfterRank.Name).toLowerCase() === String(Db.Suspensions[UserId].OldRankName).toLowerCase() ||
                        Number(AfterRank.Rank) === Number(Db.Suspensions[UserId].OldRankId)
                    ) {
                        RankedBack = "Yes";
                    }
                } catch {
                    RankedBack = "No";
                }

                const EndEmbed = new EmbedBuilder()
                    .setTitle("Suspension Ended")
                    .setColor(0x00ff00)
                    .setDescription(`${Username}'s suspension has ended`)
                    .addFields(
                        { name: "Rank Suspended From", value: Db.Suspensions[UserId].OldRankName },
                        { name: "Reason for Suspension", value: Reason },
                        { name: "Date Suspended On", value: FormatDate(new Date(Db.Suspensions[UserId].IssuedAt)) },
                        { name: "Duration", value: FullDuration },
                        { name: "Ranked Back to Previous Position", value: RankedBack }
                    )
                    .setTimestamp();

                if (LogChannel?.isTextBased()) await LogChannel.send({ embeds: [EndEmbed] });
            }, DurationMs);

            await Interaction.editReply({ content: `Successfully suspended ${Username}. DM sent to the user.` });
        } catch (Err) {
            return Interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
