const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const Cookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;

const serviceAccount = {
  type: "service_account",
  project_id: "rankingapi-27b94",
  private_key_id: "b29d7bc2859899f2cda71b31a353966b6ebb72e1",
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDdzc+Q8+e1+lfI
+ilIDUGG143zqxVNH5/9OSB4Ff4L99Ojp/vqecz+/hhTD7xlYQ3BFuoLYtRl4PvR
...rest of key...
-----END PRIVATE KEY-----\n`,
  client_email: "firebase-adminsdk-fbsvc@rankingapi-27b94.iam.gserviceaccount.com",
  client_id: "104075673530044448097",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40rankingapi-27b94.iam.gserviceaccount.com"
};

initializeApp({ credential: cert(serviceAccount) });

const Db = getFirestore();

const verifications = {};

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

        await Db.collection("rankChanges").add({
            groupId: GroupId,
            userId: UserId,
            newRank: RoleInfo,
            issuedBy: Issuer || "API",
            timestamp: new Date().toISOString()
        });
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
            XsrfToken = Err.response.headers['x-csrf-token'];
            await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
            });

            await Db.collection("rankChanges").add({
                groupId: GroupId,
                userId: UserId,
                newRank: RoleInfo,
                issuedBy: Issuer || "API",
                timestamp: new Date().toISOString()
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
            headers: {
                Cookie: `.ROBLOSECURITY=${Cookie}`,
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": XsrfToken
            }
        });
    } catch (err) {
        if (err.response?.status === 403 && err.response.headers['x-csrf-token']) {
            XsrfToken = err.response.headers['x-csrf-token'];
            await axios.post(url, {}, {
                headers: {
                    Cookie: `.ROBLOSECURITY=${Cookie}`,
                    "Content-Type": "application/json",
                    "X-CSRF-TOKEN": XsrfToken
                }
            });
        } else {
            console.error("Failed to add DavidRankBot to group:", err.message);
        }
    }
}

client.once("ready", async () => {
    console.log("Bot is ready!");

    const commands = [
        new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("confirm").setDescription("Confirm your Roblox verification"),
        new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
        new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true)),
        new SlashCommandBuilder().setName("demote").setDescription("Demote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("currentrank").setDescription("Current rank number").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "verify") {
        const username = interaction.options.getString("username");
        const userId = await getRobloxUserId(username);
        const code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        verifications[interaction.user.id] = { robloxUserId: userId, code };
        await interaction.reply({ content: `Put this code in your Roblox profile description:\n\`${code}\`\nThen run /confirm`, ephemeral: true });
    }

    if (commandName === "confirm") {
        const data = verifications[interaction.user.id];
        if (!data) return interaction.reply({ content: "You haven't started verification yet.", ephemeral: true });

        const desc = await getRobloxDescription(data.robloxUserId);
        if (desc.includes(data.code)) {
            await Db.collection("verifiedUsers").doc(interaction.user.id).set({ robloxId: data.robloxUserId });
            delete verifications[interaction.user.id];
            interaction.reply({ content: `✅ Verified! Linked to Roblox ID ${data.robloxUserId}`, ephemeral: true });
        } else {
            interaction.reply({ content: "❌ Code not found in your profile.", ephemeral: true });
        }
    }

    if (commandName === "config") {
        const groupId = interaction.options.getInteger("groupid");
        const doc = await Db.collection("verifiedUsers").doc(interaction.user.id).get();
        if (!doc.exists) return interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });

        await Db.collection("serverConfig").doc(interaction.guild.id).set({ groupId });
        interaction.reply({ content: `✅ Group ID set to **${groupId}** for this server. Make DavidRankBot join the group!`, ephemeral: true });

        const delay = (5 + Math.floor(Math.random() * 6 )) * 60 * 1000;
        setTimeout(async () => {
            await JoinDavidRankBot(groupId);
            console.log(`DavidRankBot joined group ${groupId}`)
        }, delay);
    }

    if (["setrank", "promote", "demote"].includes(commandName)) {
        const doc = await Db.collection("verifiedUsers").doc(interaction.user.id).get();
        if (!doc.exists) return interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });

        const cfg = await Db.collection("serverConfig").doc(interaction.guild.id).get();
        if (!cfg.exists) return interaction.reply({ content: "Group ID not set. Run /config <groupId> first.", ephemeral: true });
        const groupId = cfg.data().groupId;

        const userId = interaction.options.getInteger("userid");
        const currentRank = interaction.options.getInteger("currentrank") || 0;

        try {
            if (commandName === "setrank") {
                const rank = interaction.options.getInteger("rank");
                await SetRank(groupId, userId, rank, interaction.user.username);
                interaction.reply({ content: `✅ Set rank ${rank} for user ${userId}`, ephemeral: true });
            } else if (commandName === "promote") {
                await SetRank(groupId, userId, currentRank + 1, interaction.user.username);
                interaction.reply({ content: `✅ Promoted user ${userId} to rank ${currentRank + 1}`, ephemeral: true });
            } else if (commandName === "demote") {
                await SetRank(groupId, userId, Math.max(currentRank - 1, 1), interaction.user.username);
                interaction.reply({ content: `✅ Demoted user ${userId} to rank ${Math.max(currentRank - 1, 1)}`, ephemeral: true });
            }
        } catch (err) {
            interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true });
        }
    }
});

async function getRobloxUserId(username) {
    const res = await axios.get(`https://api.roblox.com/users/get-by-username?username=${username}`);
    if (!res.data || res.data.Id === undefined) throw new Error("Invalid username");
    return res.data.Id;
}

async function getRobloxDescription(userId) {
    const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    return res.data.description || "";
}

client.login(process.env.BOT_TOKEN);
