const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const ClientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const RobloxCookie = process.env.ROBLOSECURITY;
const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

const Verifications = {};
const PendingApprovals = {};

async function FetchRoles(GroupId) {
  const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
  const Roles = {};
  Res.data.roles.forEach((Role, Index) => {
    Roles[Index + 1] = { Id: Role.name, RoleId: Role.id };
  });
  return Roles;
}

async function GetXsrfToken() {
  try {
    const res = await axios.post("https://auth.roblox.com/v2/logout", {}, { headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}` } });
    return res.headers["x-csrf-token"];
  } catch (err) {
    return err.response?.headers["x-csrf-token"] || "";
  }
}

async function SetRank(GroupId, UserId, RankNumber, Issuer) {
  const Roles = await FetchRoles(GroupId);
  const RoleInfo = Roles[RankNumber];
  if (!RoleInfo) throw new Error("Invalid rank number: " + RankNumber);

  const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;
  let XsrfToken = await GetXsrfToken();

  try {
    await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
      headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response?.headers["x-csrf-token"]) {
      XsrfToken = Err.response.headers["x-csrf-token"];
      await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
        headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
      });
    } else {
      throw new Error("Request failed: " + (Err.response?.data?.errors?.[0]?.message || Err.message));
    }
  }

  await LogRankChange(GroupId, UserId, RoleInfo, Issuer);
}

async function LogRankChange(GroupId, UserId, RoleInfo, Issuer) {
  const Data = await GetJsonBin();
  Data.RankChanges = Data.RankChanges || [];
  const dateOnly = new Date().toISOString().split("T")[0];
  Data.RankChanges.push({ GroupId, UserId, NewRank: RoleInfo, IssuedBy: Issuer || "API", Timestamp: dateOnly });
  await SaveJsonBin(Data);
}

async function GetJsonBin() {
  try {
    const Res = await axios.get(`https://api.jsonbin.io/v3/b/${JsonBinId}/latest`, { headers: { "X-Master-Key": JsonBinSecret } });
    return Res.data.record || {};
  } catch {
    return {};
  }
}

async function SaveJsonBin(Data) {
  await axios.put(`https://api.jsonbin.io/v3/b/${JsonBinId}`, Data, { headers: { "X-Master-Key": JsonBinSecret, "Content-Type": "application/json" } });
}

async function GetRobloxUserId(Username) {
  const Res = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${Username}`);
  if (!Res.data.data || !Res.data.data[0]) throw new Error("Invalid username");
  return Res.data.data[0].id;
}

async function GetRobloxDescription(UserId) {
  const Res = await axios.get(`https://users.roblox.com/v1/users/${UserId}`);
  return Res.data.description || "";
}

async function GetCurrentRank(GroupId, UserId) {
  const res = await axios.get(`https://groups.roblox.com/v2/users/${UserId}/groups/roles`);
  const GroupData = res.data.data.find(g => g.group.id === GroupId);
  if (!GroupData) throw new Error("User not in group");
  return GroupData.role.rank;
}

ClientBot.once("ready", async () => {
  console.log("Bot is ready!");

  const Commands = [
    new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
    new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
    new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
    new SlashCommandBuilder().setName("demote").setDescription("Demote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
    new SlashCommandBuilder().setName("whois").setDescription("Lookup a Roblox user from a Discord user").addUserOption(opt => opt.setName("user").setDescription("The Discord user to look up (leave blank to look up yourself)").setRequired(false))
  ].map(cmd => cmd.toJSON());

  const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await Rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: Commands });
});

