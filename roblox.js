const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');

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
const ScheduledTimers = {};
const MaxTimeout = 2147483647;
const PredefinedDurations = {
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000
};

let loggedIn = false;

async function loginRoblox() {
  if (loggedIn) return;
  const fullCookie = process.env.ROBLOSECURITY;
  if (!fullCookie) throw new Error("Cookie not set");

  await noblox.setCookie(fullCookie);
  loggedIn = true;
}

async function GetJsonBin() {
  try {
    const Doc = await Db.collection('botData').doc('main').get();
    return Doc.exists ? Doc.data() : {};
  } catch { return {}; }
}

async function SaveJsonBin(Data) {
  try { await Db.collection('botData').doc('main').set(Data, { merge: true }); }
  catch {}
}

async function FetchRoles(GroupId) {
  await loginRoblox();
  const roles = await noblox.getRoles(GroupId);
  const Roles = {};
  roles.forEach(r => Roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id });
  return Roles;
}

async function GetCurrentRank(GroupId, UserId) {
  await loginRoblox();
  const rankName = await noblox.getRankNameInGroup(GroupId, UserId);
  const rankNumber = await noblox.getRankInGroup(GroupId, UserId);
  return { Name: rankName, Rank: rankNumber };
}

async function SetRank(GroupId, UserId, RankOrId, IssuerDiscordId, GuildId, Client = global.ClientBot) {
  await loginRoblox();
  const Roles = await FetchRoles(GroupId);
  let RoleInfo = typeof RankOrId === 'number' ? Object.values(Roles).find(r => r.Rank === RankOrId) : Roles[RankOrId.toLowerCase()];
  if (!RoleInfo) throw new Error('Invalid rank specified');
  if (!IssuerDiscordId.toUpperCase().includes('SYSTEM')) {
    const DbData = await GetJsonBin();
    const IssuerRobloxId = DbData.VerifiedUsers?.[IssuerDiscordId];
    if (!IssuerRobloxId) throw new Error('You must verify first.');
    const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
    const Target = await GetCurrentRank(GroupId, UserId);
    if (String(UserId) === String(IssuerRobloxId)) throw new Error('Cannot change your own rank');
    if (RoleInfo.Rank >= IssuerRank.Rank) throw new Error('Cannot assign a rank equal or higher than yours');
    if (Target.Rank >= IssuerRank.Rank) throw new Error('Cannot change rank of a user higher or equal to you');
  }
  await noblox.setRank(GroupId, UserId, RoleInfo.Rank);
  const Data = await GetJsonBin();
  Data.RankChanges = Data.RankChanges || [];
  Data.RankChanges.push({ GroupId, UserId, NewRank: RoleInfo.Name, IssuedBy: IssuerDiscordId, Timestamp: new Date().toISOString(), GuildId });
  await SaveJsonBin(Data);
}

async function GetRobloxUserId(Username) { 
  await loginRoblox(); 
  return await noblox.getIdFromUsername(Username); 
}

async function GetRobloxUsername(UserId) { 
  await loginRoblox(); 
  return await noblox.getUsernameFromId(UserId); 
}

async function GetRobloxDescription(UserId) { 
  await loginRoblox(); 
  const info = await noblox.getPlayerInfo(UserId); 
  return info?.blurb || ''; 
}

async function GetRobloxUserInfo(UserId) {
  await loginRoblox();

  let info;
  try {
    info = await noblox.getPlayerInfo(UserId);
  } catch {
    throw new Error("Failed to fetch player info from Roblox.");
  }

  let avatar = null;
  try {
    const avatarResult = await noblox.getPlayerThumbnail([UserId], "headshot", 180, "png", false);
    avatar = avatarResult[0]?.imageUrl ?? null;
  } catch {}

  const createdDate = info.joinDate ? info.joinDate.split("T")[0] : null;

  let usernames = [];
  try {
    const history = await noblox.getUsernameHistory(UserId);
    usernames = Array.isArray(history) ? history.map(x => x.name) : [];
  } catch { usernames = []; }

  let groups = [];
  try {
    const rawGroups = await noblox.getGroups(UserId);
    if (Array.isArray(rawGroups)) {
      groups = rawGroups.map(g => ({
        name: g.Name || "Unknown",
        id: g.Id || 0,
        role: g.Role || "Member",
        rank: g.Rank || 0
      }));
    }
  } catch { groups = []; }

  let presence = "Unknown";
  try {
    const pres = await noblox.getPlayerPresence(UserId);
    if (pres.userPresenceType === 0) presence = "Offline";
    else if (pres.userPresenceType === 1) presence = "Online";
    else if (pres.userPresenceType === 2) presence = `In Game: ${pres.lastLocation || "Unknown"}`;
  } catch {}

  let badgeCount = 0;
  try {
    const badges = await noblox.getPlayerBadges({ userId: UserId, limit: 100 });
    badgeCount = Array.isArray(badges) ? badges.length : 0;
  } catch {}

  let rap = 0;
  try {
    const collectibles = await noblox.getCollectibles({ userId: UserId });
    if (Array.isArray(collectibles)) {
      rap = collectibles.reduce((sum, x) => sum + (x.recentAveragePrice || 0), 0);
    }
  } catch {}

  return {
    id: UserId,
    username: info.username || "Unknown",
    displayName: info.displayName || info.username || "Unknown",
    description: info.blurb || "No description.",
    created: createdDate,
    isBanned: info.isBanned || false,
    friendsCount: info.friendCount || 0,
    followersCount: info.followerCount || 0,
    followingCount: info.followingCount || 0,
    avatar: avatar,
    pastUsernames: usernames,
    groups: groups,
    presence: presence,
    badgeCount: badgeCount,
    rap: rap
  };
}

