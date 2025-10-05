const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const ClientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const AdminId = process.env.ADMIN_ID;

const Verifications = {};
const PendingApprovals = {};

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

async function GetRobloxCookie(guildId) {
    const Db = await GetJsonBin();
    if (Db.CustomTokens && Db.CustomTokens[guildId]) return Db.CustomTokens[guildId];
    return process.env.ROBLOSECURITY;
}

async function FetchRoles(GroupId) {
    const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
    const Roles = {};
    Res.data.roles.forEach(Role => Roles[Role.name.toLowerCase()] = { Name: Role.name, Rank: Role.rank, RoleId: Role.id });
    return Roles;
}

async function GetXsrfToken(guildId) {
    const RobloxCookie = await GetRobloxCookie(guildId);
    try {
        const Res = await axios.post("https://auth.roblox.com/v2/logout", {}, { headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}` } });
        return Res.headers["x-csrf-token"];
    } catch (Err) {
        return Err.response?.headers["x-csrf-token"] || "";
    }
}

async function GetCurrentRank(GroupId, UserId) {
    const Res = await axios.get(`https://groups.roblox.com/v2/users/${UserId}/groups/roles`);
    const GroupData = Res.data.data.find(g => g.group.id === GroupId);
    if (!GroupData) throw new Error("User not in group");
    return { Rank: GroupData.role.rank, Name: GroupData.role.name };
}

async function SetRank(GroupId, UserId, RankName, IssuerId, guildId) {
    const Roles = await FetchRoles(GroupId);
    const RoleInfo = Roles[RankName.toLowerCase()];
    if (!RoleInfo) throw new Error("Invalid rank name: " + RankName);
    const TargetRank = await GetCurrentRank(GroupId, UserId);
    const Db = await GetJsonBin();
    const IssuerRobloxId = Db.VerifiedUsers?.[IssuerId];
    if (!IssuerRobloxId) throw new Error("You must verify first.");
    const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
    if (UserId === IssuerRobloxId) throw new Error("You cannot change your own rank.");
    if (RoleInfo.Rank >= IssuerRank.Rank) throw new Error("Cannot assign a rank equal or higher than yours.");
    if (TargetRank.Rank >= IssuerRank.Rank) throw new Error("Cannot change rank of a user higher or equal to you.");
    const RobloxCookie = await GetRobloxCookie(guildId);
    const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;
    let XsrfToken = await GetXsrfToken(guildId);
    try {
        await axios.patch(Url, { roleId: RoleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken } });
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response?.headers["x-csrf-token"]) {
            XsrfToken = Err.response.headers["x-csrf-token"];
            await axios.patch(Url, { roleId: RoleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken } });
        } else {
            throw new Error("Request failed: " + (Err.response?.data?.errors?.[0]?.message || Err.message));
        }
    }
    const Data = await GetJsonBin();
    Data.RankChanges = Data.RankChanges || [];
    Data.RankChanges.push({ GroupId, UserId, NewRank: RoleInfo.Name, IssuedBy: IssuerId, Timestamp: new Date().toISOString().split("T")[0], GuildId: guildId });
    await SaveJsonBin(Data);
}

async function GetRobloxUserId(Username) {
    const Res = await axios.post("https://users.roblox.com/v1/usernames/users", { usernames: [Username] }, { headers: { "Content-Type": "application/json" } });
    if (!Res.data.data || !Res.data.data[0]) throw new Error("Invalid username");
    return Res.data.data[0].id;
}

async function GetRobloxUserInfo(UserId) {
    const Res = await axios.get(`https://users.roblox.com/v1/users/${UserId}`);
    return Res.data;
}

async function GetRobloxDescription(UserId) {
    const Res = await axios.get(`https://users.roblox.com/v1/users/${UserId}`);
    return Res.data.description || "";
}

ClientBot.once("ready", async () => {
    ClientBot.user.setActivity("Snowflake Prison Roleplay", { type: ActivityType.Watching });
    const Commands = [
        new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
        new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)).addStringOption(opt => opt.setName("rankname").setDescription("Rank name").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote a user").addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("demote").setDescription("Demote a user").addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("whois").setDescription("Lookup a Roblox user from a Discord user").addUserOption(opt => opt.setName("user").setDescription("The Discord user to look up (leave blank for yourself)").setRequired(false)),
        new SlashCommandBuilder().setName("profile").setDescription("View your training stats").addUserOption(opt => opt.setName("user").setDescription("The Discord user to view (optional)").setRequired(false))
    ].map(cmd => cmd.toJSON());

    const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    for (const [GuildId] of ClientBot.guilds.cache) {
        try { await Rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GuildId), { body: Commands }); } catch {}
    }
});

