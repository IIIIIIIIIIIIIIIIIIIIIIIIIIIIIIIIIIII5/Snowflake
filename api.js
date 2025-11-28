const Express = require('express');
const Roblox = require('./roblox');
const { FinalizeVerification } = require('./commands/verify');

const App = Express();
App.use(Express.json());

const ApiKey = process.env.AUTHKEY;

function CheckAuth(Req, Res, Next) {
    const Key = Req.headers.authorization;
    if (Key !== `Bearer ${ApiKey}`) return Res.status(403).json({ error: 'Unauthorized' });
    Next();
}

App.post('/api/verify', CheckAuth, async (Req, Res) => {
    try {
        const { DiscordId, RobloxUsername } = Req.body;
        if (!DiscordId || !RobloxUsername) 
            return Res.status(400).json({ error: 'Missing fields' });

        const RobloxId = await Roblox.GetRobloxUserId(RobloxUsername);

        await FinalizeVerification(DiscordId, RobloxId, RobloxUsername);

        return Res.json({ success: true, message: 'Verification completed', RobloxId });
    } catch (Err) {
        return Res.status(500).json({ error: Err.message });
    }
});

App.post('/api/verify/force', CheckAuth, async (Req, Res) => {
    try {
        const { DiscordId, RobloxUsername } = Req.body;
        if (!DiscordId || !RobloxUsername)
            return Res.status(400).json({ error: 'Missing fields' });

        const RobloxId = await Roblox.GetRobloxUserId(RobloxUsername);
        const Db = await Roblox.GetJsonBin();
        Db.VerifiedUsers = Db.VerifiedUsers || {};
        Db.VerifiedUsers[DiscordId] = { RobloxId, RobloxName: RobloxUsername };
        await Roblox.SaveJsonBin(Db);

        return Res.json({ success: true, message: 'Force verified', RobloxId });
    } catch (Err) {
        return Res.status(500).json({ error: Err.message });
    }
});

App.post('/api/setrank', CheckAuth, async (Req, Res) => {
    try {
        const { GroupId, UserId, NewRankName, DiscordId, GuildId } = Req.body;
        if (!GroupId || !UserId || !NewRankName || !DiscordId || !GuildId)
            return Res.status(400).json({ error: 'Missing fields' });

        if (!global.ClientBot) return Res.status(500).json({ error: 'Discord client not ready' });

        await Roblox.SetRank(GroupId, UserId, NewRankName, DiscordId, GuildId, global.ClientBot);

        return Res.json({ success: true, message: `Rank updated to ${NewRankName}` });
    } catch (Err) {
        return Res.status(500).json({ error: Err.message });
    }
});

function StartApi() {
    const Port = process.env.PORT || 3000;
    App.listen(Port, () => console.log(`API running on port ${Port}`));
}

module.exports = { App, StartApi };