async function SendRankLog(GuildId, Client, ActionBy, TargetRobloxId, Action, NewRank) {
  try {
    const Data = await GetJsonBin();
    const LogChannelId = Data.ServerConfig?.[GuildId]?.RankLogChannel || '1424381038393556992';
    const Guild = await (Client?.guilds ? Client.guilds.fetch(GuildId).catch(() => null) : null);
    if (!Guild) return;
    const Channel = Guild.channels.cache.get(LogChannelId) || null;
    if (!Channel || !Channel.isTextBased()) return;
    const Username = await GetRobloxUsername(TargetRobloxId).catch(() => 'Unknown');
    const FieldActionBy = ActionBy === 'SYSTEM' ? 'SYSTEM' : `<@${ActionBy}>`;
    const Embed = new EmbedBuilder().setTitle('Rank Updated').setColor(0x2b2d31).addFields(
      { name: 'Action By:', value: FieldActionBy, inline: true },
      { name: 'Action On:', value: Username, inline: true },
      { name: 'Action:', value: Action, inline: true },
      { name: 'New Rank:', value: NewRank, inline: false }
    ).setTimestamp();
    await Channel.send({ embeds: [Embed] }).catch(() => {});
  } catch {}
}

async function SuspendUser(GroupId, UserId, IssuerDiscordId, GuildId, Client = global.ClientBot, DurationKey = '1d', Reason = null) {
  await loginRoblox();
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
  const DurationMs = PredefinedDurations[DurationKey];
  if (DurationMs === undefined) throw new Error('Invalid suspension duration.');
  await noblox.setRank(GroupId, UserId, SuspendedRole.Rank);
  const Username = await GetRobloxUsername(UserId);
  DbData.Suspensions = DbData.Suspensions || {};
  DbData.Suspensions[UserId] = { Username, IssuedBy: IssuerDiscordId, IssuedAt: Date.now(), EndsAt: Date.now() + DurationMs, GroupId, GuildId, OldRankName: TargetRank.Name, OldRankValue: TargetRank.Rank, Reason, Active: true };
  await SaveJsonBin(DbData);
  ScheduleAutoUnsuspend(UserId, DbData.Suspensions[UserId], Client);
}

function ScheduleAutoUnsuspend(UserId, SuspensionRecord, Client) {
  if (!SuspensionRecord || !SuspensionRecord.EndsAt) return;
  const Remaining = SuspensionRecord.EndsAt - Date.now();
  if (Remaining <= 0) return autoUnsuspend(UserId, Client);
  let TimeoutDuration = Remaining;
  if (TimeoutDuration > MaxTimeout) TimeoutDuration = MaxTimeout;
  if (ScheduledTimers[UserId]) clearTimeout(ScheduledTimers[UserId]);
  ScheduledTimers[UserId] = setTimeout(async () => {
    const NewRemaining = SuspensionRecord.EndsAt - Date.now();
    if (NewRemaining > MaxTimeout) ScheduleAutoUnsuspend(UserId, SuspensionRecord, Client);
    else { await autoUnsuspend(UserId, Client); delete ScheduledTimers[UserId]; }
  }, TimeoutDuration);
}

async function autoUnsuspend(UserId, Client = global.ClientBot) {
  const Data = await GetJsonBin();
  const Suspension = Data.Suspensions?.[UserId];
  if (!Suspension || !Suspension.Active) return;
  if (Suspension.EndsAt && Date.now() < Suspension.EndsAt) return;
  Suspension.Active = false;
  await SaveJsonBin(Data);
  try { await SetRank(Suspension.GroupId, UserId, Suspension.OldRankName || Suspension.OldRankValue, 'SYSTEM', Suspension.GuildId, Client); } catch {}
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
    if (!Desc.includes(Data.Code)) return Interaction.editReply({ content: "Code not found in your profile." });
    const DbData = await GetJsonBin();
    DbData.VerifiedUsers = DbData.VerifiedUsers || {};
    DbData.VerifiedUsers[Interaction.user.id] = Data.RobloxUserId;
    await SaveJsonBin(DbData);
    delete Verifications[Interaction.user.id];
    return Interaction.editReply({ content: `Verified! Linked to Roblox ID ${Data.RobloxUserId}` });
  } catch { return Interaction.editReply({ content: "An error occurred during verification." }); }
}

async function LoadActiveSuspensions(Client = global.ClientBot) {
  const Data = await GetJsonBin();
  for (const UserId of Object.keys(Data.Suspensions || {})) {
    const Suspension = Data.Suspensions[UserId];
    if (!Suspension || !Suspension.Active || !Suspension.EndsAt) continue;
    ScheduleAutoUnsuspend(UserId, Suspension, Client);
  }
}

module.exports = {
  loginRoblox,
  GetJsonBin,
  SaveJsonBin,
  FetchRoles,
  GetCurrentRank,
  SetRank,
  GetRobloxUserId,
  GetRobloxUsername,
  GetRobloxDescription,
  GetRobloxUserInfo,
  SendRankLog,
  SuspendUser,
  autoUnsuspend,
  ScheduleAutoUnsuspend,
  StartVerification,
  HandleVerificationButton,
  LoadActiveSuspensions,
  Verifications,
  PendingApprovals,
  PredefinedDurations
};