ClientBot.on("interactionCreate", async interaction => {
    if (interaction.isButton() && interaction.customId === "done_verification") {
        await interaction.deferReply({ ephemeral: true });
        const Data = Verifications[interaction.user.id];
        if (!Data) return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Error").setDescription("You haven't started verification yet.").setColor("Red")] });
        const Description = await GetRobloxDescription(Data.RobloxUserId);
        if (Description.includes(Data.Code)) {
            const Database = await GetJsonBin();
            Database.VerifiedUsers = Database.VerifiedUsers || {};
            Database.VerifiedUsers[interaction.user.id] = Data.RobloxUserId;
            await SaveJsonBin(Database);
            delete Verifications[interaction.user.id];
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Verified").setDescription(`Linked to Roblox ID ${Data.RobloxUserId}`).setColor("Green")] });
        } else {
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Verification Failed").setDescription("Code not found in your profile. Make sure you added it and try again.").setColor("Red")] });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const CommandName = interaction.commandName;
    const GuildId = interaction.guild?.id;
    const Db = await GetJsonBin();
    await interaction.deferReply({ ephemeral: true });

    if (CommandName === "verify") {
        const Username = interaction.options.getString("username");
        const UserId = await GetRobloxUserId(Username);
        const Code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        Verifications[interaction.user.id] = { RobloxUserId: UserId, Code };
        const Button = new ButtonBuilder().setCustomId("done_verification").setLabel("Done").setStyle(ButtonStyle.Primary);
        const Row = new ActionRowBuilder().addComponents(Button);
        const Embed = new EmbedBuilder().setTitle("Verification").setDescription(`Put this code in your Roblox profile description:\n**${Code}**\nThen click the Done button when finished.`).setColor("Blue");
        return interaction.editReply({ embeds: [Embed], components: [Row] });
    }

    if (CommandName === "config") {
        const GroupId = interaction.options.getInteger("groupid");
        Db.ServerConfig = Db.ServerConfig || {};
        Db.ServerConfig[GuildId] = Db.ServerConfig[GuildId] || {};
        Db.ServerConfig[GuildId].GroupId = GroupId;
        await SaveJsonBin(Db);
        PendingApprovals[GroupId] = { requesterId: interaction.user.id, guildId: GuildId };
        try { await ClientBot.users.fetch(AdminId).then(u => u.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${interaction.user.id}>`)); } catch {}
        const Embed = new EmbedBuilder().setTitle("Config Set").setDescription(`Group ID **${GroupId}** set! Waiting for admin approval.`).setColor("Blue");
        return interaction.editReply({ embeds: [Embed] });
    }

    if (["setrank","promote","demote"].includes(CommandName)) {
        if (!Db.ServerConfig || !Db.ServerConfig[GuildId]) {
            const Embed = new EmbedBuilder().setTitle("Error").setDescription("Group ID not set. Run /config first.").setColor("Red");
            return interaction.editReply({ embeds: [Embed] });
        }
        const GroupId = Db.ServerConfig[GuildId].GroupId;
        const Username = interaction.options.getString("username");
        try {
            const UserId = await GetRobloxUserId(Username);
            let ActionType, NewRankName;
            if (CommandName === "setrank") {
                NewRankName = interaction.options.getString("rankname");
                await SetRank(GroupId, UserId, NewRankName, interaction.user.id, GuildId);
                ActionType = "Set Rank";
            }
            if (CommandName === "promote") {
                const Current = await GetCurrentRank(GroupId, UserId);
                const Roles = await FetchRoles(GroupId);
                const Sorted = Object.values(Roles).sort((a,b)=>a.Rank-b.Rank);
                const CurrentIndex = Sorted.findIndex(r => r.Rank === Current.Rank);
                if (CurrentIndex === -1 || CurrentIndex === Sorted.length-1) throw new Error("Cannot promote further");
                const NewRole = Sorted[CurrentIndex+1];
                await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                NewRankName = NewRole.Name;
                ActionType = "Promoted";
            }
            if (CommandName === "demote") {
                const Current = await GetCurrentRank(GroupId, UserId);
                const Roles = await FetchRoles(GroupId);
                const Sorted = Object.values(Roles).sort((a,b)=>a.Rank-b.Rank);
                const CurrentIndex = Sorted.findIndex(r => r.Rank === Current.Rank);
                if (CurrentIndex<=0) throw new Error("Cannot demote further");
                const NewRole = Sorted[CurrentIndex-1];
                await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                NewRankName = NewRole.Name;
                ActionType = "Demoted";
            }
            const Embed = new EmbedBuilder().setTitle(ActionType).setDescription(`${ActionType} ${Username} to **${NewRankName}**.`).setColor("Green");
            return interaction.editReply({ embeds: [Embed] });
        } catch (Err) {
            const Embed = new EmbedBuilder().setTitle("Error").setDescription(Err.message).setColor("Red");
            return interaction.editReply({ embeds: [Embed] });
        }
    }

    if (CommandName === "whois") {
        let TargetUser = interaction.options.getUser("user") || interaction.user;
        const RobloxId = Db.VerifiedUsers?.[TargetUser.id];
        if (!RobloxId) {
            const Embed = new EmbedBuilder().setTitle("Error").setDescription("User not verified.").setColor("Red");
            return interaction.editReply({ embeds: [Embed] });
        }
        const Info = await GetRobloxUserInfo(RobloxId);
        const Embed = new EmbedBuilder()
            .setTitle(`Whois: ${TargetUser.tag}`)
            .setDescription(`Roblox username: ${Info.name}\nDisplay name: ${Info.displayName}\nID: ${Info.id}`)
            .setColor("Blue");
        return interaction.editReply({ embeds: [Embed] });
    }

    if (CommandName === "profile") {
        let TargetUser = interaction.options.getUser("user") || interaction.user;
        const RobloxId = Db.VerifiedUsers?.[TargetUser.id];
        if (!RobloxId) {
            const Embed = new EmbedBuilder().setTitle("Error").setDescription("User not verified.").setColor("Red");
            return interaction.editReply({ embeds: [Embed] });
        }
        const Info = await GetRobloxUserInfo(RobloxId);
        const Embed = new EmbedBuilder()
            .setTitle(`Profile for ${TargetUser.tag}`)
            .setDescription(`Roblox username: ${Info.name}\nDisplay name: ${Info.displayName}\nID: ${Info.id}`)
            .setColor("Blue");
        return interaction.editReply({ embeds: [Embed] });
    }
});

ClientBot.login(process.env.BOT_TOKEN);
