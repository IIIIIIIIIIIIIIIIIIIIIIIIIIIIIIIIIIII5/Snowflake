const axios = require('axios');
const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const Db = admin.firestore();
const Verifications = {};
const PendingApprovals = {};

async function GetJsonBin() {
  try {
    const Doc = await Db.collection('botData').doc('main').get();
    return Doc.exists ? Doc.data() : {};
  } catch (Err) {
    console.error('GetJsonBin error:', Err);
    return {};
  }
}

async function SaveJsonBin(Data) {
  try {
    await Db.collection('botData').doc('main').set(Data, { merge: true });
  } catch (Err) {
    console.error('SaveJsonBin error:', Err);
  }
}

async function GetRobloxCookie(GuildId) {
  const Data = await GetJsonBin();
  if (Data.CustomTokens && Data.CustomTokens[GuildId]) return Data.CustomTokens[GuildId];
  return process.env.ROBLOSECURITY;
}

async function FetchRoles(GroupId) {
  const Res = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
  const Roles = {};
  Res.data.roles.forEach(r => {
    Roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id };
  });
  return Roles;
}

async function GetXsrfToken(GuildId) {
  const Cookie = await GetRobloxCookie(GuildId);
  try {
    const Res = await axios.post('https://auth.roblox.com/v2/logout', {}, {
      headers: { Cookie: `.ROBLOSECURITY=${Cookie}` }
    });
    return Res.headers['x-csrf-token'] || '';
  } catch (Err) {
    return Err.response?.headers['x-csrf-token'] || '';
  }
}

async function GetCurrentRank(GroupId, UserId) {
  const Res = await axios.get(`https://groups.roblox.com/v2/users/${UserId}/groups/roles`);
  const Group = Res.data.data.find(g => g.group.id === Number(GroupId));
  if (!Group) throw new Error('User not in group');
  return { Rank: Group.role.rank, Name: Group.role.name };
}

async function GetRobloxUsername(UserId) {
  const Res = await axios.get(`https://users.roblox.com/v1/users/${UserId}`);
  return Res.data.name;
}

async function GetRobloxUserId(Username) {
  const Res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [Username] }, {
    headers: { 'Content-Type': 'application/json' }
  });
  if (!Res.data.data || !Res.data.data[0]) throw new Error('Invalid username');
  return Res.data.data[0].id;
}

async function GetRobloxDescription(UserId) {
  const Res = await axios.get(`https://users.roblox.com/v1/users/${UserId}`);
  return Res.data.description || '';
}

async function SetRank(GroupId, UserId, RankOrId, IssuerDiscordId, GuildId, Client = global.ClientBot) {
  const Roles = await FetchRoles(GroupId);

  let RoleInfo = null;
  if (typeof RankOrId === 'number' || /^\d+$/.test(String(RankOrId))) {
    const RankNum = Number(RankOrId);
    for (const key of Object.keys(Roles)) {
      if (Number(Roles[key].Rank) === RankNum) { RoleInfo = Roles[key]; break; }
    }
  } else {
    RoleInfo = Roles[String(RankOrId).toLowerCase()];
  }

  if (!RoleInfo) throw new Error('Invalid rank specified: ' + RankOrId);

  if (IssuerDiscordId !== 'SYSTEM') {
    const DbData = await GetJsonBin();
    const IssuerRobloxId = DbData.VerifiedUsers?.[IssuerDiscordId];
    if (!IssuerRobloxId) throw new Error('You must verify first.');

    const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
    const Target = await GetCurrentRank(GroupId, UserId);

    if (String(UserId) === String(IssuerRobloxId)) throw new Error('You cannot change your own rank.');
    if (RoleInfo.Rank >= IssuerRank.Rank) throw new Error('Cannot assign a rank equal or higher than yours.');
    if (Target.Rank >= IssuerRank.Rank) throw new Error('Cannot change rank of a user higher or equal to you.');
  }

  const Cookie = await GetRobloxCookie(GuildId);
  const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;
  let Xsrf = await GetXsrfToken(GuildId);

  try {
    await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
      headers: {
        Cookie: `.ROBLOSECURITY=${Cookie}`,
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': Xsrf
      }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response?.headers['x-csrf-token']) {
      Xsrf = Err.response.headers['x-csrf-token'];
      await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
        headers: {
          Cookie: `.ROBLOSECURITY=${Cookie}`,
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': Xsrf
        }
      });
    } else {
      throw new Error('Request failed: ' + (Err.response?.data?.errors?.[0]?.message || Err.message));
    }
  }

  const Data = await GetJsonBin();
  if (!Data.RankChanges || !Array.isArray(Data.RankChanges)) Data.RankChanges = [];
  Data.RankChanges.push({
    GroupId,
    UserId,
    NewRank: RoleInfo.Name,
    IssuedBy: IssuerDiscordId,
    Timestamp: new Date().toISOString(),
    GuildId
  });
  await SaveJsonBin(Data);

  try {
    const Username = await GetRobloxUsername(UserId);
    const Guild = Client?.guilds ? await Client.guilds.fetch(GuildId).catch(() => null) : null;
    const LogChannel = Guild?.channels?.cache?.get('1424381038393556992');
    if (LogChannel) {
      const Embed = {
        color: 0x2f3136,
        title: 'Rank Updated',
        fields: [
          { name: 'Action By:', value: `${IssuerDiscordId === 'SYSTEM' ? 'SYSTEM' : `<@${IssuerDiscordId}>`}`, inline: true },
          { name: 'Action On:', value: Username, inline: true },
          { name: 'Action:', value: 'Set Rank', inline: true },
          { name: 'New Rank:', value: `${RoleInfo.Name}`, inline: false }
        ],
        timestamp: new Date()
      };
      await LogChannel.send({ embeds: [Embed] });
    }
  } catch (err) {
    console.error('SetRank logging error:', err.message);
  }
}

