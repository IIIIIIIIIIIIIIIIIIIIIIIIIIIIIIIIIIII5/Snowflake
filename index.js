const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActivityType } = require("discord.js");
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
  Res.data.roles.forEach((Role) => {
    Roles[Role.rank] = { Name: Role.name, RoleId: Role.id, Rank: Role.rank };
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
  ClientBot.user.setActivity("Snowflake Prison Roleplay", { type: ActivityType.Watching });

  const Commands = [
    new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
    new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank")
      .addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true))
      .addStringOption(opt => opt.setName("rank").setDescription("Rank number or role name").setRequired(true)),
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

        const Roles = await FetchRoles(GroupId);
        const RoleList = Object.values(Roles).sort((a, b) => a.Rank - b.Rank);

        if (CommandName === "setrank") {
          const Input = Interaction.options.getString("rank");
          let RoleInfo = null;

          if (!isNaN(Input)) {
            const RankNumber = parseInt(Input);
            RoleInfo = Roles[RankNumber];
          }

          if (!RoleInfo) {
            RoleInfo = RoleList.find(r => r.Name.toLowerCase() === Input.toLowerCase());
          }

          if (!RoleInfo) throw new Error("Rank not found (use rank number or exact role name)");

          NewRank = RoleInfo.Rank;
          await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
          Action = `Rank set to ${RoleInfo.Name} (Rank ${NewRank})`;

        } else {
          const CurrentRank = await GetCurrentRank(GroupId, UserId);
          const CurrentIndex = RoleList.findIndex(r => r.Rank === CurrentRank);
          if (CurrentIndex === -1) throw new Error("User's current role not found in group");

          if (CommandName === "promote") {
            const NextRole = RoleList[CurrentIndex + 1];
            if (!NextRole) throw new Error("User is already at the highest rank");
            NewRank = NextRole.Rank;
            await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
            Action = `Promoted to ${NextRole.Name} (Rank ${NewRank})`;
          } else if (CommandName === "demote") {
            const PrevRole = RoleList[CurrentIndex - 1];
            if (!PrevRole) throw new Error("User is already at the lowest rank");
            NewRank = PrevRole.Rank;
            await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
            Action = `Demoted to ${PrevRole.Name} (Rank ${NewRank})`;
          }
        }

        const dateOnly = new Date().toISOString().split("T")[0];

        const Embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Updated")
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
          .setTitle("Failed")
          .setDescription(Err.message || "An unknown error occurred")
          .addFields({ name: "Date", value: dateOnly, inline: true });

        await Interaction.reply({ embeds: [ErrorEmbed], ephemeral: true });
      }
    }

    if (CommandName === "verify") {
      const Username = Interaction.options.getString("username");
      try {
        const UserId = await GetRobloxUserId(Username);
        const Code = crypto.randomBytes(3).toString("hex").toUpperCase();
        Verifications[Interaction.user.id] = { UserId, Code };
        await Interaction.reply({
          content: `Please put this code in your Roblox profile description: ${Code}. Then click the button below to confirm.`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("verify_confirm").setLabel("Confirm Verification").setStyle(ButtonStyle.Primary)
            )
          ],
          ephemeral: true
        });
      } catch (Err) {
        await Interaction.reply({ content: Err.message, ephemeral: true });
      }
    }

    if (CommandName === "config") {
      if (Interaction.user.id !== ADMIN_ID) {
        return Interaction.reply({ content: "Only the bot admin can use this command.", ephemeral: true });
      }
      const GroupId = Interaction.options.getInteger("groupid");
      const Db = await GetJsonBin();
      Db.ServerConfig = Db.ServerConfig || {};
      Db.ServerConfig[Interaction.guild.id] = { GroupId };
      await SaveJsonBin(Db);
      await Interaction.reply({ content: `Group ID for this server has been set to ${GroupId}`, ephemeral: true });
    }

    if (CommandName === "whois") {
      const TargetUser = Interaction.options.getUser("user") || Interaction.user;
      const Db = await GetJsonBin();
      if (!Db.VerifiedUsers || !Db.VerifiedUsers[TargetUser.id]) {
        return Interaction.reply({ content: "That user is not verified.", ephemeral: true });
      }
      const RobloxId = Db.VerifiedUsers[TargetUser.id];
      const Embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Whois Lookup")
        .addFields(
          { name: "Discord User", value: TargetUser.tag, inline: true },
          { name: "Roblox UserId", value: String(RobloxId), inline: true }
        );
      await Interaction.reply({ embeds: [Embed] });
    }
  }

  if (Interaction.isButton()) {
    if (Interaction.customId === "verify_confirm") {
      const Data = Verifications[Interaction.user.id];
      if (!Data) return Interaction.reply({ content: "No verification session found. Please use /verify first.", ephemeral: true });

      try {
        const Description = await GetRobloxDescription(Data.UserId);
        if (!Description.includes(Data.Code)) {
          return Interaction.reply({ content: "Verification code not found in your description. Please try again.", ephemeral: true });
        }
        const Db = await GetJsonBin();
        Db.VerifiedUsers = Db.VerifiedUsers || {};
        Db.VerifiedUsers[Interaction.user.id] = Data.UserId;
        await SaveJsonBin(Db);
        delete Verifications[Interaction.user.id];
        await Interaction.reply({ content: "You have been successfully verified.", ephemeral: true });
      } catch (Err) {
        await Interaction.reply({ content: Err.message, ephemeral: true });
      }
    }
  }
});

ClientBot.login(process.env.BOT_TOKEN);
