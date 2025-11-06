const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, SetRank, SendRankLog, GetGroupRanks } = require('../roblox');

const AllowedRole = '1423332095001890908';
const SFPLeadershipRole = '1386369108408406096';

const Ranks = {};
const OneHour = 1000 * 60 * 60;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription("Set a user's rank")
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(opt =>
      opt.setName('rankname')
        .setDescription('Rank name')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    const config = db.ServerConfig?.[guildId];
    if (!config?.GroupId) return interaction.respond([]);

    const groupId = config.GroupId;

    if (!Ranks[guildId] || (Date.now() - Ranks[guildId].LastUpdate) > OneHour) {
      const fetchedRanks = await GetGroupRanks(groupId);
      Ranks[guildId] = {
        List: fetchedRanks.map(r => r.name),
        LastUpdate: Date.now()
      };
    }

    const focused = interaction.options.getFocused();
    const filtered = Ranks[guildId].List
      .filter(r => r.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25);

    return interaction.respond(filtered.map(r => ({ name: r, value: r })));
  },

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(AllowedRole) && !interaction.member.roles.cache.has(SFPLeadershipRole))
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const groupId = db.ServerConfig[guildId].GroupId;
    const username = interaction.options.getString('username');
    const rankName = interaction.options.getString('rankname');
    const userId = await GetRobloxUserId(username);

    try {
      await SetRank(groupId, userId, rankName, interaction.user.id, guildId);
      await SendRankLog(guildId, interaction.client, interaction.user.id, userId, "Set Rank", rankName);
      return interaction.editReply({ content: `Set ${username} to rank ${rankName}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
