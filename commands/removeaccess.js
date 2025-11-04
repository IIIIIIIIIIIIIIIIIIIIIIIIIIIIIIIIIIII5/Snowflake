const { SlashCommandBuilder } = require("discord.js");

const AllowedRoles = [
  "1386369108408406096",
  "1418979785165766717",
  "1424775224813158410",
  "1398691449939169331"
];

const BlacklistedChannel = "1417182548441960548";
const CountingBLRoleId = "1425485834227810346";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removeaccess")
    .setDescription("Blacklist a user from the counting channel.")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("The user to blacklist.")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const hasPermission = member.roles.cache.some(r => AllowedRoles.includes(r.id));
    if (!hasPermission) return interaction.editReply("You do not have permission to use this command.");

    const targetUser = interaction.options.getUser("user");
    const guild = interaction.guild;

    let targetMember;
    try {
      targetMember = await guild.members.fetch(targetUser.id);
    } catch {
      targetMember = null;
    }

    try {
      const blacklistChannel = await guild.channels.fetch(BlacklistedChannel);

      await blacklistChannel.permissionOverwrites.edit(targetUser.id, { ViewChannel: false });

      const role = await guild.roles.fetch(CountingBLRoleId).catch(() => null);
      if (targetMember && role) {
        const botMember = await guild.members.fetch(interaction.client.user.id);
        if (botMember.roles.highest.position > role.position) {
          await targetMember.roles.add(role, `Blacklisted by ${interaction.user.tag}`);
        }
      }

      await blacklistChannel.send(
        `Blacklisted ${targetUser.tag} (${targetUser.id}). Moderator: ${interaction.user.tag}`
      );

      return interaction.editReply(`Successfully blacklisted ${targetUser.tag}`);
    } catch {
      return interaction.editReply("Failed to blacklist user.");
    }
  }
};
