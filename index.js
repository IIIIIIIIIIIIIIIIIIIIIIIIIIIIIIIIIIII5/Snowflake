const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const Cookie = process.env.ROBLOSECURITY;
const AuthKey = process.env.AUTHKEY;
const Port = process.env.PORT || 3000;

let Roles = {};

async function FetchRoles(GroupId) {
    try {
        const Response = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
        Roles[GroupId] = {};
        Response.data.roles.forEach((Role, Index) => {
            Roles[GroupId][Index + 1] = { ID: Role.name, RoleId: Role.id };
        });
        console.log("Roles fetched for group", GroupId);
    } catch (Err) {
        console.error("Failed to fetch roles:", Err.message);
    }
}

async function SetRank(GroupId, UserId, RankNumber) {
    if (!Roles[GroupId] || !Roles[GroupId][RankNumber]) await FetchRoles(GroupId);
    const RoleInfo = Roles[GroupId][RankNumber];
    if (!RoleInfo) throw new Error("Invalid rank number: " + RankNumber);

    let XsrfToken = "";
    const Url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;

    try {
        await axios.patch(Url, { roleId: RoleInfo.RoleId }, {
            headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
        });
    } catch (Err) {
        if (Err.response?.status === 403 && Err.response.headers['x-csrf-token']) {
            XsrfToken = Err.response.headers['x-csrf-token'];
            return axios.patch(Url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": XsrfToken }
            });
        } else throw Err;
    }
}

app.post("/:GroupId/rank", async (req, res) => {
    const { UserId, RankNumber, Auth } = req.body;
    const GroupId = req.params.GroupId;
    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        await SetRank(GroupId, UserId, RankNumber);
        res.json({ success: true, message: `Rank updated for user ${UserId} in group ${GroupId}` });
    } catch (Err) {
        console.error("Roblox API error:", Err.response?.data || Err.message);
        res.status(500).json({ error: Err.response?.data || Err.message });
    }
});

app.get("/:GroupId/roles", async (req, res) => {
    const GroupId = req.params.GroupId;
    if (!Roles[GroupId]) await FetchRoles(GroupId);
    res.json(Roles[GroupId] || {});
});

app.listen(Port, () => console.log(`Server running at http://localhost:${Port}`));
