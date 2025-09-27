const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const Cookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const JSONBIN_SECRET = process.env.JSONBIN_SECRET;
const JSONBIN_ID = process.env.JSONBIN_ID;

const verifications = {};

async function getData() {
  const res = await axios.get(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
    headers: { "X-Master-Key": JSONBIN_SECRET }
  });
  return res.data.record;
}

async function saveData(data) {
  await axios.put(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, data, {
    headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_SECRET }
  });
}

async function FetchRoles(GroupId) {
  const Response = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
  const Roles = {};
  Response.data.roles.forEach((Role, Index) => {
    Roles[Index + 1] = { ID: Role.name, RoleId: Role.id };
  });
  return Roles;
}

async function SetRank(GroupId, UserId, RankNumber, Issuer) {
  const Roles = await FetchRoles(GroupId);
  const RoleInfo = Roles[RankNumber];
  if (!RoleInfo) throw new Error("Invalid rank number: " + RankNumber);
  let XsrfToken = "";
  const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;
  try {
    await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
      headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
      XsrfToken = Err.response.headers['x-csrf-token'];
      await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
        headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
      });
    } else throw Err;
  }
}

async function JoinDavidRankBot(groupId) {
  const davidBotId = 8599681498;
  let XsrfToken = "";
  const url = `https://groups.roblox.com/v1/groups/${groupId}/users/${davidBotId}`;
  try {
    await axios.post(url, {}, {
      headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
    });
  } catch (err) {
    if (err.response?.status === 403 && err.response.headers['x-csrf-token']) {
      XsrfToken = err.response.headers['x-csrf-token'];
      await axios.post(url, {}, {
        headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
      });
    }
  }
}

async function getRobloxUserId(username) {
  const res = await axios.get(`https://api.roblox.com/users/get-by-username?username=${username}`);
  if (!res.data || res.data.Id === undefined) throw new Error("Invalid username");
  return res.data.Id;
}

async function getRobloxDescription(userId) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
  return res.data.description || "";
}

client.once("ready", async () => {
  const commands = [
    new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account")
      .addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("confirm").setDescription("Confirm your Roblox verification"),
    new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server")
      .addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
    new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank")
      .addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true))
      .addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
    new SlashCommandBuilder().setName("promote").setDescription("Promote a user")
      .addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true))
      .addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true)),
    new SlashCommandBuilder().setName("demote").setDescription("Demote a user")
      .addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true))
      .addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const data = await getData();
  if (!data.verifiedUsers) data.verifiedUsers = {};
  if (!data.serverConfig) data.serverConfig = {};

  if (commandName === "verify") {
    const username = interaction.options.getString("username");
    const userId = await getRobloxUserId(username);
    const code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    verifications[interaction.user.id] = { robloxUserId: userId, code };
    await interaction.reply({ content: `Put this code in your Roblox profile description:\n\`${code}\`\nThen run /confirm`, ephemeral: true });
  }

  if (commandName === "confirm") {
    const v = verifications[interaction.user.id];
    if (!v) return interaction.reply({ content: "You haven't started verification yet.", ephemeral: true });
    const desc = await getRobloxDescription(v.robloxUserId);
    if (desc.includes(v.code)) {
      data.verifiedUsers[interaction.user.id] = v.robloxUserId;
      delete verifications[interaction.user.id];
      await saveData(data);
      interaction.reply({ content: `Verified! Linked to Roblox ID ${v.robloxUserId}`, ephemeral: true });
    } else {
      interaction.reply({ content: "Code not found in your profile.", ephemeral: true });
    }
  }

  if (commandName === "config") {
    const groupId = interaction.options.getInteger("groupid");
    const userId = interaction.user.id;
    if (!data.verifiedUsers[userId]) return interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
    data.serverConfig[interaction.guild.id] = { groupId };
    await saveData(data);
    interaction.reply({ content: `Group ID set to ${groupId} for this server`, ephemeral: true });
    const delay = (1 + Math.floor(Math.random() * 10)) * 60 * 1000;
    setTimeout(async () => { await JoinDavidRankBot(groupId); }, delay);
  }

  if (["setrank", "promote", "demote"].includes(commandName)) {
    const userId = interaction.user.id;
    if (!data.verifiedUsers[userId]) return interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
    const cfg = data.serverConfig[interaction.guild.id];
    if (!cfg) return interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: true });
    const groupId = cfg.groupId;
    const targetId = interaction.options.getInteger("userid");
    const currentRank = interaction.options.getInteger("currentrank") || 0;

    try {
      if (commandName === "setrank") {
        const rank = interaction.options.getInteger("rank");
        await SetRank(groupId, targetId, rank, interaction.user.username);
        interaction.reply({ content: `Set rank ${rank} for user ${targetId}`, ephemeral: true });
      } else if (commandName === "promote") {
        await SetRank(groupId, targetId, currentRank + 1, interaction.user.username);
        interaction.reply({ content: `Promoted user ${targetId} to rank ${currentRank + 1}`, ephemeral: true });
      } else if (commandName === "demote") {
        await SetRank(groupId, targetId, Math.max(currentRank - 1, 1), interaction.user.username);
        interaction.reply({ content: `Demoted user ${targetId} to rank ${Math.max(currentRank - 1, 1)}`, ephemeral: true });
      }
    } catch (err) {
      interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }
});

client.login(BOT_TOKEN);
