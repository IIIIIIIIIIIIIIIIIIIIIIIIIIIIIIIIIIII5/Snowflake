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
    Res.data.roles.forEach(Role => Roles[Role.rank] = { Id: Role.name, RoleId: Role.id });
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

async function GetActiveToken(guildId) {
    const db = await GetJsonBin();
    if (db.CustomTokens && db.CustomTokens[guildId]) return db.CustomTokens[guildId];
    return process.env.BOT_TOKEN;
}

ClientBot.once("ready", async () => {
    ClientBot.user.setActivity("Snowflake Prison Roleplay", { type: ActivityType.Watching });

    const Commands = [
        new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
        new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("demote").setDescription("Demote a user").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("whois").setDescription("Lookup a Roblox user from a Discord user").addUserOption(opt => opt.setName("user").setDescription("The Discord user to look up (leave blank for yourself)").setRequired(false)),
        new SlashCommandBuilder().setName("setbottoken").setDescription("Set a custom bot token for a server").addStringOption(opt => opt.setName("serverid").setDescription("Server ID").setRequired(true)).addStringOption(opt => opt.setName("token").setDescription("Bot token").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    await Rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: Commands });
});

ClientBot.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        const CommandName = interaction.commandName;
        const guildId = interaction.guild?.id;

        if (CommandName === "setbottoken") {
            if (interaction.user.id !== ADMIN_ID) return interaction.reply({ content: "You are not authorized.", ephemeral: true });
            const targetServerId = interaction.options.getString("serverid");
            const customToken = interaction.options.getString("token");
            const db = await GetJsonBin();
            db.CustomTokens = db.CustomTokens || {};
            db.CustomTokens[targetServerId] = customToken;
            await SaveJsonBin(db);
            return interaction.reply({ content: `Custom bot token set for server ID ${targetServerId}.`, ephemeral: true });
        }

        const activeToken = await GetActiveToken(guildId);

        if (CommandName === "verify") {
            const Username = interaction.options.getString("username");
            const UserId = await GetRobloxUserId(Username);
            const Code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
            Verifications[interaction.user.id] = { RobloxUserId: UserId, Code };
            const Button = new ButtonBuilder().setCustomId("done_verification").setLabel("Done").setStyle(ButtonStyle.Primary);
            const Row = new ActionRowBuilder().addComponents(Button);
            await interaction.reply({ content: `Put this code in your Roblox profile description:\n\`${Code}\`\nThen click the Done button when finished.`, components: [Row], ephemeral: true });
        }

        if (CommandName === "config") {
            const GroupId = interaction.options.getInteger("groupid");
            const Db = await GetJsonBin();
            Db.ServerConfig = Db.ServerConfig || {};
            Db.ServerConfig[interaction.guild.id] = Db.ServerConfig[interaction.guild.id] || {};
            Db.ServerConfig[interaction.guild.id].GroupId = GroupId;
            await SaveJsonBin(Db);
            PendingApprovals[GroupId] = { requesterId: interaction.user.id, guildId: interaction.guild.id };
            try { await ClientBot.users.fetch(ADMIN_ID).then(u => u.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${interaction.user.id}>`)); } catch {}
            await interaction.reply({ content: `Group ID **${GroupId}** set! Waiting for admin approval.`, ephemeral: true });
        }

        if (["setrank", "promote", "demote"].includes(CommandName)) {
            const Db = await GetJsonBin();
            if (!Db.ServerConfig || !Db.ServerConfig[guildId]) return interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: true });
            const GroupId = Db.ServerConfig[guildId].GroupId;
            const UserId = interaction.options.getInteger("userid");
            try {
                let NewRank, Action;
                if (CommandName === "setrank") { NewRank = interaction.options.getInteger("rank"); await SetRank(GroupId, UserId, NewRank, interaction.user.username); Action = `Rank set to **${NewRank}**`; }
                if (CommandName === "promote") { NewRank = await GetCurrentRank(GroupId, UserId) + 1; await SetRank(GroupId, UserId, NewRank, interaction.user.username); Action = `Promoted to **${NewRank}**`; }
                if (CommandName === "demote") { NewRank = Math.max(await GetCurrentRank(GroupId, UserId) - 1, 1); await SetRank(GroupId, UserId, NewRank, interaction.user.username); Action = `Demoted to **${NewRank}**`; }
                const dateOnly = new Date().toISOString().split("T")[0];
                const Embed = new EmbedBuilder().setColor(0x2ecc71).setTitle("Updated").addFields(
                    { name: "User ID", value: String(UserId), inline: true },
                    { name: "Group ID", value: String(GroupId), inline: true },
                    { name: "Action", value: Action, inline: false },
                    { name: "Issued By", value: interaction.user.tag, inline: true },
                    { name: "Date", value: dateOnly, inline: true }
                );
                await interaction.reply({ embeds: [Embed] });
            } catch (Err) { const dateOnly = new Date().toISOString().split("T")[0]; const ErrorEmbed = new EmbedBuilder().setColor(0xe74c3c).setTitle("Failed").setDescription(Err.message || "Unknown error").addFields({ name: "Date", value: dateOnly, inline: true }); await interaction.reply({ embeds: [ErrorEmbed], ephemeral: true }); }
        }

        if (CommandName === "whois") {
            const TargetUser = interaction.options.getUser("user") || interaction.user;
            const Db = await GetJsonBin();
            const RobloxUserId = (Db.VerifiedUsers || {})[TargetUser.id];
            if (!RobloxUserId) return interaction.reply({ content: `${TargetUser.tag} has not verified a Roblox account.`, ephemeral: true });
            const RobloxInfo = (await axios.get(`https://users.roblox.com/v1/users/${RobloxUserId}`)).data;
            const Embed = new EmbedBuilder().setColor(0x3498db).setTitle("User Lookup").addFields(
                { name: "Discord User", value: `${TargetUser.tag} (${TargetUser.id})`, inline: false },
                { name: "Roblox Username", value: `[${RobloxInfo.name}](https://www.roblox.com/users/${RobloxInfo.id}/profile)`, inline: true },
                { name: "Roblox User ID", value: String(RobloxInfo.id), inline: true },
                { name: "Description", value: RobloxInfo.description?.slice(0, 200) || "None", inline: false }
            ).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${RobloxInfo.id}&width=150&height=150&format=png`);
            await interaction.reply({ embeds: [Embed] });
        }
    }

    if (interaction.isButton() && interaction.customId === "done_verification") {
        const Data = Verifications[interaction.user.id];
        if (!Data) return interaction.reply({ content: "You haven't started verification yet.", ephemeral: true });
        const Description = await GetRobloxDescription(Data.RobloxUserId);
        if (Description.includes(Data.Code)) {
            const Database = await GetJsonBin();
            Database.VerifiedUsers = Database.VerifiedUsers || {};
            Database.VerifiedUsers[interaction.user.id] = Data.RobloxUserId;
            await SaveJsonBin(Database);
            delete Verifications[interaction.user.id];
            interaction.reply({ content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}`, ephemeral: true });
        } else {
            interaction.reply({ content: "Code not found in your profile. Make sure you added it and try again.", ephemeral: true });
        }
    }
});