ClientBot.on("interactionCreate", async (Interaction) => {
  if (Interaction.isChatInputCommand()) {
    const CommandName = Interaction.commandName;

    if (CommandName === "verify") {
      const Username = Interaction.options.getString("username");
      const UserId = await GetRobloxUserId(Username);
      const Code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      Verifications[Interaction.user.id] = { RobloxUserId: UserId, Code };

      const Button = new ButtonBuilder().setCustomId("done_verification").setLabel("Done").setStyle(ButtonStyle.Primary);
      const Row = new ActionRowBuilder().addComponents(Button);

      await Interaction.reply({
        content: `Put this code in your Roblox profile description:\n\`${Code}\`\nThen click the **Done** button below when finished.`,
        components: [Row],
        ephemeral: true
      });
    }

    if (CommandName === "config") {
      const AllowedRoleId = "1386369108408406096";

      if (!Interaction.member.roles.cache.has(AllowedRoleId)) {
        return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true }); 
      }
      
      const GroupId = Interaction.options.getInteger("groupid");
      const Db = await GetJsonBin();
      if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });

      Db.ServerConfig = Db.ServerConfig || {};
      Db.ServerConfig[Interaction.guild.id] = { GroupId };
      await SaveJsonBin(Db);

      PendingApprovals[GroupId] = { requesterId: Interaction.user.id, guildId: Interaction.guild.id };

      try {
        const AdminUser = await ClientBot.users.fetch(ADMIN_ID);
        await AdminUser.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${Interaction.user.id}>`);
      } catch (err) {
        console.error("Failed to DM admin:", err.message);
      }

      await Interaction.reply({ content: `Group ID **${GroupId}** set! Waiting for admin approval.`, ephemeral: true });
    }

    if (["setrank", "promote", "demote"].includes(CommandName)) {
      const allowedRoleId = "1423332095001890908";
      if (!Interaction.member.roles.cache.has(allowedRoleId)) {
        return Interaction.reply({
          content: "You do not have permission to use this command.",
          ephemeral: true
        });
      }

      const Db = await GetJsonBin();
      if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
      if (!Db.ServerConfig || !Db.ServerConfig[Interaction.guild.id]) return Interaction.reply({ content: "Group ID not set. Run /config <groupId> first.", ephemeral: true });

      const GroupId = Db.ServerConfig[Interaction.guild.id].GroupId;
      const UserId = Interaction.options.getInteger("userid");

      try {
        let NewRank;
        let Action;

        if (CommandName === "setrank") {
          NewRank = Interaction.options.getInteger("rank");
          await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
          Action = `Rank set to **${NewRank}**`;
        } else if (CommandName === "promote") {
          const CurrentRank = await GetCurrentRank(GroupId, UserId);
          NewRank = CurrentRank + 1;
          await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
          Action = `Promoted to **${NewRank}**`;
        } else if (CommandName === "demote") {
          const CurrentRank = await GetCurrentRank(GroupId, UserId);
          NewRank = Math.max(CurrentRank - 1, 1);
          await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
          Action = `Demoted to **${NewRank}**`;
        }

        const dateOnly = new Date().toISOString().split("T")[0];

        const Embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Updated!")
          .addFields(
            { name: "User ID", value: String(UserId), inline: true },
            { name: "Group ID", value: String(GroupId), inline: true },
            { name: "Action", value: Action, inline: false },
            { name: "Issued By", value: Interaction.user.tag, inline: true },
            { name: "Date", value: dateOnly, inline: true }
          );

        await Interaction.reply({ embeds: [Embed] });
      } catch (Err) {
        const dateOnly = new Date().toISOString().split("T")[0];

        const ErrorEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("Failed!")
          .setDescription(Err.message || "An unknown error occurred")
          .addFields({ name: "Date", value: dateOnly, inline: true });

        await Interaction.reply({ embeds: [ErrorEmbed], ephemeral: true });
      }
    }

    if (CommandName === "whois") {
      const TargetUser = Interaction.options.getUser("user") || Interaction.user;

      const Db = await GetJsonBin();
      const VerifiedUsers = Db.VerifiedUsers || {};
      const RobloxUserId = VerifiedUsers[TargetUser.id];

      if (!RobloxUserId) {
        return Interaction.reply({ content: `${TargetUser.tag} has not verified a Roblox account.`, ephemeral: true })
      }

      try {
        const res = await axios.get(`https://users.roblox.com/v1/users/${RobloxUserId}`);
        const RobloxInfo = res.data;

        const Embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("User Lookup")
          .addFields(
            { name: "Discord User", value: `${TargetUser.tag} (${TargetUser.id})`, inline: false },
            { name: "Roblox Username", value: `[${RobloxInfo.name}](https://www.roblox.com/users/${RobloxInfo.id}/profile)`, inline: true },
            { name: "Roblox User ID", value: String(RobloxInfo.id), inline: true },
            { name: "Description", value: RobloxInfo.description?.slice(0, 200) || "None", inline: false }
          )
          .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${RobloxInfo.id}&width=150&height=150&format=png`);

        await Interaction.reply({ embeds: [Embed] });

      } catch (err) {
        await Interaction.reply({ content: `Failed to get info for UserId: ${RobloxUserId}: ${err.message}`, ephemeral: true});
      }
    }
  } else if (Interaction.isButton() && Interaction.customId === "done_verification") {
    const Data = Verifications[Interaction.user.id];
    if (!Data) return Interaction.reply({ content: "You haven't started verification yet.", ephemeral: true });

    const Description = await GetRobloxDescription(Data.RobloxUserId);
    if (Description.includes(Data.Code)) {
      const Database = await GetJsonBin();
      Database.VerifiedUsers = Database.VerifiedUsers || {};
      Database.VerifiedUsers[Interaction.user.id] = Data.RobloxUserId;
      await SaveJsonBin(Database);
      delete Verifications[Interaction.user.id];
      Interaction.reply({ content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}`, ephemeral: true });
    } else {
      Interaction.reply({ content: "Code not found in your profile. Make sure you added it and try again.", ephemeral: true });
    }
  }
});

ClientBot.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!")) return;
  if (![ADMIN_ID].includes(message.author.id)) return;

  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();
  const GroupId = args[1];

  if (!GroupId || !PendingApprovals[GroupId]) return message.reply("Invalid or unknown group ID.");
  const { requesterId, guildId } = PendingApprovals[GroupId];

  if (cmd === "!accept") {
    await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been accepted! Please rank DavidRankBot in your Roblox group.`);
    delete PendingApprovals[GroupId];
    message.channel.send(`Accepted group ${GroupId} and notified <@${requesterId}>`);
  } else if (cmd === "!decline") {
    await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been declined by the RoSystem Administration Team! Please contact dizrobloxfan1 for more information.`);
    delete PendingApprovals[GroupId];
    message.channel.send(`Declined group ${GroupId} and notified <@${requesterId}>`);
  }
});

ClientBot.login(process.env.BOT_TOKEN);
