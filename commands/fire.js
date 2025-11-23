const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, GetRobloxUserId, GetCurrentRank, FetchRoles, SetRank, SendRankLog, loginRoblox } = require('../roblox');

const WhitelistedRoles = ["1386369108408406096", "1405917224430080001", "1431333433539563531"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Fire a user from the group')
    .addStringOption(o =>
      o.setName('user')
        .setDescription('Roblox username')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('discord_id')
        .setDescription('Discord ID of the user being fired')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
        .setDescription('Reason for termination')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('new_rank')
        .setDescription('New rank after firing')
        .setRequired(true)
        .addChoices(
          { name: 'Inmate', value: 'Inmate' },
          { name: 'Suspended', value: 'Suspended' },
          { name: 'Respected Inmate', value: 'Respected Inmate' },
          { name: 'Cadet Officer', value: 'Cadet Officer' },
          { name: 'Correctional Officer', value: 'Correctional Officer' },
          { name: 'Infirmary Staff', value: 'Infirmary Staff' },
          { name: 'Emergency Response Team', value: 'Emergency Response Team' },
          { name: 'Commander', value: 'Commander' },
          { name: 'Inspector', value: 'Inspector' },
          { name: 'Deputy Superintendent', value: 'Deputy Superintendent' },
          { name: 'Superintendent', value: 'Superintendent' }
        )
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.some(r => WhitelistedRoles.includes(r.id)))
      return interaction.reply({ content: "You don't have permission.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    await loginRoblox();

    const db = await GetJsonBin();
    const guildId = interaction.guild.id;
    if (!db.ServerConfig?.[guildId]?.GroupId)
      return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

    const groupId = db.ServerConfig[guildId].GroupId;

    const username = interaction.options.getString('user');
    const discordId = interaction.options.getString('discord_id');
    const reason = interaction.options.getString('reason');
    const newRankReq = interaction.options.getString('new_rank');

    const userId = await GetRobloxUserId(username);

    try {
      const current = await GetCurrentRank(groupId, userId);
      const allRoles = Object.values(await FetchRoles(groupId));

      const validNames = [
        "Inmate",
        "Suspended",
        "Respected Inmate",
        "Cadet Officer",
        "Correctional Officer",
        "Infirmary Staff",
        "Emergency Response Team",
        "Commander",
        "Inspector",
        "Deputy Superintendent",
        "Superintendent"
      ].map(n => n.toLowerCase());

      const filtered = allRoles.filter(r => validNames.includes(r.Name.toLowerCase()));
      const chosenRole = filtered.find(r => r.Name.toLowerCase() === newRankReq.toLowerCase());
      if (!chosenRole) throw new Error("Rank not found.");

      await SetRank(groupId, userId, chosenRole.Name, interaction.user.id, guildId);

      const logChannel = interaction.guild.channels.cache.get("1435157510930698300");
      if (logChannel) {
        logChannel.send({
          content: `${username} has been fired by <@${interaction.user.id}> from ${current.Name} for the reason (${reason}).`
        }).catch(() => {});
      }

      const dmEmbed = new EmbedBuilder()
        .setTitle("You Have Been Terminated")
        .setDescription(
          `You have been terminated from your position **${current.Name}** for the reason of:**${reason}**\n\nYou have been ranked to **Superintendent**.`
        )
        .setColor("Red");

      try {
        const targetUser = await interaction.client.users.fetch(discordId);
        await targetUser.send({ embeds: [dmEmbed] });
      } catch {}

      return interaction.editReply({
        content: `${username} has been fired and ranked to ${chosenRole.Name}.`
      });

    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
