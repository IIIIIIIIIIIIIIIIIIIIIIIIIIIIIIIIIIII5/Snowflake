const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActivityType } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");

const ClientBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const AdminId = process.env.ADMIN_ID;

const Verifications = {};
const PendingApprovals = {};

function formatNumber(num) {
    if (num < 1000) return num.toLocaleString();

    const suffixes = [
        "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
        "De", "Ud", "Dd", "Td", "Qad", "Qid", "Sxd", "Spd", "Ocd", "Nod",
        "Vg", "Uvg", "Dvg", "Tvg", "Qavg", "Qivg", "Sxvg", "Spvg", "Ocvg", "Novg",
        "Tg"
    ];

    const tier = Math.floor(Math.log10(num) / 3);

    if (tier < suffixes.length) {
        const suffix = suffixes[tier];
        const scale = Math.pow(10, tier * 3);
        const scaled = num / scale;
        return scaled.toFixed(2).replace(/\.00$/, '') + suffix;
    } else {
        return num.toExponential(2).replace("+", "");
    }
}

async function GetJsonBin() {
    try {
        const Res = await axios.get(`https://api.jsonbin.io/v3/b/${JsonBinId}/latest`, {
            headers: {
                "X-Master-Key": JsonBinSecret
            }
        });
        return Res.data.record || {};
    } catch {
        return {};
    }
}

async function SaveJsonBin(Data) {
    await axios.put(`https://api.jsonbin.io/v3/b/${JsonBinId}`, Data, {
        headers: {
            "X-Master-Key": JsonBinSecret,
            "Content-Type": "application/json"
        }
    });
}

async function GetRobloxCookie(guildId) {
    const Db = await GetJsonBin();
    if (Db.CustomTokens && Db.CustomTokens[guildId]) {
        return Db.CustomTokens[guildId];
    }
    return process.env.ROBLOSECURITY;
}

async function FetchRoles(GroupId) {
    const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
    const Roles = {};
    Res.data.roles.forEach(Role => {
        Roles[Role.name.toLowerCase()] = {
            Name: Role.name,
            Rank: Role.rank,
            RoleId: Role.id
        };
    });
    return Roles;
}

async function GetXsrfToken(guildId) {
    const RobloxCookie = await GetRobloxCookie(guildId);
    try {
        const Res = await axios.post("https://auth.roblox.com/v2/logout", {}, {
            headers: {
                Cookie: `.ROBLOSECURITY=${RobloxCookie}`
            }
        });
        return Res.headers["x-csrf-token"];
    } catch (Err) {
        return Err.response?.headers["x-csrf-token"] || "";
    }
}

async function GetCurrentRank(GroupId, UserId) {
    const Res = await axios.get(`https://groups.roblox.com/v2/users/${UserId}/groups/roles`);
    const GroupData = Res.data.data.find(g => g.group.id === GroupId);
    if (!GroupData) throw new Error("User not in group");
    return {
        Rank: GroupData.role.rank,
        Name: GroupData.role.name
    };
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
            throw new Error("Request failed: " + (Err.response?.data?.errors?.[0]?.message || Err.message));
        }
    }

    const Data = await GetJsonBin();
    Data.RankChanges = Data.RankChanges || [];
    Data.RankChanges.push({
        GroupId,
        UserId,
        NewRank: RoleInfo.Name,
        IssuedBy: IssuerId,
        Timestamp: new Date().toISOString().split("T")[0],
        GuildId: guildId
    });

    await SaveJsonBin(Data);
}

async function GetRobloxUserId(Username) {
    const Res = await axios.post("https://users.roblox.com/v1/usernames/users", {
        usernames: [Username]
    }, {
        headers: {
            "Content-Type": "application/json"
        }
    });

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
        new SlashCommandBuilder()
            .setName("verify")
            .setDescription("Verify your Roblox account")
            .addStringOption(opt => opt.setName("username").setDescription("Your Roblox username").setRequired(true)),
        new SlashCommandBuilder()
            .setName("config")
            .setDescription("Set the group ID for this server")
            .addIntegerOption(opt => opt.setName("groupid").setDescription("Roblox group ID").setRequired(true)),
        new SlashCommandBuilder()
            .setName("setrank")
            .setDescription("Set a user's rank")
            .addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true))
            .addStringOption(opt => opt.setName("rankname").setDescription("Rank name").setRequired(true)),
        new SlashCommandBuilder()
            .setName("promote")
            .setDescription("Promote a user")
            .addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)),
        new SlashCommandBuilder()
            .setName("demote")
            .setDescription("Demote a user")
            .addStringOption(opt => opt.setName("username").setDescription("Roblox username").setRequired(true)),
        new SlashCommandBuilder()
            .setName("whois")
            .setDescription("Lookup a Roblox user from a Discord user")
            .addUserOption(opt => opt.setName("user").setDescription("The Discord user to look up (leave blank for yourself)").setRequired(false)),
        new SlashCommandBuilder()
            .setName("host")
            .setDescription("Host a training!")
            .addUserOption(opt => opt.setName("cohost").setDescription("Co-host (optional)").setRequired(false))
            .addUserOption(opt => opt.setName("supervisor").setDescription("Supervisor (optional)").setRequired(false)),
        new SlashCommandBuilder()
            .setName("profile")
            .setDescription("View your training stats")
            .addUserOption(opt => opt.setName("user").setDescription("The Discord user to view (optional)").setRequired(false))
    ].map(cmd => cmd.toJSON());

    const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

    for (const [GuildId] of ClientBot.guilds.cache) {
        try {
            await Rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GuildId), { body: Commands });
        } catch {}
    }
});

