const express = require('express');
const Roblox = require('./roblox');

const app = express();
app.use(express.json());

const API_KEY = process.env.AUTHKEY;

function CheckAuth(req, res, next) {
  const key = req.headers.authorization;
  if (key !== `Bearer ${API_KEY}`) return res.status(403).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/verify', CheckAuth, async (req, res) => {
  try {
    const { discordId, robloxUsername, code } = req.body;
    if (!discordId || !robloxUsername || !code) return res.status(400).json({ error: 'Missing fields' });

    const robloxId = await Roblox.GetRobloxUserId(robloxUsername);
    Roblox.startVerification(discordId, robloxId, code);
    return res.json({ success: true, message: 'Verification started', robloxId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/verify/force', CheckAuth, async (req, res) => {
  try {
    const { discordId, robloxUsername } = req.body;
    if (!discordId || !robloxUsername) return res.status(400).json({ error: 'Missing fields' });

    const robloxId = await Roblox.GetRobloxUserId(robloxUsername);
    const db = await Roblox.GetJsonBin();
    db.VerifiedUsers = db.VerifiedUsers || {};
    db.VerifiedUsers[discordId] = robloxId;
    await Roblox.SaveJsonBin(db);

    return res.json({ success: true, message: 'Force verified', robloxId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/setrank', CheckAuth, async (req, res) => {
  try {
    const { groupId, userId, newRankName, issuerDiscordId, guildId } = req.body;
    if (!groupId || !userId || !newRankName || !issuerDiscordId || !guildId)
      return res.status(400).json({ error: 'Missing fields' });

    if (!global.ClientBot) return res.status(500).json({ error: 'Discord client not ready' });

    await Roblox.SetRank(groupId, userId, newRankName, issuerDiscordId, guildId, global.ClientBot);
    return res.json({ success: true, message: `Rank updated to ${newRankName}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function StartApi() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}

module.exports = { app, StartApi };