async function SuspendUser(GroupId, UserId, IssuerDiscordId, GuildId, Client = global.ClientBot, DurationMs = 0) {
  const DbData = await GetJsonBin();
  const Roles = await FetchRoles(GroupId);
  const SuspendedRole = Roles['suspended'];
  if (!SuspendedRole) throw new Error('Suspended rank not found.');

  const IssuerRobloxId = DbData.VerifiedUsers?.[IssuerDiscordId];
  if (!IssuerRobloxId) throw new Error('You must verify first.');

  const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
  const TargetRank = await GetCurrentRank(GroupId, UserId);

  if (String(UserId) === String(IssuerRobloxId)) throw new Error('You cannot suspend yourself.');
  if (TargetRank.Rank >= IssuerRank.Rank) throw new Error('Cannot suspend a user with equal or higher rank.');

  const Cookie = await GetRobloxCookie(GuildId);
  let Xsrf = await GetXsrfToken(GuildId);
  const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;

  try {
    await axios.patch(Url, { roleId: SuspendedRole.RoleId }, {
      headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, 'X-CSRF-TOKEN': Xsrf, 'Content-Type': 'application/json' }
    });
  } catch (Err) {
    if (Err.response?.status === 403 && Err.response?.headers['x-csrf-token']) {
      Xsrf = Err.response.headers['x-csrf-token'];
      await axios.patch(Url, { roleId: SuspendedRole.RoleId }, {
        headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, 'X-CSRF-TOKEN': Xsrf, 'Content-Type': 'application/json' }
      });
    } else throw new Error(Err.response?.data?.errors?.[0]?.message || Err.message);
  }

  const Username = await GetRobloxUsername(UserId);

  DbData.Suspensions = DbData.Suspensions || {};
  DbData.Suspensions[UserId] = {
    Username,
    IssuedBy: IssuerDiscordId,
    IssuedAt: Date.now(),
    EndsAt: DurationMs > 0 ? Date.now() + DurationMs : null,
    GroupId,
    GuildId,
    OldRankName: TargetRank.Name,
    OldRankValue: TargetRank.Rank,
    Reason: null,
    Active: true
  };

  await SaveJsonBin(DbData);

  if (DurationMs > 0) scheduleAutoUnsuspend(UserId, DbData.Suspensions[UserId], Client);

  try {
    const Guild = Client?.guilds ? await Client.guilds.fetch(GuildId).catch(() => null) : null;
    const LogChannelId = DbData.ServerConfig?.[GuildId]?.LoggingChannel || null;
    const LogChannel = Guild?.channels?.cache?.get(LogChannelId) || null;
    if (LogChannel) {
      const Embed = new EmbedBuilder()
        .setTitle('User Suspended')
        .setColor(0xff0000)
        .addFields(
          { name: 'Username', value: Username, inline: true },
          { name: 'Suspended By', value: `<@${IssuerDiscordId}>`, inline: true },
          { name: 'Date', value: new Date().toISOString().split('T')[0], inline: true }
        )
        .setTimestamp();
      await LogChannel.send({ embeds: [Embed] });
    }
  } catch (err) {
    console.error('SuspendUser log error:', err.message);
  }
}

const ScheduledTimers = {};

function ScheduleAutoUnsuspend(UserId, SuspensionRecord, Client) {
  try {
    const Now = Date.now();
    if (!SuspensionRecord || !SuspensionRecord.EndsAt) return;
    const Remaining = SuspensionRecord.EndsAt - Now;
    if (Remaining <= 0) {
      setImmediate(() => autoUnsuspend(UserId, Client));
      return;
    }
    if (ScheduledTimers[UserId]) clearTimeout(ScheduledTimers[UserId]);
    ScheduledTimers[UserId] = setTimeout(() => {
      autoUnsuspend(UserId, Client).catch(err => console.error('autoUnsuspend error:', err));
      delete ScheduledTimers[UserId];
    }, Remaining);
  } catch (err) {
    console.error('scheduleAutoUnsuspend error:', err);
  }
}