ClientBot.on("interactionCreate", async interaction => {
    if (interaction.isButton() && interaction.customId === "done_verification") {
        const Data = Verifications[interaction.user.id];
        if (!Data) return interaction.reply({ content: "You haven't started verification yet.", ephemeral: false });

        const Description = await GetRobloxDescription(Data.RobloxUserId);
        if (Description.includes(Data.Code)) {
            const Database = await GetJsonBin();
            Database.VerifiedUsers = Database.VerifiedUsers || {};
            Database.VerifiedUsers[interaction.user.id] = Data.RobloxUserId;
            await SaveJsonBin(Database);
            delete Verifications[interaction.user.id];

            return interaction.reply({ content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}`, ephemeral: false });
        } else {
            return interaction.reply({ content: "Code not found in your profile. Make sure you added it and try again.", ephemeral: false });
        }
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

        return interaction.reply({
            content: `Put this code in your Roblox profile description:\n${Code}\nThen click the Done button when finished.`,
            components: [Row],
            ephemeral: false
        });
    }

    if (CommandName === "config") {
        const GroupId = interaction.options.getInteger("groupid");
        Db.ServerConfig = Db.ServerConfig || {};
        Db.ServerConfig[GuildId] = Db.ServerConfig[GuildId] || {};
        Db.ServerConfig[GuildId].GroupId = GroupId;
        await SaveJsonBin(Db);

        PendingApprovals[GroupId] = { requesterId: interaction.user.id, guildId: GuildId };
        try {
            await ClientBot.users.fetch(AdminId).then(u => u.send(`New pending config:\nGroup ID: ${GroupId}\nRequested by: <@${interaction.user.id}>`));
        } catch {}

        return interaction.reply({ content: `Group ID **${GroupId}** set! Waiting for admin approval.`, ephemeral: false });
    }

    if (["setrank", "promote", "demote"].includes(CommandName)) {
        if (!Db.ServerConfig || !Db.ServerConfig[GuildId]) return interaction.reply({ content: "Group ID not set. Run /config first.", ephemeral: false });

        const GroupId = Db.ServerConfig[GuildId].GroupId;
        const Username = interaction.options.getString("username");

        try {
            const UserId = await GetRobloxUserId(Username);
            let ActionType;
            let NewRankName;

            if (CommandName === "setrank") {
                NewRankName = interaction.options.getString("rankname");
                await SetRank(GroupId, UserId, NewRankName, interaction.user.id, GuildId);
                ActionType = "Set Rank";
            } else {
                const Current = await GetCurrentRank(GroupId, UserId);
                const Roles = await FetchRoles(GroupId);
                const Sorted = Object.values(Roles).sort((a, b) => a.Rank - b.Rank);
                const CurrentIndex = Sorted.findIndex(r => r.Rank === Current.Rank);

                if (CommandName === "promote") {
                    if (CurrentIndex === -1 || CurrentIndex === Sorted.length - 1) throw new Error("Cannot promote further");
                    const NewRole = Sorted[CurrentIndex + 1];
                    await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                    NewRankName = NewRole.Name;
                    ActionType = "Promoted";
                }

                if (CommandName === "demote") {
                    if (CurrentIndex <= 0) throw new Error("Cannot demote further");
                    const NewRole = Sorted[CurrentIndex - 1];
                    await SetRank(GroupId, UserId, NewRole.Name, interaction.user.id, GuildId);
                    NewRankName = NewRole.Name;
                    ActionType = "Demoted";
                }
            }

            const IssuerRobloxId = (Db.VerifiedUsers || {})[interaction.user.id];
            const TargetRobloxInfo = await GetRobloxUserInfo(UserId);
            const IssuerRobloxInfo = await GetRobloxUserInfo(IssuerRobloxId);
            const LogChannel = await interaction.guild.channels.fetch("1424381038393556992");

            if (LogChannel) {
                const LogEmbed = new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle("**Rank Updated**")
                    .addFields(
                        { name: "Action By:", value: IssuerRobloxInfo.name, inline: true },
                        { name: "Action On:", value: TargetRobloxInfo.name, inline: true },
                        { name: "Action:", value: ActionType, inline: true },
                        { name: "New Rank:", value: NewRankName, inline: true }
                    );
                LogChannel.send({ embeds: [LogEmbed] });
            }

            return interaction.reply({ content: `${ActionType} ${TargetRobloxInfo.name} to ${NewRankName}`, ephemeral: false });
        } catch (Err) {
            return interaction.reply({ content: `Error: ${Err.message}`, ephemeral: false });
        }
    }

    if (CommandName === "whois") {
        const TargetUser = interaction.options.getUser("user") || interaction.user;
        const RobloxUserId = (Db.VerifiedUsers || {})[TargetUser.id];
        if (!RobloxUserId) return interaction.reply({ content: `${TargetUser.tag} has not verified a Roblox account.`, ephemeral: false });

        const RobloxInfo = await GetRobloxUserInfo(RobloxUserId);
        return interaction.reply({
            content: `[${RobloxInfo.name}](https://www.roblox.com/users/${RobloxUserId}/profile)`,
            ephemeral: false
        });
    }

    if (CommandName === "host") {
        const Member = interaction.member;
        if (!Member.roles.cache.has("1424007337210937445")) return interaction.reply({ content: "You do not have permission to use this command!", ephemeral: false });

        const Host = interaction.user;
        const CoHost = interaction.options.getUser("cohost");
        const Supervisor = interaction.options.getUser("supervisor");
        const Channel = await interaction.guild.channels.fetch("1398706795840536696").catch(() => null);
        if (!Channel) return interaction.reply({ content: "Channel not found.", ephemeral: false });

        const Embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("A TRAINING IS BEING HOSTED")
            .setDescription(
                `Host: <@${Host.id}>\nCo-Host: ${CoHost ? `<@${CoHost.id}>` : "None"}\nSupervisor: ${Supervisor ? `<@${Supervisor.id}>` : "None"}\nLink: [Join Here](https://www.roblox.com/games/15542502077/RELEASE-Roblox-Correctional-Facility)`
            );

        await Channel.send({ content: "<@&1404500986633916479>", embeds: [Embed] });

        const Db = await GetJsonBin();
        Db.Trainings = Db.Trainings || {};
        const monthKey = new Date().toISOString().slice(0, 7);

        function addTraining(userId, type) {
            Db.Trainings[userId] = Db.Trainings[userId] || { hosted: {}, cohosted: {}, supervised: {} };
            const userData = Db.Trainings[userId][type];
            if (userData.lastMonth !== monthKey) {
                userData[monthKey] = 0;
                userData.lastMonth = monthKey;
            }
            userData[monthKey] = (userData[monthKey] || 0) + 1;
            userData.total = (userData.total || 0) + 1;
        }

        addTraining(Host.id, "hosted");
        if (CoHost) addTraining(CoHost.id, "cohosted");
        if (Supervisor) addTraining(Supervisor.id, "supervised");
        await SaveJsonBin(Db);

        return interaction.reply({ content: `Announcement sent to ${Channel.name}!`, ephemeral: false });
    }

    if (CommandName === "profile") {
        const TargetUser = interaction.options.getUser("user") || interaction.user;
        const Db = await GetJsonBin();
        const TrainingData = Db.Trainings?.[TargetUser.id];

        if (!TrainingData) return interaction.reply({ content: `${TargetUser.username} has no training data.`, ephemeral: false });

        const Hosted = formatNumber(TrainingData.hosted?.total || 0);
        const CoHosted = formatNumber(TrainingData.cohosted?.total || 0);
        const Supervised = formatNumber(TrainingData.supervised?.total || 0);

        const Embed = new EmbedBuilder()
            .setColor(0x7289da)
            .setTitle(`${TargetUser.username}'s Profile`)
            .addFields(
                { name: "Trainings Hosted", value: Hosted, inline: true },
                { name: "Trainings Co-Hosted", value: CoHosted, inline: true },
                { name: "Trainings Supervised", value: Supervised, inline: true }
            );

        return interaction.reply({ embeds: [Embed], ephemeral: false });
    }
});

ClientBot.login(process.env.BOT_TOKEN);
