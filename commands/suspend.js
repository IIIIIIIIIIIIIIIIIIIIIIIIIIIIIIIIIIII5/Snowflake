const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GetJsonBin, SaveJsonBin, GetRobloxUserId, GetCurrentRank, SuspendUser } = require('../roblox');

const ALLOWED_ROLE = "1398691449939169331";

function parseDuration(input) {
    const m = input.match(/^(\d+)([smhdwM])$/i);
    if (!m) throw new Error('Invalid duration format. Use 1s,1m,1h,1d,1w,1M');
    const v = parseInt(m[1], 10);
    const u = m[2];
    const multipliers = { s:1000, m:60000, h:3600000, d:86400000, w:604800000, M:2592000000 };
    const ms = v * multipliers[u];
    if (ms > multipliers.M) throw new Error('Maximum duration is 1 month.');
    if (ms < 1000) throw new Error('Minimum duration is 1 second.');
    return ms;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms/1000)%60;
    const minutes = Math.floor(ms/60000)%60;
    const hours = Math.floor(ms/3600000)%24;
    const days = Math.floor(ms/86400000)%7;
    const weeks = Math.floor(ms/604800000)%4;
    const months = Math.floor(ms/2592000000);
    const parts = [];
    if (months) parts.push(`${months} month${months>1?'s':''}`);
    if (weeks) parts.push(`${weeks} week${weeks>1?'s':''}`);
    if (days) parts.push(`${days} day${days>1?'s':''}`);
    if (hours) parts.push(`${hours} hour${hours>1?'s':''}`);
    if (minutes) parts.push(`${minutes} minute${minutes>1?'s':''}`);
    if (seconds) parts.push(`${seconds} second${seconds>1?'s':''}`);
    return parts.join(', ') || '0 seconds';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suspend')
    .setDescription('Suspend a user')
    .addStringOption(opt => opt.setName('username').setDescription('Roblox username to suspend').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for suspension').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 1d, 1w, 1M').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) return interaction.reply({ content: "You don't have permission.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      const db = await GetJsonBin();
      const guildId = interaction.guild.id;
      const groupId = db.ServerConfig?.[guildId]?.GroupId;
      if (!groupId) return interaction.editReply({ content: 'Group ID not set. Run /config first.' });

      const username = interaction.options.getString('username');
      const reason = interaction.options.getString('reason');
      const durationStr = interaction.options.getString('duration');
      const durationMs = parseDuration(durationStr);

      const userId = await GetRobloxUserId(username);
      const currentRank = await GetCurrentRank(groupId, userId);

      await SuspendUser(groupId, userId, interaction.user.id, guildId, interaction.client);

      db.Suspensions = db.Suspensions || {};
      db.Suspensions[userId] = {
        username,
        guildId,
        GroupId: groupId,
        reason,
        issuedBy: interaction.user.id,
        issuedAt: Date.now(),
        endsAt: Date.now() + durationMs,
        durationStr,
        oldRank: currentRank.Name,
        active: true
      };
      await SaveJsonBin(db);

      const userEmbed = new EmbedBuilder()
        .setTitle('YOU HAVE BEEN SUSPENDED')
        .setColor(0xff0000)
        .setDescription(`Dear, **${username}**, you have been suspended from Snowflake Penitentiary from your rank **${currentRank.Name}**\n\nBelow are the details of your suspension:`)
        .addFields(
          { name: 'Username', value: username, inline: false },
          { name: 'Current Rank', value: currentRank.Name, inline: false },
          { name: 'Reason for Suspension', value: reason, inline: false },
          { name: 'Duration', value: formatDuration(durationMs), inline: false },
          { name: 'Appeal', value: '[Join Administration Server](https://discord.gg/ZSJuzdVAee)', inline: false }
        );

      const logEmbed = new EmbedBuilder()
        .setTitle('User Suspended')
        .setColor(0xff0000)
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Suspended By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Duration', value: formatDuration(durationMs), inline: true }
        )
        .setTimestamp(new Date());

      const targetDiscordId = Object.keys(db.VerifiedUsers || {}).find(id => db.VerifiedUsers[id] === userId);
      if (targetDiscordId) {
        try {
          const targetUser = await interaction.client.users.fetch(targetDiscordId);
          await targetUser.send({ embeds: [userEmbed] });
        } catch {}
      }

      const logChannel = await interaction.client.channels.fetch('1424381038393556992').catch(() => null);
      if (logChannel?.isTextBased()) await logChannel.send({ embeds: [logEmbed] });

      await interaction.editReply({ content: `Successfully suspended ${username}. DM sent to the user.` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
};