ClientBot.on("messageCreate", async message => {
    if (!message.content.startsWith("!")) return;
    if (message.author.id !== ADMIN_ID) return;
    const args = message.content.split(" ");
    const cmd = args[0].toLowerCase();

    if (cmd === "!accept" || cmd === "!decline") {
        const GroupId = args[1];
        if (!GroupId || !PendingApprovals[GroupId]) return message.reply("Invalid or unknown group ID.");
        const { requesterId } = PendingApprovals[GroupId];
        if (cmd === "!accept") { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been accepted.`); delete PendingApprovals[GroupId]; return message.channel.send(`Accepted group ${GroupId} and notified <@${requesterId}>`); }
        if (cmd === "!decline") { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been declined.`); delete PendingApprovals[GroupId]; return message.channel.send(`Declined group ${GroupId} and notified <@${requesterId}>`); }
    }

    if (cmd === "!setbottoken") {
        const targetServerId = args[1];
        const customToken = args[2];
        if (!targetServerId || !customToken) return message.reply("Usage: !setbottoken <serverid> <token>");
        const db = await GetJsonBin();
        db.CustomTokens = db.CustomTokens || {};
        db.CustomTokens[targetServerId] = customToken;
        await SaveJsonBin(db);
        message.channel.send(`Custom bot token set for server ID ${targetServerId}.`);
    }
});

ClientBot.login(process.env.BOT_TOKEN);
