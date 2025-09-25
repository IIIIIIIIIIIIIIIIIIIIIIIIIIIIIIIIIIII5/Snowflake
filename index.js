require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const Cookie = process.env.ROBLOSECURITY;
const GroupId = process.env.GROUPID;
const AuthKey = process.env.AUTHKEY;
const Port = process.env.PORT || 3000;

let Roles = {};

async function FetchRoles() {
    try {
        const response = await axios.get(`https://groups.roblox.com/v1/groups/${GroupId}/roles`);
        Roles = {};
        response.data.roles.forEach((role, index) => {
            Roles[index + 1] = { ID: role.name, RoleId: role.id };
        });
        console.log("Roles fetched");
    } catch (err) {
        console.error("Failed to fetch roles:", err.message);
    }
}

FetchRoles();

async function SetRank(UserId, RankNumber) {
    if (!Roles[RankNumber]) await FetchRoles();
    const RoleInfo = Roles[RankNumber];
    if (!RoleInfo) throw new Error("Invalid rank number: " + RankNumber);

    let xsrfToken = "";
    const url = `https://groups.roblox.com/v1/groups/${GroupId}/users/${UserId}`;

    try {
        await axios.patch(url, { roleId: RoleInfo.RoleId }, {
            headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": xsrfToken }
        });
    } catch (err) {
        if (err.response?.status === 403 && err.response.headers['x-csrf-token']) {
            xsrfToken = err.response.headers['x-csrf-token'];
            return axios.patch(url, { roleId: RoleInfo.RoleId }, {
                headers: { Cookie: `.ROBLOSECURITY=${Cookie}`, "Content-Type": "application/json", "X-CSRF-TOKEN": xsrfToken }
            });
        } else throw err;
    }
}

app.post("/rank", async (req, res) => {
    const { UserId, RankNumber, Auth } = req.body;
    if (Auth !== AuthKey) return res.status(403).send("Forbidden");

    try {
        await SetRank(UserId, RankNumber);
        res.json({ success: true, message: `Rank updated for user ${UserId}` });
    } catch (err) {
        console.error("Roblox API error:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data || err.message });
    }
});

app.get("/roles", async (req, res) => res.json(Roles));

app.listen(Port, () => console.log(`Server running at http://localhost:${Port}`));
