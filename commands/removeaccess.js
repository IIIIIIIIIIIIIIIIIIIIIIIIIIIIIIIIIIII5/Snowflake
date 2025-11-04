const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removeaccess")
    .setDescription("Remove a user's access to a channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("The user to remove access from.")
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName("channel")
        .setDescription("The channel to remove access to.")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser("user");
    const channel = interaction.options.getChannel("channel");

    if (!channel.isTextBased())
      return interaction.editReply("This is not a text-based channel.");

    try {
      await channel.permissionOverwrites.edit(target.id, { ViewChannel: false });

      const embed = new EmbedBuilder()
        .setTitle("Access Removed")
        .setColor(0xff4d4d)
        .setDescription(`Removed <@${target.id}>'s access to <#${channel.id}>.`)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      return interaction.editReply("Failed to update permissions. Check bot role position.");
    }
  }
};
