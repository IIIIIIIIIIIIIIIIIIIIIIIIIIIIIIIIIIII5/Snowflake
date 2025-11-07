const { SlashCommandBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, SetRank, SendRankLog, FetchRoles } = require('../roblox');

const ALLOWED_ROLE = '1423332095001890908';
const SFPLeadershipRole = '1386369108408406096';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription("Set a user's Roblox rank")
    .addStringOption(opt =>
      opt.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('rankname')
        .setDescription('Rank name')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const db = await GetJsonBin();
    const guildId = interaction.guild.id;

    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.respond([]);

    const groupId = db.ServerConfig[guildId].GroupId;

    try {
      const roles = await FetchRoles(groupId);
      const allRoles = Object.values(roles);

      const filtered = allRoles
        .filter(r => r.Name.toLowerCase().includes(focused))
        .slice(0, 25);

      return interaction.respond(
        filtered.map(r => ({
          name: `${r.Name} (${r.Rank})`,
          value: r.Name
        }))
      );
    } catch {
      return interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE) && !interaction.member.roles.cache.has(SFPLeadershipRole)) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId) {
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });
    }
    const groupId = db.ServerConfig[guildId].GroupId;

    const username = interaction.options.getString('username');
    const rankName = interaction.options.getString('rankname');

    let userId;
    try {
      userId = await GetRobloxUserId(username);
    } catch {
      return interaction.editReply({ content: `Could not find Roblox user: ${username}` });
    }

    try {
      await SetRank(groupId, userId, rankName, interaction.user.id, guildId);

      await SendRankLog(guildId, interaction.client, interaction.user.id, userId, "Set Rank", rankName);

      return interaction.editReply({ content: `Successfully set ${username} to rank ${rankName}` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
