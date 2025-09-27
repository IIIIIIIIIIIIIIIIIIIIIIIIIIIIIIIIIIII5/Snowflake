const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const ClientBot = new Client({ intents: [GatewayIntentBits.Guilds] });

const RobloxCookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;
const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const OWNER_ID = process.env.OWNER_ID;

const Verifications = {};
let LastAuditIds = {};
let LastMemberCounts = {};

async function FetchRoles(GroupId) {
    const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
    const Roles = {};
    Res.data.roles.forEach((Role, Index) => {
        Roles[Index + 1] = { Id: Role.name, RoleId: Role.id };
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
            headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
        });
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
            XsrfToken = Err.response.headers['x-csrf-token'];
            await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
            });
        } else throw Err;
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

async function startMemberCounter(GroupId) {
    const Db = await GetJsonBin();
    const counter = Db.GroupMemberCounter?.[GroupId];
    if (!counter || !counter.enabled) return;

    try {
        const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}`);
        const newCount = Res.data.memberCount;
        const groupName = Res.data.name;
        const milestoneStep = 100;
        const nextMilestone = Math.ceil(newCount / milestoneStep) * milestoneStep;
        const remaining = nextMilestone - newCount;

        const channel = ClientBot.channels.cache.get(counter.channelId);
        if (!channel) return;

        let msg;
        if (!counter.messageId) {
            msg = await channel.send(`:tada: **${groupName}** has **${newCount}** members! ${remaining} until ${nextMilestone}`);
            counter.messageId = msg.id;
        } else {
            msg = await channel.messages.fetch(counter.messageId).catch(() => null);
            if (msg) await msg.edit(`:tada: **${groupName}** has **${newCount}** members! ${remaining} until ${nextMilestone}`);
        }

        counter.lastCount = newCount;
        await SaveJsonBin(Db);
    } catch (err) {
        console.error("Member counter error:", err);
    }

    setTimeout(() => startMemberCounter(GroupId), 60000);
}

async function GroupAuditLogs(GroupId) {
    const Db = await GetJsonBin();
    const auditChannelId = Db.AuditLogs?.[GroupId]?.channelId;
    if (!auditChannelId) return;

    const channel = ClientBot.channels.cache.get(auditChannelId);
    if (!channel) return;

    try {
        const res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/audit-log?limit=50`, {
            headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}` }
        });

        const events = res.data.data || [];
        for (let i = events.length - 1; i >= 0; i--) {
            const e = events[i];
            if (LastAuditIds[GroupId] && e.id <= LastAuditIds[GroupId]) continue;

            const targetRes = await axios.get(`https://users.roblox.com/v1/users/${e.targetUserId}`);
            const targetUsername = targetRes.data.name;
            const targetAvatar = `https://www.roblox.com/headshot-thumbnail/image?userId=${e.targetUserId}&width=150&height=150&format=png`;

            const actorRes = await axios.get(`https://users.roblox.com/v1/users/${e.actorUserId}`);
            const actorUsername = actorRes.data.name;
            const actorAvatar = `https://www.roblox.com/headshot-thumbnail/image?userId=${e.actorUserId}&width=150&height=150&format=png`;

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setAuthor({ name: actorUsername, iconURL: actorAvatar })
                .setThumbnail(targetAvatar)
                .setDescription(`**Action on:** ${targetUsername}\n**Type:** ${e.actionType.replace(/_/g, " ")}`)
                .setFooter({ text: `Time: ${new Date(e.created).toLocaleString()}` });

            channel.send({ embeds: [embed] });
            LastAuditIds[GroupId] = e.id;
        }
    } catch (err) {
        console.error("Error fetching group audit logs:", err);
    }

    setTimeout(() => GroupAuditLogs(GroupId), 30000);
}

ClientBot.once("clientReady", async () => {
    const Commands = [
        new SlashCommandBuilder().setName("verify").setDescription("Verify your Roblox account").addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)),
        new SlashCommandBuilder().setName("config").setDescription("Set the group ID for this server").addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
        new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote a user by one rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("demote").setDescription("Demote a user by one rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("fire").setDescription("Set a user's rank to lowest").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("membercount").setDescription("Enable/disable live member count").addStringOption(opt => opt.setName("action").setDescription("Enable or Disable").setRequired(true).addChoices({ name: "Enable", value: "enable" }, { name: "Disable", value: "disable" })).addChannelOption(opt => opt.setName("channel").setDescription("Channel to send updates").setRequired(true)),
        new SlashCommandBuilder().setName("auditlog").setDescription("Set a channel for audit logs").addChannelOption(opt => opt.setName("channel").setDescription("Channel to send audit logs").setRequired(true)),
        new SlashCommandBuilder().setName("accept").setDescription("Accept a pending group config").addIntegerOption(opt => opt.setName("groupid").setDescription("Group ID to accept").setRequired(true)).setDefaultMemberPermissions(0).setDMPermission(false)
    ];

    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: Commands.map(c => c.toJSON()) });
    console.log("Global commands loaded.");
});

