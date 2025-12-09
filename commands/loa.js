const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin } = require('../roblox');

const AllowedRoles = ["1431333433539563531", "1423226365498494996", "1443622126203572304"];
const LoARoleId = "1437079732708442112";
const GuildId = "1386275140815425557";
const LogChannelId = "1439246721426260018";

function ConvertToDate(string, endOfDay = false) {
    const [day, month, yearRaw] = string.split('/').map(Number);
    if (!day || !month || !yearRaw) return null;

    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    if (endOfDay) {
        return new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    return new Date(year, month - 1, day);
}

function FormatDate(timestamp) {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loa')
        .setDescription('Put a user on Leave of Absence')
        .addUserOption(opt => opt.setName('user').setDescription('Select a user').setRequired(true))
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
            const Target = interaction.options.getUser('user');
            const Member = await interaction.guild.members.fetch(Target.id);
            const StartDateStr = interaction.options.getString('start_date');
            const EndDateStr = interaction.options.getString('end_date');
            const Reason = interaction.options.getString('reason');

            const StartDate = ConvertToDate(StartDateStr);
            const EndDate = ConvertToDate(EndDateStr, true);

            if (!StartDate || !EndDate) return interaction.editReply({ content: "Invalid date format. Use DD/MM/YYYY." });
            if (EndDate < StartDate) return interaction.editReply({ content: "End date cannot be before start date." });

            if (!Db.LoAs) Db.LoAs = {};
            Db.LoAs[Target.id] = {
                StartDate: StartDate.getTime(),
                EndDate: EndDate.getTime(),
                Reason: Reason,
                Active: true,
                DiscordId: Target.id
            };
            await SaveJsonBin(Db);

            await Member.roles.add(LoARoleId).catch(() => {});

            const DMEmbed = new EmbedBuilder()
                .setTitle('Leave of Absence Issued')
                .setColor(0xff9900)
                .setDescription(`Dear <@${Member.id}>,\n\nYou have been put on Leave of Absence starting from **${StartDateStr}** and it shall end on **${EndDateStr}**.\nReason: ${Reason}`);
            try {
                await Member.send({ embeds: [DMEmbed] });
            } catch {}

            const LogEmbed = new EmbedBuilder()
                .setTitle('Leave of Absence Issued')
                .setColor(0xff9900)
                .setDescription(`A LoA has been issued for <@${Member.id}>.`)
                .addFields(
                    { name: 'Start Date', value: StartDateStr, inline: true },
                    { name: 'End Date', value: EndDateStr, inline: true },
                    { name: 'Reason', value: Reason, inline: false },
                    { name: 'Issued by', value: `<@${interaction.user.id}>`, inline: true }
                );
            const LogChannel = await interaction.guild.channels.fetch(LogChannelId);
            if (LogChannel?.isTextBased()) LogChannel.send({ embeds: [LogEmbed] });

            await interaction.editReply({ content: `Successfully issued LoA for <@${Member.id}>.` });

        } catch (err) {
            return interaction.editReply({ content: `Error: ${err.message}` });
        }
    },

    async StartAutoCheck(client) {
        setInterval(async () => {
            const Db = await GetJsonBin();
            const Now = Date.now();

            if (!Db.LoAs) return;

            for (const DiscordId in Db.LoAs) {
                const LoA = Db.LoAs[DiscordId];
                if (LoA.Active && LoA.EndDate <= Now) {
                    LoA.Active = false;

                    try {
                        const Guild = await client.guilds.fetch(GuildId);
                        const Member = await Guild.members.fetch(LoA.DiscordId).catch(() => null);
                        if (Member) {
                            await Member.roles.remove(LoARoleId).catch(() => {});

                            const DMEmbed = new EmbedBuilder()
                                .setTitle('Leave of Absence Ended')
                                .setColor(0x00ff00)
                                .setDescription(`Dear <@${Member.id}>,\n\nYour Leave of Absence which was issued on ${FormatDate(LoA.StartDate)} has come to an end. You may resume your normal duties starting from today.`);
                            try { await Member.send({ embeds: [DMEmbed] }); } catch {}

                            const LogEmbed = new EmbedBuilder()
                                .setTitle('Leave of Absence Ended')
                                .setColor(0x00ff00)
                                .setDescription(`<@${Member.id}>'s Leave of Absence which was issued on ${FormatDate(LoA.StartDate)} has ended.`);
                            const LogChannel = await Guild.channels.fetch(LogChannelId);
                            if (LogChannel?.isTextBased()) LogChannel.send({ embeds: [LogEmbed] });
                        }
                    } catch {}

                    await SaveJsonBin(Db);
                }
            }
        }, 30000);
    }
};
