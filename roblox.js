const admin = require('firebase-admin');
const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

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
  const res = await fetch(`https://groups.roblox.com/v2/groups/${GroupId}/roles`);
  const json = await res.json();
  const Roles = {};
  for (const r of json.roles || []) Roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id };
  return Roles;
}

async function GetCurrentRank(GroupId, UserId) {
  const res = await fetch(`https://groups.roblox.com/v2/users/${UserId}/groups/roles`);
  const json = await res.json();
  const grp = (json.data || []).find(g => g.group.id === GroupId);
  if (!grp) return { Name: 'None', Rank: 0 };
  return { Name: grp.role.name, Rank: grp.role.rank };
}

async function SetRank(GroupId, UserId, RankOrId, IssuerDiscordId, GuildId, Client = global.ClientBot) {
  const Roles = await FetchRoles(GroupId);
  let RoleInfo = typeof RankOrId === 'number' ? Object.values(Roles).find(r => r.Rank === RankOrId) : Roles[RankOrId.toLowerCase()];
  if (!RoleInfo) throw new Error('Invalid rank specified');
  const DbData = await GetJsonBin();
  const IssuerRobloxId = DbData.VerifiedUsers?.[IssuerDiscordId];
  if (!IssuerRobloxId) throw new Error('You must verify first.');
  const IssuerRank = await GetCurrentRank(GroupId, IssuerRobloxId);
  const Target = await GetCurrentRank(GroupId, UserId);
  if (String(UserId) === String(IssuerRobloxId)) throw new Error('Cannot change your own rank');
  if (RoleInfo.Rank >= IssuerRank.Rank) throw new Error('Cannot assign a rank equal or higher than yours');
  if (Target.Rank >= IssuerRank.Rank) throw new Error('Cannot change rank of a user higher or equal to you');

  await fetch(`https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': `.ROBLOSECURITY=${process.env.ROBLOSECURITY}` },
    body: JSON.stringify({ roleId: RoleInfo.RoleId })
  });

  DbData.RankChanges = DbData.RankChanges || [];
  DbData.RankChanges.push({ GroupId, UserId, NewRank: RoleInfo.Name, IssuedBy: IssuerDiscordId, Timestamp: new Date().toISOString(), GuildId });
  await SaveJsonBin(DbData);
}

async function GetRobloxUserId(Username) {
  const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(Username)}`);
  const json = await res.json();
  if (json && json.Id) return json.Id;
  throw new Error('User not found');
}

async function GetRobloxUsername(UserId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${UserId}`);
  const json = await res.json();
  return json?.name || 'Unknown';
}

async function GetRobloxDescription(UserId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${UserId}`);
  const json = await res.json();
  return json?.description || '';
}

async function GetRobloxUserInfo(UserId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${UserId}`);
  const info = await res.json();
  return {
    id: UserId,
    username: info?.name || "Unknown",
    description: info?.description || "No description.",
    created: info?.created || null,
    isBanned: info?.isBanned || false,
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