ClientBot.on("interactionCreate", async (Interaction) => {
    if (Interaction.isButton() && Interaction.customId === "done_verification") {
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
        return;
    }

    if (!Interaction.isChatInputCommand()) return;

    const Db = await GetJsonBin();
    const CommandName = Interaction.commandName;

    if (CommandName === "auditlog") {
        const channel = Interaction.options.getChannel("channel");
        const GroupId = Db.ServerConfig?.[Interaction.guild.id]?.GroupId;
        if (!GroupId) return Interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: true });
        Db.AuditLogs = Db.AuditLogs || {};
        Db.AuditLogs[GroupId] = { channelId: channel.id };
        await SaveJsonBin(Db);
        GroupAuditLogs(GroupId);
        return Interaction.reply({ content: `Audit log channel set to ${channel.name}`, ephemeral: true });
    }

    if (CommandName === "membercount") {
        const action = Interaction.options.getString("action");
        const channel = Interaction.options.getChannel("channel");
        const GroupId = Db.ServerConfig?.[Interaction.guild.id]?.GroupId;
        if (!GroupId) return Interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: true });
        Db.GroupMemberCounter = Db.GroupMemberCounter || {};
        if (action === "enable") {
            Db.GroupMemberCounter[GroupId] = { enabled: true, channelId: channel.id };
            await SaveJsonBin(Db);
            startMemberCounter(GroupId);
            return Interaction.reply({ content: "Member counter enabled.", ephemeral: true });
        } else {
            if (Db.GroupMemberCounter[GroupId]) Db.GroupMemberCounter[GroupId].enabled = false;
            await SaveJsonBin(Db);
            return Interaction.reply({ content: "Member counter disabled.", ephemeral: true });
        }
    }

    if (CommandName === "verify") {
        const Username = Interaction.options.getString("username");
        const UserId = await GetRobloxUserId(Username);
        const Code = "VERIFY-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        Verifications[Interaction.user.id] = { RobloxUserId: UserId, Code };
        const Button = new ButtonBuilder().setCustomId("done_verification").setLabel("Done").setStyle(ButtonStyle.Primary);
        const Row = new ActionRowBuilder().addComponents(Button);
        await Interaction.reply({
            content: `Put this code in your Roblox profile description:\n\`${Code}\`\nThen click **Done** when finished.`,
            components: [Row],
            ephemeral: true
        });
    }

    if (CommandName === "config") {
        const GroupId = Interaction.options.getInteger("groupid");
        if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
        Db.PendingConfigs = Db.PendingConfigs || {};
        Db.PendingConfigs[GroupId] = { UserId: Interaction.user.id, ServerId: Interaction.guild.id };
        await SaveJsonBin(Db);
        Interaction.reply({ content: `Config for group ${GroupId} submitted for approval.`, ephemeral: true });
        if (OWNER_ID) {
            const Owner = await ClientBot.users.fetch(OWNER_ID);
            Owner.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${Interaction.user.id}>`);
        }
    }

    if (CommandName === "accept") {
        if (Interaction.user.id !== OWNER_ID) return Interaction.reply({ content: "You cannot use this command.", ephemeral: true });
        const GroupId = Interaction.options.getInteger("groupid");
        if (!Db.PendingConfigs?.[GroupId]) return Interaction.reply({ content: "No pending config for that group.", ephemeral: true });
        const { UserId, ServerId } = Db.PendingConfigs[GroupId];
        delete Db.PendingConfigs[GroupId];
        Db.ServerConfig = Db.ServerConfig || {};
        Db.ServerConfig[ServerId] = { GroupId };
        await SaveJsonBin(Db);
        Interaction.reply({ content: `Accepted config for group ${GroupId}`, ephemeral: true });
        const TargetUser = await ClientBot.users.fetch(UserId);
        await TargetUser.send(`Your group config (ID: ${GroupId}) approved. Add bot to the group manually.`);
    }

    if (["setrank", "promote", "demote", "fire"].includes(CommandName)) {
        if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id]) return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
        const GroupId = Db.ServerConfig?.[Interaction.guild.id]?.GroupId;
        if (!GroupId) return Interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: true });
        const UserId = Interaction.options.getInteger("userid");
        try {
            if (CommandName === "setrank") {
                const Rank = Interaction.options.getInteger("rank");
                await SetRank(GroupId, UserId, Rank, Interaction.user.username);
                return Interaction.reply({ content: `Set rank ${Rank} for user ${UserId}`, ephemeral: true });
            } else if (CommandName === "fire") {
                const Roles = await FetchRoles(GroupId);
                const lowestRank = Math.min(...Object.keys(Roles).map(k => parseInt(k)));
                await SetRank(GroupId, UserId, lowestRank, Interaction.user.username);
                return Interaction.reply({ content: `User ${UserId} fired (set to lowest rank).`, ephemeral: true });
            } else {
                const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`);
                const CurrentRank = Res.data.role?.rank || 0;
                const NewRank = CommandName === "promote" ? CurrentRank + 1 : Math.max(CurrentRank - 1, 1);
                await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
                return Interaction.reply({ content: `${CommandName === "promote" ? "Promoted" : "Demoted"} user ${UserId} to rank ${NewRank}`, ephemeral: true });
            }
        } catch (Err) {
            return Interaction.reply({ content: `Error: ${Err.message}`, ephemeral: true });
        }
    }
});

ClientBot.login(process.env.BOT_TOKEN);
