const express = require('express');
const Roblox = require('./roblox');
const VerifyCommand = require('./commands/verify');

const app = express();
app.use(express.json());

const API_KEY = process.env.AUTHKEY;

function checkAuth(req, res, next) {
    const key = req.headers.authorization;
    if (key !== `Bearer ${API_KEY}`) return res.status(403).json({ error: 'Unauthorized' });
    next();
}

app.post('/api/verify', checkAuth, async (req, res) => {
    try {
        const { DiscordId, RobloxUsername } = req.body;
        if (!DiscordId || !RobloxUsername) return res.status(400).json({ error: 'Missing fields' });
        const RobloxId = await Roblox.GetRobloxUserId(RobloxUsername);
        await VerifyCommand.FinalizeVerification(DiscordId, RobloxId, RobloxUsername);
        return res.json({ success: true, message: 'Verification completed', RobloxId, RobloxUsername });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/verify/force', checkAuth, async (req, res) => {
    try {
        const { DiscordId, RobloxUsername } = req.body;
        if (!DiscordId || !RobloxUsername) return res.status(400).json({ error: 'Missing fields' });
        const RobloxId = await Roblox.GetRobloxUserId(RobloxUsername);
        const db = await Roblox.GetJsonBin();
        db.VerifiedUsers = db.VerifiedUsers || {};
        db.VerifiedUsers[DiscordId] = { RobloxId, RobloxName: RobloxUsername };
        await Roblox.SaveJsonBin(db);
        return res.json({ success: true, message: 'Force verified', RobloxId, RobloxUsername });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

function startApi() {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`API running on port ${port}`));
}

module.exports = { app, startApi };
