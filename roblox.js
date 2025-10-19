const axios = require('axios');
const admin = require('firebase-admin');
const firebaseConfig = require('./firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig)
});

const db = admin.firestore();

const Verifications = {};
const PendingApprovals = {};

async function GetDatabase() {
  const doc = await db.collection('system').doc('main').get();
  if (!doc.exists) return {};
  return doc.data() || {};
}

async function SaveDatabase(data) {
  await db.collection('system').doc('main').set(data, { merge: true });
}

async function GetRobloxCookie(guildId) {
  const data = await GetDatabase();
  if (data.CustomTokens && data.CustomTokens[guildId])
    return data.CustomTokens[guildId];
  return process.env.ROBLOSECURITY;
}

async function FetchRoles(groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  const roles = {};
  res.data.roles.forEach(r => {
    roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id };
  });
  return roles;
}

async function GetXsrfToken(guildId) {
  const cookie = await GetRobloxCookie(guildId);
  try {
    const res = await axios.post('https://auth.roblox.com/v2/logout', {}, {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` }
    });
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

async function GetRobloxUsername(userId) {
  const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
  return res.data.name;
}

async function SetRank(groupId, userId, rankName, issuerDiscordId, guildId, client = global.ClientBot) {
  const roles = await FetchRoles(groupId);
  const roleInfo = roles[rankName.toLowerCase()];
  if (!roleInfo) throw new Error('Invalid rank name: ' + rankName);

  const target = await GetCurrentRank(groupId, userId);
  const dbData = await GetDatabase();

  const issuerRobloxId = dbData.VerifiedUsers?.[issuerDiscordId];
  if (!issuerRobloxId) throw new Error('You must verify first.');

  const issuerRank = await GetCurrentRank(groupId, issuerRobloxId);
  if (String(userId) === String(issuerRobloxId))
    throw new Error('You cannot change your own rank.');
  if (roleInfo.Rank >= issuerRank.Rank)
    throw new Error('Cannot assign a rank equal or higher than yours.');
  if (target.Rank >= issuerRank.Rank)
    throw new Error('Cannot change rank of a user higher or equal to you.');

  const cookie = await GetRobloxCookie(guildId);
  const url = `https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`;
  let xsrf = await GetXsrfToken(guildId);

  try {
    await axios.patch(url, { roleId: roleInfo.RoleId }, {
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': xsrf
      }
    });
  } catch (err) {
    if (err.response?.status === 403 && err.response?.headers['x-csrf-token']) {
      xsrf = err.response.headers['x-csrf-token'];
      await axios.patch(url, { roleId: roleInfo.RoleId }, {
        headers: {
          Cookie: `.ROBLOSECURITY=${cookie}`,
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': xsrf
        }
      });
    } else {
      throw new Error('Request failed: ' + (err.response?.data?.errors?.[0]?.message || err.message));
    }
  }

  const data = await GetDatabase();
  if (!data.RankChanges || !Array.isArray(data.RankChanges)) data.RankChanges = [];
  data.RankChanges.push({
    GroupId: groupId,
    UserId: userId,
    NewRank: roleInfo.Name,
    IssuedBy: issuerDiscordId,
    Timestamp: new Date().toISOString(),
    GuildId: guildId
  });
  await SaveDatabase(data);

  const username = await GetRobloxUsername(userId);
  const action = roleInfo.Rank > target.Rank ? 'Promoted' :
                 roleInfo.Rank < target.Rank ? 'Demoted' : 'Set Rank';

  const guild = client?.guilds ? await client.guilds.fetch(guildId).catch(() => null) : null;
  const logChannel = guild?.channels?.cache?.get('1424381038393556992');

  if (logChannel) {
    const embed = {
      color: 0x2f3136,
      title: 'Rank Updated',
      fields: [
        { name: 'Action By:', value: `<@${issuerDiscordId}>`, inline: true },
        { name: 'Action On:', value: username, inline: true },
        { name: 'Action:', value: action, inline: true },
        { name: 'New Rank:', value: `${roleInfo.Name}`, inline: false }
      ],
      timestamp: new Date()
    };
    await logChannel.send({ embeds: [embed] });
  }
}

async function GetRobloxUserId(username) {
  const res = await axios.post(
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [username] },
    { headers: { 'Content-Type': 'application/json' } }
  );
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
    const dbData = await GetDatabase();
    dbData.VerifiedUsers = dbData.VerifiedUsers || {};
    dbData.VerifiedUsers[interaction.user.id] = data.RobloxUserId;
    await SaveDatabase(dbData);
    delete Verifications[interaction.user.id];
    return interaction.editReply({ content: `Verified! Linked to Roblox ID ${data.RobloxUserId}` });
  } else {
    return interaction.editReply({ content: "Code not found in your profile. Make sure you added it and try again." });
  }
}

module.exports = {
  GetDatabase,
  SaveDatabase,
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
