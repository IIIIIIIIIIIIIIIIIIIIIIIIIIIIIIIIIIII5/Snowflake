const axios = require('axios');
const JsonBinId = process.env.JSONBIN_ID;
const JsonBinSecret = process.env.JSONBIN_SECRET;
const Verifications = {};
const PendingApprovals = {};

async function GetJsonBin() {
  try {
    const res = await axios.get(`https://api.jsonbin.io/v3/b/${JsonBinId}/latest`, { headers: { 'X-Master-Key': JsonBinSecret } });
    return res.data.record || {};
  } catch { return {}; }
}

async function SaveJsonBin(data) {
  await axios.put(`https://api.jsonbin.io/v3/b/${JsonBinId}`, data, { headers: { 'X-Master-Key': JsonBinSecret, 'Content-Type': 'application/json' } });
}

async function GetRobloxCookie(guildId) {
  const db = await GetJsonBin();
  if (db.CustomTokens && db.CustomTokens[guildId]) return db.CustomTokens[guildId];
  return process.env.ROBLOSECURITY;
}

async function FetchRoles(groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  const roles = {};
  res.data.roles.forEach(r => roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id });
  return roles;
}

async function GetXsrfToken(guildId) {
  const cookie = await GetRobloxCookie(guildId);
  try {
    const res = await axios.post('https://auth.roblox.com/v2/logout', {}, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
    return res.headers['x-csrf-token'] || '';
  } catch (err) {
    return err.response?.headers['x-csrf-token'] || '';
  }
}

async function GetCurrentRank(groupId, userId) {
  const res = await axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  const group = res.data.data.find(g => g.group.id === Number(groupId));
  if (!group) throw new Error('User not in group');
  return { Rank: group.role.rank, Name: group.role.name };
}

async function SetRank(groupId, userId, rankName, issuerDiscordId, guildId) {
  const roles = await FetchRoles(groupId);
  const roleInfo = roles[rankName.toLowerCase()];
  if (!roleInfo) throw new Error('Invalid rank name: ' + rankName);

  const target = await GetCurrentRank(groupId, userId);
  const db = await GetJsonBin();
  const issuerRobloxId = db.VerifiedUsers?.[issuerDiscordId];
  if (!issuerRobloxId) throw new Error('You must verify first.');

  const issuerRank = await GetCurrentRank(groupId, issuerRobloxId);
  if (String(userId) === String(issuerRobloxId)) throw new Error('You cannot change your own rank.');
  if (roleInfo.Rank >= issuerRank.Rank) throw new Error('Cannot assign a rank equal or higher than yours.');
  if (target.Rank >= issuerRank.Rank) throw new Error('Cannot change rank of a user higher or equal to you.');

  const cookie = await GetRobloxCookie(guildId);
  const url = `https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`;
  let xsrf = await GetXsrfToken(guildId);

  try {
    await axios.patch(url, { roleId: roleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': xsrf } });
  } catch (err) {
    if (err.response?.status === 403 && err.response?.headers['x-csrf-token']) {
      xsrf = err.response.headers['x-csrf-token'];
      await axios.patch(url, { roleId: roleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': xsrf } });
    } else throw new Error('Request failed: ' + (err.response?.data?.errors?.[0]?.message || err.message));
  }

  const data = await GetJsonBin();
  data.RankChanges = data.RankChanges || [];
  data.RankChanges.push({ GroupId: groupId, UserId: userId, NewRank: roleInfo.Name, IssuedBy: issuerDiscordId, Timestamp: new Date().toISOString(), GuildId: guildId });
  await SaveJsonBin(data);
}

async function GetRobloxUserId(username) {
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username] }, { headers: { 'Content-Type': 'application/json' } });
  if (!res.data.data || !res.data.data[0]) throw new Error('Invalid username');
  return res.data.data[0].id;
}

async function GetRobloxUserInfo(userId) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
  return res.data;
}

async function GetRobloxDescription(userId) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
  return res.data.description || '';
}

function startVerification(discordId, robloxUserId, code) {
  Verifications[discordId] = { RobloxUserId: robloxUserId, Code: code };
}

async function HandleVerificationButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const data = Verifications[interaction.user.id];
  if (!data) return interaction.editReply({ content: "You haven't started verification yet." });

  const desc = await GetRobloxDescription(data.RobloxUserId);
  if (desc.includes(data.Code)) {
    const db = await GetJsonBin();
    db.VerifiedUsers = db.VerifiedUsers || {};
    db.VerifiedUsers[interaction.user.id] = data.RobloxUserId;
    await SaveJsonBin(db);
    delete Verifications[interaction.user.id];
    return interaction.editReply({ content: `Verified! Linked to Roblox ID ${data.RobloxUserId}` });
  } else {
    return interaction.editReply({ content: "Code not found in your profile. Make sure you added it and try again." });
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
  GetRobloxUserInfo,
  GetRobloxDescription,
  Verifications,
  PendingApprovals,
  startVerification,
  HandleVerificationButton
};
