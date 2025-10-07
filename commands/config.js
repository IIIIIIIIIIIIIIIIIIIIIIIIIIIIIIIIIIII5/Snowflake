const { SlashCommandBuilder } = require('discord.js');
const { SaveJsonBin, GetJsonBin } = require('./roblox');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Set the group ID for this server')
    .addIntegerOption(opt => opt.setName('groupid').setDescription('Roblox group ID').setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    const groupId = interaction.options.getInteger('groupid');

    const db = await GetJsonBin();
    db.ServerConfig = db.ServerConfig || {};
    db.ServerConfig[interaction.guild.id] = db.ServerConfig[interaction.guild.id] || {};
    db.ServerConfig[interaction.guild.id].GroupId = groupId;
    await SaveJsonBin(db);

    client.PendingApprovals[groupId] = { requesterId: interaction.user.id, guildId: interaction.guild.id };

    try {
      const admin = await client.users.fetch(process.env.ADMIN_ID);
      await admin.send(`New pending config:\nGroup ID: ${groupId}\nRequested by: <@${interaction.user.id}>`);
    } catch {}

    return interaction.editReply({ content: `Group ID **${groupId}** set! Waiting for admin approval.` });
  }
};
