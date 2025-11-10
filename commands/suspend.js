const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank } = require('../roblox');

const Roles = ["1398691449939169331", "1418979785165766717", "1386369108408406096"];
const SuspensionRoleId = "1402233297786109952";
const SuspensionLogChannelId = "1433025723932741694";

const DurationOptions = {
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000
};

function FormatDuration(ms) {
    let remaining = ms;
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    remaining -= days * 24 * 60 * 60 * 1000;
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    remaining -= hours * 60 * 60 * 1000;
    const minutes = Math.floor(remaining / (60 * 1000));
    remaining -= minutes * 60 * 1000;
    const seconds = Math.floor(remaining / 1000);

    let result = [];
    if (days) result.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours) result.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes) result.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    if (seconds) result.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
    return result.join(', ') || '0 seconds';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suspend')
        .setDescription('Suspend a Roblox user from their rank')
        .addStringOption(opt =>
            opt.setName('username')
                .setDescription('Roblox username')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('Reason for suspension')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('duration')
                .setDescription('Duration of suspension')
                .setRequired(true)
                .addChoices(
                    { name: '12 hours', value: '12h' },
                    { name: '1 day', value: '1d' },
                    { name: '3 days', value: '3d' },
                    { name: '7 days', value: '7d' },
                    { name: '1 month', value: '1m' }
                ))
        .addStringOption(opt =>
            opt.setName('discordid')
                .setDescription('Optional Discord ID')),

    async execute(Interaction) {
        if (!Interaction.member.roles.cache.some(r => Roles.includes(r.id)))
            return Interaction.reply({ content: "You do not have permission.", ephemeral: true });

        await Interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = Interaction.guild.id;
            const GroupId = Db.ServerConfig?.[GuildId]?.GroupId;

            if (!GroupId)
                return Interaction.editReply({ content: 'Group ID not set. Run /config first.' });

            const Username = Interaction.options.getString('username');
            const Reason = Interaction.options.getString('reason');
            const DurationKey = Interaction.options.getString('duration');
            const DurationMs = DurationOptions[DurationKey];
            const DiscordIdOption = Interaction.options.getString('discordid');

            if (!DurationMs) {
                const validKeys = Object.keys(DurationOptions).map(k => `\`${k}\``).join(', ');
                return Interaction.editReply({ content: `Invalid duration. Valid options are: ${validKeys}` });
            }

            const UserId = await GetRobloxUserId(Username);
            const TargetCurrentRank = await GetCurrentRank(GroupId, UserId);

            const IssuerRobloxEntry = Object.keys(Db.VerifiedUsers || {})
                .find(k => Db.VerifiedUsers[k] === Interaction.user.id);

            if (IssuerRobloxEntry) {
                if (IssuerRobloxEntry === UserId)
                    return Interaction.editReply({ content: 'You cannot suspend yourself.' });

                const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxEntry);
                if (TargetCurrentRank.Rank >= IssuerRank.Rank)
                    return Interaction.editReply({ content: 'You cannot suspend a user with equal or higher rank.' });
            }

            let OldRoles = [];
            let Member;
            if (DiscordIdOption) {
                Member = await Interaction.guild.members.fetch(DiscordIdOption).catch(() => null);
                if (Member) {
                    OldRoles = Member.roles.cache
                        .map(r => r.id)
                        .filter(id => id !== Interaction.guild.id && id !== SuspensionRoleId);
                    if (OldRoles.length) await Member.roles.remove(OldRoles).catch(() => {});
                    await Member.roles.add(SuspensionRoleId).catch(() => {});
                }
            }

            Db.Suspensions = Db.Suspensions || {};
            Db.Suspensions[UserId] = {
                Username,
                IssuedBy: Interaction.user.id,
                IssuedAt: Date.now(),
                EndsAt: Date.now() + DurationMs,
                GroupId,
                GuildId,
                OldRankName: TargetCurrentRank.Name,
                OldRankValue: TargetCurrentRank.Rank,
                OldRoles,
                Reason,
                Active: true
            };

            await SaveJsonBin(Db);

            const FullDuration = FormatDuration(DurationMs);

            const UserEmbed = new EmbedBuilder()
                .setTitle('YOU HAVE BEEN SUSPENDED')
                .setColor(0xff0000)
                .setDescription(`Dear, **${Username}**, you have been suspended from your rank **${TargetCurrentRank.Name}**`)
                .addFields(
                    { name: 'Username', value: Username },
                    { name: 'Reason', value: Reason },
                    { name: 'Duration', value: FullDuration },
                    { name: 'Appeal', value: '[Join Administration Server](https://discord.gg/ZSJuzdVAee)' }
                );

            const LogEmbed = new EmbedBuilder()
                .setTitle('User Suspended')
                .setColor(0xff0000)
                .addFields(
                    { name: 'Username', value: Username, inline: true },
                    { name: 'Suspended By', value: `<@${Interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: Reason },
                    { name: 'Duration', value: FullDuration }
                )
                .setTimestamp();

            if (Member) {
                try { await Member.send({ embeds: [UserEmbed] }); } catch {}
            } else if (DiscordIdOption) {
                try {
                    const TargetUser = await Interaction.client.users.fetch(DiscordIdOption);
                    await TargetUser.send({ embeds: [UserEmbed] }).catch(() => {});
                } catch {}
            }

            const LogChannel = await Interaction.client.channels.fetch(SuspensionLogChannelId).catch(() => null);
            if (LogChannel?.isTextBased())
                await LogChannel.send({ embeds: [LogEmbed] });

            await Interaction.editReply({
                content: `Successfully suspended ${Username} for ${DurationKey}.`
            });

        } catch (Err) {
            return Interaction.editReply({ content: `Error: ${Err.message}` });
        }
    }
};
