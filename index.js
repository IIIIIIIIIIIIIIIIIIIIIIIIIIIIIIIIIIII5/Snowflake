const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const ClientBot = new Client({ intents: [GatewayIntentBits.Guilds] });

const RobloxCookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;
const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;

const Verifications = {};

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
    const res = await axios.post("https://auth.roblox.com/v2/logout", {}, {
      headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}` }
    });
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
      headers: {
        Cookie: `.ROBLOSECURITY=${RobloxCookie}`,
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": XsrfToken
      }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response?.headers["x-csrf-token"]) {
      XsrfToken = Err.response.headers["x-csrf-token"];
      await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
        headers: {
          Cookie: `.ROBLOSECURITY=${RobloxCookie}`,
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": XsrfToken
        }
      });
    } else {
      console.error("SetRank failed:", Err.response?.data || Err.message);
      throw new Error("Request failed: " + (Err.response?.data?.errors?.[0]?.message || Err.message));
    }
  }

  await LogRankChange(GroupId, UserId, RoleInfo, Issuer);
}

async function LogRankChange(GroupId, UserId, RoleInfo, Issuer) {
  const Data = await GetJsonBin();
  Data.RankChanges = Data.RankChanges || [];
  Data.RankChanges.push({
    GroupId,
    UserId,
    NewRank: RoleInfo,
    IssuedBy: Issuer || "API",
    Timestamp: new Date().toISOString()
  });
  await SaveJsonBin(Data);
}

async function JoinDavidRankBot(GroupId) {
  let XsrfToken = await GetXsrfToken();
  const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users`;

  try {
    await axios.post(Url, {}, {
      headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response.headers["x-csrf-token"]) {
      XsrfToken = Err.response.headers["x-csrf-token"];
      await axios.post(Url, {}, {
        headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
      });
    } else {
      console.error("Failed to add DavidRankBot to group:", Err.response?.data || Err.message);
    }
  }
}

async function GetJsonBin() {
  try {
    const Res = await axios.get(`https://api.jsonbin.io/v3/b/${JsonBinId}/latest`, {
      headers: { "X-Master-Key": JsonBinSecret }
    });
    return Res.data.record || {};
  } catch {
    return {};
  }
}

async function SaveJsonBin(Data) {
  await axios.put(`https://api.jsonbin.io/v3/b/${JsonBinId}`, Data, {
    headers: { "X-Master-Key": JsonBinSecret, "Content-Type": "application/json" }
  });
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

ClientBot.once("ready", async () => {
  console.log("Bot is ready!");

  const Commands = [
    new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
    new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
    new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true)),
    new SlashCommandBuilder().setName("demote").setDescription("Demote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true))
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

      const Button = new ButtonBuilder()
          .setCustomId("done_verification")
          .setLabel("Done")
          .setStyle(ButtonStyle.Primary);

      const Row = new ActionRowBuilder().addComponents(Button);

      await Interaction.reply({
          content: `Put this code in your Roblox profile description:\n\`${Code}\`\nThen click the **Done** button below when finished.`,
          components: [Row],
          ephemeral: true
      });
    }

    if (CommandName === "config") {
      const GroupId = Interaction.options.getInteger("groupid");
      const Db = await GetJsonBin();
      if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });

      Db.ServerConfig = Db.ServerConfig || {};
      Db.ServerConfig[Interaction.guild.id] = { GroupId };
      await SaveJsonBin(Db);

      const Delay = (1 + Math.floor(Math.random() * 10)) * 60 * 1000;
      setTimeout(async () => {
        await JoinDavidRankBot(GroupId);
        console.log(`DavidRankBot joined group ${GroupId}`);

        try {
          const user = await ClientBot.users.fetch(Interaction.user.id);
          await user.send(`DavidRankBot has successfully joined your Roblox group (ID: ${GroupId}). Please rank the account to a role with rank permissions.`);
        } catch (err) {
          console.error("Failed to DM user: ", err.message);
        }
      }, Delay);

      Interaction.reply({ content: `Group ID set to **${GroupId}** for this server`, ephemeral: true });
    }

    if (["setrank", "promote", "demote"].includes(CommandName)) {
      const Db = await GetJsonBin();
      if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
      if (!Db.ServerConfig || !Db.ServerConfig[Interaction.guild.id]) return Interaction.reply({ content: "Group ID not set. Run /config <groupId> first.", ephemeral: true });

      const GroupId = Db.ServerConfig[Interaction.guild.id].GroupId;
      const UserId = Interaction.options.getInteger("userid");
      const CurrentRank = Interaction.options.getInteger("currentrank") || 0;

      try {
        if (CommandName === "setrank") {
          const Rank = Interaction.options.getInteger("rank");
          await SetRank(GroupId, UserId, Rank, Interaction.user.username);
          Interaction.reply({ content: `Set rank ${Rank} for user ${UserId}`, ephemeral: true });
        } else if (CommandName === "promote") {
          await SetRank(GroupId, UserId, CurrentRank + 1, Interaction.user.username);
          Interaction.reply({ content: `Promoted user ${UserId} to rank ${CurrentRank + 1}`, ephemeral: true });
        } else if (CommandName === "demote") {
          await SetRank(GroupId, UserId, Math.max(CurrentRank - 1, 1), Interaction.user.username);
          Interaction.reply({ content: `Demoted user ${UserId} to rank ${Math.max(CurrentRank - 1, 1)}`, ephemeral: true });
        }
      } catch (Err) {
        Interaction.reply({ content: `Error: ${Err.message}`, ephemeral: true });
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

ClientBot.login(process.env.BOT_TOKEN);
