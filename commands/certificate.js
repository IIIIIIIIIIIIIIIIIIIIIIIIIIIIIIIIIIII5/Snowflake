const { SlashCommandBuilder } = require("discord.js");
const { GetJsonBin, WriteJsonBin } = require("../roblox");

const Roles = [
  "1386369108408406096",
  "1431333433539563531",
  "1423226365498494996"
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("certificate")
    .setDescription("Manage user certifications.")
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add a certification to a user.")
        .addUserOption(opt =>
          opt.setName("user").setDescription("The user to modify.").setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Certification type")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.some(r => Roles.includes(r.id)))
      return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const target = interaction.options.getUser("user");
      const type = interaction.options.getString("type");

      const db = await GetJsonBin();

      if (!db.Certifications) db.Certifications = {};
      if (!db.Certifications[target.id]) db.Certifications[target.id] = [];

      if (db.Certifications[target.id].includes(type))
        return interaction.reply({ content: `${target.username} already has ${type}.`, ephemeral: true });

      db.Certifications[target.id].push(type);
      await WriteJsonBin(db);

      return interaction.reply({ content: `Added ${type} to ${target}.` });
    }
  }
};
