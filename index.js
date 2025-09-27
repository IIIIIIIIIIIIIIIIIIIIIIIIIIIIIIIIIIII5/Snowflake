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
        await LogRankChange(GroupId, UserId, RoleInfo, Issuer);
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
            XsrfToken = Err.response.headers['x-csrf-token'];
            await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${RobloxCookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
            });
            await LogRankChange(GroupId, UserId, RoleInfo, Issuer);
        } else throw Err;
    }
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
        new SlashCommandBuilder().setName("accept").setDescription("Accept a pending group config").addIntegerOption(opt => opt.setName("groupid").setDescription("Group ID to accept").setRequired(true)),
        new SlashCommandBuilder().setName("setrank").setDescription("Set a user's rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)).addIntegerOption(opt => opt.setName("rank").setDescription("Rank number").setRequired(true)),
        new SlashCommandBuilder().setName("promote").setDescription("Promote a user by one rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true)),
        new SlashCommandBuilder().setName("demote").setDescription("Demote a user by one rank").addIntegerOption(opt => opt.setName("userid").setDescription("Roblox user ID").setRequired(true))
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
            const GroupId = Interaction.options.getInteger("groupid");
            const Db = await GetJsonBin();
            if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id])
                return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });

            Db.PendingConfigs = Db.PendingConfigs || {};
            Db.PendingConfigs[GroupId] = { UserId: Interaction.user.id, ServerId: Interaction.guild.id };
            await SaveJsonBin(Db);

            Interaction.reply({ content: `Config for group **${GroupId}** submitted for approval.`, ephemeral: true });

            const Owner = await ClientBot.users.fetch(process.env.OWNER_ID);
            Owner.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${Interaction.user.id}>`);
        }

        if (CommandName === "accept") {
            const GroupId = Interaction.options.getInteger("groupid");
            const Db = await GetJsonBin();
            if (!Db.PendingConfigs || !Db.PendingConfigs[GroupId])
                return Interaction.reply({ content: "No pending config for that group.", ephemeral: true });

            const { UserId, ServerId } = Db.PendingConfigs[GroupId];
            delete Db.PendingConfigs[GroupId];
            Db.ServerConfig = Db.ServerConfig || {};
            Db.ServerConfig[ServerId] = { GroupId };
            await SaveJsonBin(Db);

            Interaction.reply({ content: `Accepted config for group ${GroupId}`, ephemeral: true });

            const TargetUser = await ClientBot.users.fetch(UserId);
            await TargetUser.send(`Your group config (ID: ${GroupId}) has been approved. Please add DavidRankBot to the group manually so it can manage ranks.`);
        }

        if (["setrank", "promote", "demote"].includes(CommandName)) {
            const Db = await GetJsonBin();
            if (!Db.VerifiedUsers || !Db.VerifiedUsers[Interaction.user.id])
                return Interaction.reply({ content: "You must verify first with /verify.", ephemeral: true });
            if (!Db.ServerConfig || !Db.ServerConfig[Interaction.guild.id])
                return Interaction.reply({ content: "Group ID not set. Run /config <groupId> first.", ephemeral: true });

            const GroupId = Db.ServerConfig[Interaction.guild.id].GroupId;
            const UserId = Interaction.options.getInteger("userid");

            try {
                if (CommandName === "setrank") {
                    const Rank = Interaction.options.getInteger("rank");
                    await SetRank(GroupId, UserId, Rank, Interaction.user.username);
                    Interaction.reply({ content: `Set rank ${Rank} for user ${UserId}`, ephemeral: true });
                } else {
                    const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`);
                    const CurrentRank = Res.data.role?.rank || 0;
                    const NewRank = CommandName === "promote" ? CurrentRank + 1 : Math.max(CurrentRank - 1, 1);

                    await SetRank(GroupId, UserId, NewRank, Interaction.user.username);
                    Interaction.reply({
                        content: `${CommandName === "promote" ? "Promoted" : "Demoted"} user ${UserId} to rank ${NewRank}`,
                        ephemeral: true
                    });
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
