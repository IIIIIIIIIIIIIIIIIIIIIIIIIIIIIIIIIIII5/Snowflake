const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");

const ClientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const RobloxCookie = process.env.ROBLOSECURITY;
const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;
const API_KEY = process.env.AUTHKEY;
const API_PORT = process.env.PORT || 3000;

const Verifications = {};
const PendingApprovals = {};

async function FetchRoles(GroupId) {
    const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
    const Roles = {};
    Res.data.roles.forEach((Role) => {
        Roles[Role.rank] = { Id: Role.name, RoleId: Role.id };
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
            headers: {
                Cookie: `.ROBLOSECURITY=${RobloxCookie}`,
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": XsrfToken
            }
        });
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response?.headers["x-csrf-token"]) {
            XsrfToken = Err.response.headers["x-csrf-token"];
            try {
                await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                    headers: {
                        Cookie: `.ROBLOSECURITY=${RobloxCookie}`,
                        "Content-Type": "application/json",
                        "X-CSRF-TOKEN": XsrfToken
                    }
                });
            } catch (Err2) {
                throw new Error("Failed to set rank after retry: " + Err2.message);
            }
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

ClientBot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName;

    if (["setrank", "promote", "demote"].includes(cmd)) {
        await interaction.deferReply({ ephemeral: true });
        const Db = await GetJsonBin();
        if (!Db.ServerConfig || !Db.ServerConfig[interaction.guild.id]) return interaction.editReply("Group ID not set. Run /config first.");
        const GroupId = Db.ServerConfig[interaction.guild.id].GroupId;
        const UserId = interaction.options.getInteger("userid");

        try {
            let newRank;
            if (cmd === "setrank") {
                newRank = interaction.options.getInteger("rank");
                await SetRank(GroupId, UserId, newRank, interaction.user.username);
            }

            if (cmd === "promote") {
                const current = await GetCurrentRank(GroupId, UserId);
                newRank = current + 1;
                await SetRank(GroupId, UserId, newRank, interaction.user.username);
            }

            if (cmd === "demote") {
                const current = await GetCurrentRank(GroupId, UserId);
                newRank = Math.max(current - 1, 1);
                await SetRank(GroupId, UserId, newRank, interaction.user.username);
            }

            await interaction.editReply(`Rank updated! New rank: ${newRank}`);
        } catch (err) {
            await interaction.editReply(`Failed: ${err.message}`);
        }
    }
});

const app = express();
app.use(bodyParser.json());

function auth(req, res, next) {
    if (req.body.Auth !== API_KEY) return res.status(403).json({ error: "Unauthorized" });
    next();
}

app.post("/promote/:groupId", auth, async (req, res) => {
    const { groupId } = req.params;
    const { UserId } = req.body;
    if (!UserId) return res.status(400).json({ error: "Missing UserId" });

    try {
        const current = await GetCurrentRank(Number(groupId), String(UserId));
        const roles = await FetchRoles(Number(groupId));
        const maxRank = Math.max(...Object.keys(roles).map(Number));
        if (current >= maxRank) return res.status(400).json({ error: "User is at max rank" });
        const newRank = current + 1;
        await SetRank(Number(groupId), String(UserId), newRank, "API");
        res.json({ success: true, userId: UserId, oldRank: current, newRank });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/demote/:groupId", auth, async (req, res) => {
    const { groupId } = req.params;
    const { UserId } = req.body;
    if (!UserId) return res.status(400).json({ error: "Missing UserId" });

    try {
        const current = await GetCurrentRank(Number(groupId), String(UserId));
        const newRank = Math.max(current - 1, 1);
        await SetRank(Number(groupId), String(UserId), newRank, "API");
        res.json({ success: true, userId: UserId, oldRank: current, newRank });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/setrank/:groupId", auth, async (req, res) => {
    const { groupId } = req.params;
    const { UserId, RankNumber } = req.body;
    if (!UserId || !RankNumber) return res.status(400).json({ error: "Missing UserId or RankNumber" });

    try {
        await SetRank(Number(groupId), String(UserId), Number(RankNumber), "API");
        res.json({ success: true, userId: UserId, newRank: RankNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(API_PORT, () => console.log(`Ranking API running on port ${API_PORT}`));

ClientBot.login(process.env.BOT_TOKEN);
