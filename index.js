const express = require("express");
const axios = require("axios");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
app.use(express.json());

const Cookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;
const Port = process.env.PORT || 3000;

const ServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
    credential: cert(ServiceAccount)
});

const Db = getFirestore();

let Roles = {};

async function FetchRoles(GroupId) {
    try {
        const Response = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
        Roles[GroupId] = {};
        Response.data.roles.forEach((Role, Index) => {
            Roles[GroupId][Index + 1] = { ID: Role.name, RoleId: Role.id };
        });
    } catch (Err) {
        console.error("Failed to fetch roles:", Err.message);
    }
}

async function SetRank(GroupId, UserId, RankNumber, Issuer) {
    if (!Roles[GroupId] || !Roles[GroupId][RankNumber]) await FetchRoles(GroupId);
    const RoleInfo = Roles[GroupId][RankNumber];
    if (!RoleInfo) throw new Error("Invalid rank number: " + RankNumber);

    let XsrfToken = "";
    const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;

    try {
        await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
            headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
        });

        await Db.collection("rankChanges").add({
            groupId: GroupId,
            userId: UserId,
            newRank: RoleInfo,
            issuedBy: Issuer || "API",
            timestamp: new Date().toISOString()
        });

    } catch (Err) {
        if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
            XsrfToken = Err.response.headers['x-csrf-token'];
            await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
            });

            await Db.collection("rankChanges").add({
                groupId: GroupId,
                userId: UserId,
                newRank: RoleInfo,
                issuedBy: Issuer || "API",
                timestamp: new Date().toISOString()
            });
        } else throw Err;
    }
}

app.post("/:GroupId/rank", async (req, res) => {
    const { UserId, RankNumber, Auth, Issuer } = req.body;
    const GroupId = req.params.GroupId;
    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        await SetRank(GroupId, UserId, RankNumber, Issuer);
        res.json({ success: true, message: `Rank updated for user ${UserId} in group ${GroupId}` });
    } catch (Err) {
        console.error("Roblox API error:", Err.response?.data || Err.message);
        res.status(500).json({ error: Err.response?.data || Err.message });
    }
});

app.post("/:GroupId/promote", async (req, res) => {
    const { UserId, CurrentRank, Auth, Issuer } = req.body;
    const GroupId = req.params.GroupId;
    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        if (!Roles[GroupId]) await FetchRoles(GroupId);
        const NextRank = CurrentRank + 1;
        await SetRank(GroupId, UserId, NextRank, Issuer);
        res.json({ success: true, message: `User ${UserId} promoted to rank ${NextRank}` });
    } catch (Err) {
        console.error("Promote error:", Err.response?.data || Err.message);
        res.status(500).json({ error: Err.response?.data || Err.message });
    }
});

app.post("/:GroupId/demote", async (req, res) => {
    const { UserId, CurrentRank, Auth, Issuer } = req.body;
    const GroupId = req.params.GroupId;
    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        if (!Roles[GroupId]) await FetchRoles(GroupId);
        const NextRank = Math.max(CurrentRank - 1, 1);
        await SetRank(GroupId, UserId, NextRank, Issuer);
        res.json({ success: true, message: `User ${UserId} demoted to rank ${NextRank}` });
    } catch (Err) {
        console.error("Demote error:", Err.response?.data || Err.message);
        res.status(500).json({ error: Err.response?.data || Err.message });
    }
});

app.get("/:GroupId/roles", async (req, res) => {
    const GroupId = req.params.GroupId;
    if (!Roles[GroupId]) await FetchRoles(GroupId);
    res.json(Roles[GroupId] || {});
});

app.get("/:GroupId/history/:UserId", async (req, res) => {
    const GroupId = req.params.GroupId;
    const UserId = parseInt(req.params.UserId);
    const Auth = req.query.auth;

    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        const Snapshot = await Db.collection("rankChanges")
            .where("groupId", "==", GroupId)
            .where("userId", "==", UserId)
            .orderBy("timestamp", "desc")
            .get();

        if (Snapshot.empty) {
            return res.json({ history: [] });
        }

        const History = Snapshot.docs.map(Doc => Doc.data());
        res.json({ history: History });
    } catch (Err) {
        console.error("Error fetching history:", Err.message);
        res.status(500).json({ error: Err.message });
    }
});

app.listen(Port, () => console.log(`Server running at http://localhost:${Port}`));
