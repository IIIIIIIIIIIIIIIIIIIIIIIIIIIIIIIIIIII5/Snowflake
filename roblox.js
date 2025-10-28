const axios = require('axios');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const Verifications = {};
const PendingApprovals = {};

async function GetJsonBin() {
  try {
    const doc = await db.collection('botData').doc('main').get();
    return doc.exists ? doc.data() : {};
  } catch (err) {
    console.error('Failed to load Firestore data:', err.message);
    return {};
  }
}

async function SaveJsonBin(data) {
  try {
    await db.collection('botData').doc('main').set(data, { merge: true });
  } catch (err) {
    console.error('Failed to save Firestore data:', err.message);
  }
}

async function GetRobloxCookie(guildId) {
  const data = await GetJsonBin();
  if (data.CustomTokens && data.CustomTokens[guildId]) return data.CustomTokens[guildId];
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
  const dbData = await GetJsonBin();
  const issuerRobloxId = dbData.VerifiedUsers?.[issuerDiscordId];
  if (!issuerRobloxId) throw new Error('You must verify first.');

  const issuerRank = await GetCurrentRank(groupId, issuerRobloxId);
  if (String(userId) === String(issuerRobloxId)) throw new Error('You cannot change your own rank.');
  if (roleInfo.Rank >= issuerRank.Rank) throw new Error('Cannot assign a rank equal or higher than yours.');
  if (target.Rank >= issuerRank.Rank) throw new Error('Cannot change rank of a user higher or equal to you.');

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

  const data = await GetJsonBin();
  if (!data.RankChanges || !Array.isArray(data.RankChanges)) data.RankChanges = [];
  data.RankChanges.push({
    GroupId: groupId,
    UserId: userId,
    NewRank: roleInfo.Name,
    IssuedBy: issuerDiscordId,
    Timestamp: new Date().toISOString(),
    GuildId: guildId
  });
  await SaveJsonBin(data);

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
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username] }, {
    headers: { 'Content-Type': 'application/json' }
  });
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

async function SuspendUser(groupId, userId, issuerDiscordId, guildId, client = global.ClientBot) {
    const dbData = await GetJsonBin();
    const roles = await FetchRoles(groupId);
    const suspendedRole = roles['suspended'];
    if (!suspendedRole) throw new Error('Suspended rank not found.');

    const issuerRobloxId = dbData.VerifiedUsers?.[issuerDiscordId];
    if (!issuerRobloxId) throw new Error('You must verify first.');

    const issuerRank = await GetCurrentRank(groupId, issuerRobloxId);
    const targetRank = await GetCurrentRank(groupId, userId);

    if (String(userId) === String(issuerRobloxId))
        throw new Error('You cannot suspend yourself.');
    if (targetRank.Rank >= issuerRank.Rank)
        throw new Error('Cannot suspend a user with equal or higher rank.');

    const cookie = await GetRobloxCookie(guildId);
    let xsrf = await GetXsrfToken(guildId);
    const url = `https://groups.roblox.com/v1/groups/${groupId}/users/${userId}`;

    try {
        await axios.patch(url, { roleId: suspendedRole.RoleId }, {
            headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': xsrf, 'Content-Type': 'application/json' }
        });
    } catch (err) {
        if (err.response?.status === 403 && err.response?.headers['x-csrf-token']) {
            xsrf = err.response.headers['x-csrf-token'];
            await axios.patch(url, { roleId: suspendedRole.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': xsrf, 'Content-Type': 'application/json' }
            });
        } else throw new Error(err.response?.data?.errors?.[0]?.message || err.message);
    }

    const username = await GetRobloxUsername(userId);

    dbData.Suspensions = dbData.Suspensions || [];
    dbData.Suspensions.push({
        Username: username,
        IssuedBy: issuerDiscordId,
        Timestamp: new Date().toISOString(),
        guildId,
        GroupId: groupId
    });
    await SaveJsonBin(dbData);

    const guild = client?.guilds ? await client.guilds.fetch(guildId).catch(() => null) : null;
    const logChannelId = dbData.ServerConfig?.[guildId]?.LoggingChannel;
    const logChannel = guild?.channels?.cache?.get(logChannelId);
    if (logChannel) {
        const embed = {
            title: 'User Suspended',
            color: 0xe74c3c,
            fields: [
                { name: 'Username', value: username, inline: true },
                { name: 'Suspended By', value: `<@${issuerDiscordId}>`, inline: true },
                { name: 'Date', value: new Date().toISOString().split('T')[0], inline: true }
            ],
            timestamp: new Date()
        };
        await logChannel.send({ embeds: [embed] });
    }
}

async function HandleVerificationButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const data = Verifications[interaction.user.id];
  if (!data) return interaction.editReply({ content: "You haven't started verification yet." });

  try {
    const desc = await GetRobloxDescription(data.RobloxUserId);
    if (!desc.includes(data.Code))
      return interaction.editReply({ content: "Code not found in your profile. Make sure you added it and try again." });

    const dbData = await GetJsonBin();
    dbData.VerifiedUsers = dbData.VerifiedUsers || {};
    dbData.VerifiedUsers[interaction.user.id] = data.RobloxUserId;

    await SaveJsonBin(dbData);
    delete Verifications[interaction.user.id];

    return interaction.editReply({ content: `Verified! Linked to Roblox ID ${data.RobloxUserId}` });
  } catch (err) {
    console.error('Verification failed:', err);
    return interaction.editReply({ content: "An error occurred during verification." });
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
  HandleVerificationButton,
  SuspendUser
};
