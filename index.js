const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActivityType } = require("discord.js");
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
        new SlashCommandBuilder().setName("host").setDescription("Host a training!").addUserOption(opt => opt.setName("cohost").setDescription("Co-host (optional)").setRequired(false)).addUserOption(opt => opt.setName("supervisor").setDescription("Supervisor (optional)").setRequired(false))
    ].map(cmd => cmd.toJSON());
    const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    for (const [GuildId] of ClientBot.guilds.cache) {
        try { await Rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GuildId), { body: Commands }); } catch {}
    }
});

async function safeReply(interaction, options) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(options);
        } else {
            await interaction.followUp(options);
        }
    } catch {}
}

ClientBot.on("interactionCreate", async interaction => {
    if (interaction.isButton() && interaction.customId === "done_verification") {
        try {
            if (!interaction.deferred) await interaction.deferReply({ flags: 64 });
            const Data = Verifications[interaction.user.id];
            if (!Data) return safeReply(interaction, { content: "You haven't started verification yet.", flags: 64 });
            const Description = await GetRobloxDescription(Data.RobloxUserId);
            if (Description.includes(Data.Code)) {
                const Database = await GetJsonBin();
                Database.VerifiedUsers = Database.VerifiedUsers || {};
                Database.VerifiedUsers[interaction.user.id] = Data.RobloxUserId;
                await SaveJsonBin(Database);
                delete Verifications[interaction.user.id];
                await safeReply(interaction, { content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}`, flags: 64 });
            } else {
                await safeReply(interaction, { content: "Code not found in your profile. Make sure you added it and try again.", flags: 64 });
            }
        } catch {
            await safeReply(interaction, { content: "Verification failed. Try again later.", flags: 64 });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const CommandName = interaction.commandName;
    const GuildId = interaction.guild?.id;
    const Db = await GetJsonBin();

    if (CommandName === "verify") {
        const Username = interaction.options.getString("username");
        const UserId = await GetRobloxUserId(Username);
        const Code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        Verifications[interaction.user.id] = { RobloxUserId: UserId, Code };
        const Button = new ButtonBuilder().setCustomId("done_verification").setLabel("Done").setStyle(ButtonStyle.Primary);
        const Row = new ActionRowBuilder().addComponents(Button);
        await safeReply(interaction, { content: `Put this code in your Roblox profile description:\n${Code}\nThen click the Done button when finished.`, components: [Row], flags: 64 });
    }

    if (CommandName === "config") {
        const GroupId = interaction.options.getInteger("groupid");
        Db.ServerConfig = Db.ServerConfig || {};
        Db.ServerConfig[GuildId] = Db.ServerConfig[GuildId] || {};
        Db.ServerConfig[GuildId].GroupId = GroupId;
        await SaveJsonBin(Db);
        PendingApprovals[GroupId] = { requesterId: interaction.user.id, guildId: GuildId };
        try { await ClientBot.users.fetch(AdminId).then(u => u.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${interaction.user.id}>`)); } catch {}
        await safeReply(interaction, { content: `Group ID **${GroupId}** set! Waiting for admin approval.`, flags: 64 });
    }

    if (["setrank","promote","demote"].includes(CommandName)) {
        if (!Db.ServerConfig || !Db.ServerConfig[GuildId]) return await safeReply(interaction, { content: "Group ID not set. Run /config first.", flags: 64 });
        const GroupId = Db.ServerConfig[GuildId].GroupId;
        const Username = interaction.options.getString("username");
        try {
            const UserId = await GetRobloxUserId(Username);
            let Action, RoleName;
            if (CommandName === "setrank") {
                RoleName = interaction.options.getString("rankname");
                await SetRank(GroupId, UserId, RoleName, interaction.user.id, GuildId);
                Action = `Rank set to **${RoleName}**`;
            }
            if (CommandName === "promote") {
                const Current = await GetCurrentRank(GroupId, UserId);
                const Roles = await FetchRoles(GroupId);
                const Sorted = Object.values(Roles).sort((a,b)=>a.Rank-b.Rank);
                const CurrentIndex = Sorted.findIndex(r => r.Rank === Current.Rank);
                if (CurrentIndex === -1 || CurrentIndex === Sorted.length-1) throw new Error("Cannot promote further");
                const NewRole = Sorted[CurrentIndex+1];
                await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                RoleName = NewRole.Name;
                Action = `Promoted to **${NewRole.Name}**`;
            }
            if (CommandName === "demote") {
                const Current = await GetCurrentRank(GroupId, UserId);
                const Roles = await FetchRoles(GroupId);
                const Sorted = Object.values(Roles).sort((a,b)=>a.Rank-b.Rank);
                const CurrentIndex = Sorted.findIndex(r => r.Rank === Current.Rank);
                if (CurrentIndex<=0) throw new Error("Cannot demote further");
                const NewRole = Sorted[CurrentIndex-1];
                await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                RoleName = NewRole.Name;
                Action = `Demoted to **${NewRole.Name}**`;
            }
            const Embed = new EmbedBuilder().setColor(0x2ecc71).setTitle("Rank Updated").addFields(
                { name: "Username", value: Username, inline: true },
                { name: "Group ID", value: String(GroupId), inline: true },
                { name: "Action", value: Action, inline: false },
                { name: "Issued By", value: interaction.user.tag, inline: true },
                { name: "Date", value: new Date().toISOString().split("T")[0], inline: true }
            ).setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` });
            await safeReply(interaction, { embeds: [Embed] });
        } catch (Err) {
            const ErrorEmbed = new EmbedBuilder().setColor(0xe74c3c).setTitle("Failed").setDescription(Err.message || "Unknown error").addFields({ name: "Date", value: new Date().toISOString().split("T")[0], inline: true }).setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` });
            await safeReply(interaction, { embeds: [ErrorEmbed], flags: 64 });
        }
    }

    if (CommandName === "whois") {
        const TargetUser = interaction.options.getUser("user") || interaction.user;
        const RobloxUserId = (Db.VerifiedUsers||{})[TargetUser.id];
        if (!RobloxUserId) return await safeReply(interaction, { content: `${TargetUser.tag} has not verified a Roblox account.`, flags: 64 });
        const RobloxInfo = await GetRobloxUserInfo(RobloxUserId);
        const Embed = new EmbedBuilder().setColor(0x3498db).setTitle("User Lookup").addFields(
            { name: "Discord User", value: `${TargetUser.tag} (${TargetUser.id})`, inline: false },
            { name: "Roblox Username", value: `[${RobloxInfo.name}](https://www.roblox.com/users/${RobloxInfo.id}/profile)`, inline: true },
            { name: "Roblox User ID", value: String(RobloxInfo.id), inline: true },
            { name: "Description", value: RobloxInfo.description?.slice(0,200) || "None", inline: false }
        ).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${RobloxInfo.id}&width=150&height=150&format=png`).setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` });
        await safeReply(interaction, { embeds: [Embed] });
    }

    if (CommandName === "host") {
        const Member = interaction.member;
        if (!Member.roles.cache.has("1424007337210937445")) return await safeReply(interaction, { content: "You do not have permission to use this command!", flags: 64 });
        const Host = interaction.user;
        const CoHost = interaction.options.getUser("cohost");
        const Supervisor = interaction.options.getUser("supervisor");
        const Channel = await interaction.guild.channels.fetch("1398706795840536696").catch(() => null);
        if (!Channel) return await safeReply(interaction, { content: "Channel not found.", flags: 64 });
        const Embed = new EmbedBuilder().setColor(0x3498db).setTitle("A TRAINING IS BEING HOSTED").setDescription(`Host: <@${Host.id}>\nCo-Host: ${CoHost ? `<@${CoHost.id}>` : "None"}\nSupervisor: ${Supervisor ? `<@${Supervisor.id}>` : "None"}\nLink: [Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`).setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` });
        await Channel.send({ content: "<@&1404500986633916479>", embeds: [Embed] });
        await safeReply(interaction, { content: `Announcement sent to ${Channel.name}.`, flags: 64 });
    }
});

ClientBot.on("messageCreate", async message => {
    if (!message.content.startsWith("!")) return;
    if (message.author.id !== AdminId) return;
    const Args = message.content.split(" ");
    const Cmd = Args[0].toLowerCase();
    if (Cmd === "!accept" || Cmd === "!decline") {
        const GroupId = Args[1];
        if (!GroupId || !PendingApprovals[GroupId]) return message.reply("Invalid or unknown group ID.");
        const { requesterId } = PendingApprovals[GroupId];
        if (Cmd === "!accept") { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been accepted.`); delete PendingApprovals[GroupId]; return message.channel.send(`Accepted group ${GroupId} and notified <@${requesterId}>`); }
        if (Cmd === "!decline") { await ClientBot.users.send(requesterId, `Your group config (ID: ${GroupId}) has been declined.`); delete PendingApprovals[GroupId]; return message.channel.send(`Declined group ${GroupId} and notified <@${requesterId}>`); }
    }
    if (Cmd === "!setbottoken") {
        const TargetServerId = Args[1];
        const CustomToken = Args[2];
        if (!TargetServerId || !CustomToken) return message.reply("Usage: !setbottoken <serverid> <token>");
        Db.CustomTokens = Db.CustomTokens || {};
        Db.CustomTokens[TargetServerId] = CustomToken;
        await SaveJsonBin(Db);
        message.channel.send(`Custom Roblox token set for server ID ${TargetServerId}.`);
    }
});

ClientBot.login(process.env.BOT_TOKEN);
