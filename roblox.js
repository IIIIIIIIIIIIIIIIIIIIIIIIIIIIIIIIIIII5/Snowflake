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

const db = admin.firestore();
const Verifications = {};

async function GetJsonBin() {
  try {
    const doc = await db.collection('botData').doc('main').get();
    return doc.exists ? doc.data() : {};
  } catch (err) {
    console.error(err.message);
    return {};
  }
}

async function SaveJsonBin(data) {
  try {
    await db.collection('botData').doc('main').set(data, { merge: true });
  } catch (err) {
    console.error(err.message);
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
  res.data.roles.forEach(r => { roles[r.name.toLowerCase()] = { Name: r.name, Rank: r.rank, RoleId: r.id }; });
  return roles;
}

async function GetXsrfToken(guildId) {
  const cookie = await GetRobloxCookie(guildId);
  try { const res = await axios.post('https://auth.roblox.com/v2/logout', {}, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } }); return res.headers['x-csrf-token'] || ''; }
  catch (err) { return err.response?.headers['x-csrf-token'] || ''; }
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
  try { await axios.patch(url, { roleId: roleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': xsrf } }); }
  catch (err) { if (err.response?.status === 403 && err.response?.headers['x-csrf-token']) { xsrf = err.response.headers['x-csrf-token']; await axios.patch(url, { roleId: roleInfo.RoleId }, { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': xsrf } }); } else { throw new Error('Request failed: ' + (err.response?.data?.errors?.[0]?.message || err.message)); } }
  const data = await GetJsonBin();
  if (!data.RankChanges || !Array.isArray(data.RankChanges)) data.RankChanges = [];
  data.RankChanges.push({ GroupId: groupId, UserId: userId, NewRank: roleInfo.Name, IssuedBy: issuerDiscordId, Timestamp: new Date().toISOString(), GuildId: guildId });
  await SaveJsonBin(data);
  const username = await GetRobloxUsername(userId);
  const action = roleInfo.Rank > target.Rank ? 'Promoted' : roleInfo.Rank < target.Rank ? 'Demoted' : 'Set Rank';
  const guild = client?.guilds ? await client.guilds.fetch(guildId).catch(() => null) : null;
  const logChannel = guild?.channels?.cache?.get('1424381038393556992');
  if (logChannel) { const embed = new EmbedBuilder().setColor(0x2f3136).setTitle('Rank Updated').addFields({ name: 'Action By:', value: `<@${issuerDiscordId}>`, inline: true }, { name: 'Action On:', value: username, inline: true }, { name: 'Action:', value: action, inline: true }, { name: 'New Rank:', value: `${roleInfo.Name}`, inline: false }).setTimestamp(new Date()); await logChannel.send({ embeds: [embed] }); }
}

async function GetRobloxUserId(username) {
  const res = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username] }, { headers: { 'Content-Type': 'application/json' } });
  if (!res.data.data || !res.data.data[0]) throw new Error('Invalid username');
  return res.data.data[0].id;
}

function startVerification(discordId, robloxUserId, code) {
  Verifications[discordId] = { RobloxUserId: robloxUserId, Code: code };
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

async function SuspendUser(groupId, userId, issuerDiscordId, guildId, client = global.ClientBot, durationMs = 0) {
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

    await axios.patch(url, { roleId: suspendedRole.RoleId }, {
        headers: {
            Cookie: `.ROBLOSECURITY=${cookie}`,
            'X-CSRF-TOKEN': xsrf,
            'Content-Type': 'application/json'
        }
    }).catch(async err => {
        if (err.response?.status === 403 && err.response?.headers['x-csrf-token']) {
            xsrf = err.response.headers['x-csrf-token'];
            await axios.patch(url, { roleId: suspendedRole.RoleId }, {
                headers: {
                    Cookie: `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': xsrf,
                    'Content-Type': 'application/json'
                }
            });
        } else throw err;
    });

    const username = await GetRobloxUsername(userId);

    dbData.Suspensions = dbData.Suspensions || {};
    dbData.Suspensions[userId] = {
        username,
        guildId,
        GroupId: groupId,
        issuedBy: issuerDiscordId,
        issuedAt: Date.now(),
        endsAt: Date.now() + durationMs,
        oldRank: targetRank.Name,
        active: true
    };

    await SaveJsonBin(dbData);

    if (durationMs > 0) {
        setTimeout(async () => {
            try {
                const data = await GetJsonBin();
                const suspension = data.Suspensions?.[userId];
                if (!suspension || !suspension.active) return;

                suspension.active = false;
                await SetRank(groupId, userId, suspension.oldRank, issuerDiscordId, guildId, client);
                await SaveJsonBin(data);

                const targetDiscordId = Object.keys(data.VerifiedUsers || {}).find(id => data.VerifiedUsers[id] === userId);
                if (targetDiscordId) {
                    const user = await client.users.fetch(targetDiscordId);
                    await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("YOUR SUSPENSION HAS ENDED")
                                .setColor(0x00ff00)
                                .setDescription(`Dear, <@${targetDiscordId}>, your suspension for rank **${suspension.oldRank}** has ended automatically.`)
                        ]
                    });
                }
            } catch (e) {
                console.error(e);
            }
        }, durationMs);
    }
}

async function LoadActiveSuspensions(client) {
    const dbData = await GetJsonBin();

    for (const userId in dbData.Suspensions || {}) {
        const suspension = dbData.Suspensions[userId];
        if (!suspension.active) continue;

        const remaining = suspension.endsAt - Date.now();
        if (remaining <= 0) {
            await SetRank(suspension.GroupId, userId, suspension.oldRank, suspension.issuedBy, suspension.guildId, client);
            suspension.active = false;
            continue;
        }

        setTimeout(async () => {
            try {
                const data = await GetJsonBin();
                const sus = data.Suspensions?.[userId];
                if (!sus || !sus.active) return;

                sus.active = false;
                await SetRank(sus.GroupId, userId, sus.oldRank, sus.issuedBy, sus.guildId, client);
                await SaveJsonBin(data);

                const targetDiscordId = Object.keys(data.VerifiedUsers || {}).find(id => data.VerifiedUsers[id] === userId);
                if (targetDiscordId) {
                    const user = await client.users.fetch(targetDiscordId);
                    await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("YOUR SUSPENSION HAS ENDED")
                                .setColor(0x00ff00)
                                .setDescription(`Dear, <@${targetDiscordId}>, your suspension for rank **${sus.oldRank}** has ended automatically.`)
                        ]
                    });
                }
            } catch (e) {
                console.error(e);
            }
        }, remaining);
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
  SuspendUser,
  Verifications,
  startVerification,
  HandleVerificationButton,
  LoadActiveSuspensions
};
