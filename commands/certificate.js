const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { GetJsonBin, SaveJsonBin } = require("../roblox");

const Roles = [
  "1386369108408406096",
  "1431333433539563531",
  "1423226365498494996",
  "1418979785165766717"
];

const AvailableCertificates = ["Certified Host"];

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
          opt.setName("Certificate Type")
            .setDescription("Select a certificate to add")
            .setRequired(true)
            .addChoices(...AvailableCertificates.map(c => ({ name: c, value: c })))
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a certification from a user.")
        .addUserOption(opt =>
          opt.setName("user").setDescription("The user to modify.").setRequired(true)
        )
    ),

  async execute(Interaction) {
    if (!Interaction.member.roles.cache.some(r => Roles.includes(r.id))) {
      return Interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
    }

    const Sub = Interaction.options.getSubcommand();
    const Db = await GetJsonBin();
    if (!Db.Certifications) Db.Certifications = {};

    if (Sub === "add") {
      const Target = Interaction.options.getUser("user");
      const Type = Interaction.options.getString("type");

      if (!Db.Certifications[Target.id]) Db.Certifications[Target.id] = [];

      if (Db.Certifications[Target.id].includes(Type)) {
        return Interaction.reply({ content: `${Target.username} already has ${Type}.`, ephemeral: true });
      }

      Db.Certifications[Target.id].push(Type);
      await SaveJsonBin(Db);

      return Interaction.reply({ content: `Added ${Type} to ${Target}.` });
    }

    if (Sub === "remove") {
      const Target = Interaction.options.getUser("user");
      const UserCerts = Db.Certifications[Target.id] || [];

      if (UserCerts.length === 0) {
        return Interaction.reply({ content: `${Target.username} has no certificates.`, ephemeral: true });
      }

      const Select = new StringSelectMenuBuilder()
        .setCustomId(`RemoveCert_${Target.id}`)
        .setPlaceholder("Select a certificate to remove")
        .addOptions(UserCerts.map(c => ({ label: c, value: c })));

      const Row = new ActionRowBuilder().addComponents(Select);

      await Interaction.reply({ content: `Select a certificate to remove from ${Target}:`, components: [Row], ephemeral: true });

      const Collector = Interaction.channel.createMessageComponentCollector({ time: 60000, filter: i => i.user.id === Interaction.user.id });

      Collector.on("collect", async i => {
        const CertToRemove = i.values[0];
        Db.Certifications[Target.id] = Db.Certifications[Target.id].filter(c => c !== CertToRemove);
        await SaveJsonBin(Db);
        await i.update({ content: `Removed ${CertToRemove} from ${Target}.`, components: [], ephemeral: true });
      });

      Collector.on("end", async Collected => {
        if (Collected.size === 0) {
          try { await Interaction.editReply({ content: "No certificate was selected.", components: [], ephemeral: true }); } catch {}
        }
      });
    }
  }
};
