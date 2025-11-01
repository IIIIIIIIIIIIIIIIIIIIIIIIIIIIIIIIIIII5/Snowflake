const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser } = require('../roblox');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription('Suspend a Roblox user from their rank')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true))
        .addStringOption(opt => opt.setName('discordid').setDescription('Optional Discord ID')),

    async execute(Interaction) {
        if (!Interaction.guild) return Interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        if (!Interaction.member.roles.cache.has(AllowedRole)) return Interaction.reply({ content: 'You do not have permission.', ephemeral: true });

        await Interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = Interaction.guild.id;
            const GroupId = Db.ServerConfig?.[GuildId]?.GroupId;
            if (!GroupId) return Interaction.editReply({ content: 'Group ID not set. Run /config first.' });

            const Username = Interaction.options.getString('username');
            const Reason = Interaction.options.getString('reason');
            const DurationMs = ParseDuration(Interaction.options.getString('duration'));
            const DiscordIdOption = Interaction.options.getString('discordid');

            const UserId = await GetRobloxUserId(Username);
            const TargetCurrentRank = await GetCurrentRank(GroupId, UserId);

            const IssuerRobloxEntry = Object.keys(Db.VerifiedUsers || {}).find(k => Db.VerifiedUsers[k] === Interaction.user.id);
            if (IssuerRobloxEntry) {
                if (IssuerRobloxEntry === UserId) return Interaction.editReply({ content: 'You cannot suspend yourself.', ephemeral: true });
                const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxEntry);
                if (TargetCurrentRank.Rank >= IssuerRank.Rank) return Interaction.editReply({ content: 'You cannot suspend a user with equal or higher rank.', ephemeral: true });
            }

            await SuspendUser(GroupId, UserId, Interaction.user.id, GuildId, Interaction.client, DurationMs);

            Db.Suspensions = Db.Suspensions || {};
            Db.Suspensions[UserId] = {
                Username,
                GuildId,
                Reason,
                IssuedBy: Interaction.user.id,
                IssuedAt: Date.now(),
                EndsAt: DurationMs > 0 ? Date.now() + DurationMs : null,
                DurationStr: Interaction.options.getString('duration'),
                OldRankName: TargetCurrentRank.Name,
                OldRankValue: TargetCurrentRank.Rank,
                Active: true
            };
            await SaveJsonBin(Db);

            const FullDuration = FormatDuration(DurationMs);

            const UserEmbed = new EmbedBuilder()
                .setTitle('YOU HAVE BEEN SUSPENDED')
                .setColor(0xff0000)
                .setDescription(`Dear, **${Username}**, you have been suspended from your rank **${TargetCurrentRank.Name}**`)
                .addFields(
                    { name: 'Username', value: Username, inline: false },
                    { name: 'Reason', value: Reason, inline: false },
                    { name: 'Duration', value: FullDuration, inline: false },
                    { name: 'Appeal', value: '[Join Administration Server](https://discord.gg/ZSJuzdVAee)', inline: false }
                );

            const LogEmbed = new EmbedBuilder()
                .setTitle('User Suspended')
                .setColor(0xff0000)
                .addFields(
                    { name: 'Username', value: Username, inline: true },
                    { name: 'Suspended By', value: `<@${Interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: Reason, inline: false },
                    { name: 'Duration', value: FullDuration, inline: true }
                )
                .setTimestamp(new Date());

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

            await Interaction.editReply({ content: `Successfully suspended ${Username}. DM sent to the user.` });
        } catch (Err) {
            return Interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
