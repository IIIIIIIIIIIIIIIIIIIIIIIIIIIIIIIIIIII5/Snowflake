const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId } = require('../roblox');

const AllowedRoles = ["1431333433539563531", "1423226365498494996"];
const LoARoleId = "1437079732708442112";

function ConvertToDate(string) {
    const [day, month, year] = string.split('/').map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
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
            const EndDate = ConvertToDate(EndDateStr);

            if (!StartDate || !EndDate) return interaction.editReply({ content: "Invalid date format. Use DD/MM/YYYY." });
            if (EndDate < StartDate) return interaction.editReply({ content: "End date cannot be before start date." });

            const UserId = await GetRobloxUserId(Target.username);

            if (!Db.LoAs) Db.LoAs = {};
            Db.LoAs[UserId] = {
                StartDate: StartDate.getTime(),
                EndDate: EndDate.getTime(),
                Reason: Reason,
                Active: true,
                DiscordId: Target.id
            };
            await SaveJsonBin(Db);

            await Member.roles.add(LoARoleId).catch(() => {});

            const message = `Dear @${Member.user.username},\n\nYou have been put on Leave of Absence starting from ${StartDateStr} and it shall end on ${EndDateStr} with the reason (${Reason})`;
            try { await Member.send(message); } catch {}

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

            for (const UserId in Db.LoAs) {
                const LoA = Db.LoAs[UserId];
                if (LoA.Active && LoA.EndDate <= Now) {
                    LoA.Active = false;

                    try {
                        const Guild = client.guilds.cache.first();
                        const Member = await Guild.members.fetch(LoA.DiscordId).catch(() => null);
                        if (Member) {
                            await Member.roles.remove(LoARoleId).catch(() => {});
                            const message = `Dear @${Member.user.username},\n\nYour Leave of Absence which was issued on ${new Date(LoA.StartDate).toLocaleDateString()} has come to an end you may resume your normal duties starting from today.`;
                            try { await Member.send(message); } catch {}
                        }
                    } catch {}

                    await SaveJsonBin(Db);
                }
            }
        }, 30000);
    }
};
