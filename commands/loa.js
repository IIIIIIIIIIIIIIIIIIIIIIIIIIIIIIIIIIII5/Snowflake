const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId } = require('../roblox');

const AllowedRoles = ["1431333433539563531", "1423226365498494996"];
const LoARoleId = "1437079732708442112";
const LoALogChannelId = "1433025723932741694";

function ConvertToDate(string) {
    const [day, month, year] = string.split('/').map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loa')
        .setDescription('Put yourself on Leave of Absence')
        .addStringOption(opt => opt.setName('start_date').setDescription('Start date DD/MM/YYYY').setRequired(true))
        .addStringOption(opt => opt.setName('end_date').setDescription('End date DD/MM/YYYY').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for LoA').setRequired(true)),

    async execute(interaction) {
        if (!AllowedRoles.some(role => interaction.member.roles.cache.has(role))) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const Db = await GetJsonBin();
            const GuildId = interaction.guild.id;

            const StartDateStr = interaction.options.getString('start_date');
            const EndDateStr = interaction.options.getString('end_date');
            const Reason = interaction.options.getString('reason');

            const StartDate = ConvertToDate(StartDateStr);
            const EndDate = ConvertToDate(EndDateStr);

            if (!StartDate || !EndDate) return interaction.editReply({ content: "Invalid date format. Use DD/MM/YYYY." });
            if (EndDate < StartDate) return interaction.editReply({ content: "End date cannot be before start date." });

            const UserId = await GetRobloxUserId(interaction.user.username);

            if (!Db.LoAs) Db.LoAs = {};
            Db.LoAs[UserId] = {
                StartDate: StartDate.getTime(),
                EndDate: EndDate.getTime(),
                Reason: Reason,
                Active: true
            };
            await SaveJsonBin(Db);

            const Member = interaction.member;
            await Member.roles.add(LoARoleId).catch(() => {});

            const LoAEmbed = new EmbedBuilder()
                .setTitle('Leave of Absence Issued')
                .setColor(0xff9900)
                .setDescription(`Dear <@${Member.id}>,\nYou have been put on Leave of Absence starting from **${StartDateStr}** and it shall end on **${EndDateStr}**.\nReason: ${Reason}`);

            try { await Member.send({ embeds: [LoAEmbed] }); } catch {}

            const LogChannel = await interaction.client.channels.fetch(LoALogChannelId).catch(() => null);
            if (LogChannel?.isTextBased()) {
                const LogEmbed = new EmbedBuilder()
                    .setTitle('LoA Issued')
                    .setColor(0xff9900)
                    .addFields(
                        { name: 'User', value: `<@${Member.id}>`, inline: true },
                        { name: 'Start Date', value: StartDateStr, inline: true },
                        { name: 'End Date', value: EndDateStr, inline: true },
                        { name: 'Reason', value: Reason, inline: false }
                    )
                    .setTimestamp(new Date());
                await LogChannel.send({ embeds: [LogEmbed] });
            }

            await interaction.editReply({ content: `Successfully issued LoA for <@${Member.id}>.` });

        } catch (err) {
            return interaction.editReply({ content: `Error: ${err.message}` });
        }
    }
};