async function autoUnsuspend(UserId, Client = global.ClientBot) {
  const Data = await GetJsonBin();
  const Suspension = Data.Suspensions?.[UserId];
  if (!Suspension || !Suspension.Active) return;

  Suspension.Active = false;
  await SaveJsonBin(Data);

  const GroupId = Suspension.GroupId;
  const GuildId = Suspension.GuildId;
  let RankedBack = false;
  try {
    await SetRank(GroupId, UserId, Suspension.OldRankName || Suspension.OldRankValue, 'SYSTEM', GuildId, Client);
    RankedBack = true;
  } catch (err) {
    RankedBack = false;
  }

  try {
    const TargetDiscordId = Object.keys(Data.VerifiedUsers || {}).find(id => Data.VerifiedUsers[id] === UserId);
    if (TargetDiscordId) {
      const User = await Client.users.fetch(TargetDiscordId).catch(() => null);
      if (User) {
        const Embed = new EmbedBuilder()
          .setTitle('YOUR SUSPENSION HAS ENDED')
          .setColor(0x00ff00)
          .setDescription(`Dear, <@${TargetDiscordId}> your suspension has ended you have been ranked to your original role you may run /getrole.\n\nIf you have not been ranked please open a ticket in the [Administration](https://discord.gg/ZSJuzdVAee) server.`);
        await User.send({ embeds: [Embed] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('autoUnsuspend DM error:', err.message);
  }

  try {
    const Guild = Client?.guilds ? await Client.guilds.fetch(GuildId).catch(() => null) : null;
    const LogChannelId = (await GetJsonBin()).ServerConfig?.[GuildId]?.SuspensionLogChannel || Data.ServerConfig?.[GuildId]?.LoggingChannel || '1433025723932741694';
    const LogChannel = Guild?.channels?.cache?.get(LogChannelId) || null;

    const EndEmbed = new EmbedBuilder()
      .setTitle('Suspension Ended')
      .setColor(0x00ff00)
      .setDescription(`${Suspension.Username}'s suspension has ended`)
      .addFields(
        { name: 'Rank suspended from', value: Suspension.OldRankName || String(Suspension.OldRankValue), inline: false },
        { name: 'Reason for suspension', value: Suspension.Reason || 'N/A', inline: false },
        { name: 'Date suspended on', value: new Date(Suspension.IssuedAt).toLocaleString('en-GB'), inline: false },
        { name: 'Duration', value: Suspension.EndsAt ? `${Math.max(0, Math.floor((Suspension.EndsAt - Suspension.IssuedAt) / 1000))}s` : 'N/A', inline: false },
        { name: 'Has user been ranked back to their previous position', value: RankedBack ? 'Yes' : 'No', inline: false }
      )
      .setTimestamp();
    if (LogChannel?.isTextBased()) await LogChannel.send({ embeds: [EndEmbed] });
  } catch (err) {
    console.error('autoUnsuspend log error:', err.message);
  }
}

async function LoadActiveSuspensions(Client = global.ClientBot) {
  try {
    const Data = await GetJsonBin();
    for (const UserId of Object.keys(Data.Suspensions || {})) {
      const Suspension = Data.Suspensions[UserId];
      if (!Suspension || !Suspension.Active) continue;
      if (!Suspension.EndsAt) continue;
      ScheduleAutoUnsuspend(UserId, Suspension, Client);
    }
  } catch (err) {
    console.error('LoadActiveSuspensions error:', err);
  }
}

function StartVerification(DiscordId, RobloxUserId, Code) {
  Verifications[DiscordId] = { RobloxUserId, Code };
}

async function HandleVerificationButton(Interaction) {
  await Interaction.deferReply({ ephemeral: true });
  const Data = Verifications[Interaction.user.id];
  if (!Data) return Interaction.editReply({ content: "You haven't started verification yet." });

  try {
    const Desc = await GetRobloxDescription(Data.RobloxUserId);
    if (!Desc.includes(Data.Code)) return Interaction.editReply({ content: "Code not found in your profile. Make sure you added it and try again." });

    const DbData = await GetJsonBin();
    DbData.VerifiedUsers = DbData.VerifiedUsers || {};
    DbData.VerifiedUsers[Interaction.user.id] = Data.RobloxUserId;

    await SaveJsonBin(DbData);
    delete Verifications[Interaction.user.id];

    return Interaction.editReply({ content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}` });
  } catch (Err) {
    console.error('HandleVerificationButton error:', Err);
    return Interaction.editReply({ content: "An error occurred during verification." });
  }
}

module.exports = {
  GetJsonBin,
  SaveJsonBin,
  GetRobloxCookie,
  FetchRoles,
  GetXsrfToken,
  GetCurrentRank,
  SetRank,
  GetRobloxUserId,
  GetRobloxUserInfo: GetRobloxUsername,
  GetRobloxDescription,
  Verifications,
  PendingApprovals,
  StartVerification,
  HandleVerificationButton,
  SuspendUser,
  LoadActiveSuspensions
};
