const fs = require('fs')
const path = require('path')
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js')
const Roblox = require('./roblox')
const { StartApi } = require('./api')

const BotToken = process.env.BOT_TOKEN
const ClientId = process.env.CLIENT_ID
const AdminId = process.env.ADMIN_ID

const ClientBot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

ClientBot.Commands = new Collection()
ClientBot.PendingApprovals = Roblox.PendingApprovals

function GetCommandFiles(dir) {
  const files = []
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    if (fs.statSync(full).isDirectory()) files.push(...GetCommandFiles(full))
    else if (f.endsWith('.js')) files.push(full)
  }
  return Array.from(new Set(files.map(f => path.resolve(f))))
}

const CommandFiles = GetCommandFiles(path.join(__dirname, 'commands'))
for (const file of CommandFiles) {
  try {
    delete require.cache[require.resolve(file)]
    const cmd = require(file)
    if (cmd && cmd.data && cmd.execute) {
      ClientBot.Commands.set(cmd.data.name, cmd)
    }
  } catch (err) {
    console.error(`Failed to load command ${file}:`, err)
  }
}

async function RefreshCommands() {
  const rest = new REST({ version: '10' }).setToken(BotToken)
  const payload = Array.from(ClientBot.Commands.values()).map(c => c.data.toJSON())
  try {
    await rest.put(Routes.applicationCommands(ClientId), { body: [] })
    await rest.put(Routes.applicationCommands(ClientId), { body: payload })
  } catch (err) {
    console.error('Failed to register global commands:', err)
  }
}

global.ClientBot = ClientBot

ClientBot.once('ready', async () => {
  ClientBot.user.setActivity('Snowflake Prison Roleplay', { type: ActivityType.Watching })
  await RefreshCommands()
  StartApi()
})

ClientBot.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId === 'done_verification')
    return Roblox.HandleVerificationButton(interaction)
  if (!interaction.isChatInputCommand()) return
  const cmd = ClientBot.Commands.get(interaction.commandName)
  if (!cmd) return
  try { await cmd.execute(interaction, ClientBot) } 
  catch (err) { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'An error occurred.', ephemeral: true }) }
})

ClientBot.on('messageCreate', async message => {
  if (!message.content.startsWith('!')) return
  if (message.author.id !== AdminId) return

  const parts = message.content.split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const db = await Roblox.GetJsonBin()
  db.Trainings = db.Trainings || {}

  if (cmd === '!accept' || cmd === '!decline') {
    const groupId = parts[1]
    if (!groupId || !Roblox.PendingApprovals[groupId]) return message.reply('')

    const { requesterId } = Roblox.PendingApprovals[groupId]

    if (cmd === '!accept') {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been accepted.`) } catch {}
      delete Roblox.PendingApprovals[groupId]
      return message.channel.send(`Accepted group ${groupId} and notified <@${requesterId}>`)
    } else {
      try { await ClientBot.users.send(requesterId, `Your group config (ID: ${groupId}) has been declined.`) } catch {}
      delete Roblox.PendingApprovals[groupId]
      return message.channel.send(`Declined group ${groupId} and notified <@${requesterId}>`)
    }
  }

  if (cmd === '!setbottoken') {
    const targetServerId = parts[1]
    const customToken = parts[2]
    if (!targetServerId || !customToken) return message.reply('')
    db.CustomTokens = db.CustomTokens || {}
    db.CustomTokens[targetServerId] = customToken
    await Roblox.SaveJsonBin(db)
    return message.channel.send(`Custom Roblox token set for server ID ${targetServerId}.`)
  }

  if (cmd === '!add' || cmd === '!remove' || cmd === '!set') {
    const targetMention = parts[1]
    const category = parts[2]?.toLowerCase()
    const type = parts[3]?.toLowerCase()
    const value = Number(parts[4])

    if (!targetMention || category !== 'trainings' || !type || isNaN(value)) return message.reply('')

    const userIdMatch = targetMention.match(/^<@!?(\d+)>$/)
    if (!userIdMatch) return message.reply('')

    const discordId = userIdMatch[1]
    const verifiedEntry = Object.entries(db.VerifiedUsers || {}).find(([robloxId, data]) => data === discordId || data.DiscordId === discordId)
    if (!verifiedEntry) return message.reply('')

    const [robloxId] = verifiedEntry
    db.Trainings[robloxId] = db.Trainings[robloxId] || { hosted: {}, cohosted: {}, supervised: {} }

    const currentMonth = new Date().toISOString().slice(0, 7)
    const stat = db.Trainings[robloxId][type]

    stat[currentMonth] = stat[currentMonth] || 0
    stat.lastMonth = currentMonth
    stat.total = stat.total || 0

    if (cmd === '!add') {
      stat[currentMonth] += value
      stat.total += value
    } else if (cmd === '!remove') {
      stat[currentMonth] -= value
      stat.total -= value
    } else if (cmd === '!set') {
      stat.total = (stat.total - (stat[currentMonth] || 0)) + value
      stat[currentMonth] = value
    }

    await Roblox.SaveJsonBin(db)

    return message.channel.send(`Updated ${type} for <@${discordId}>: this month = ${stat[currentMonth]}, total = ${stat.total}`)
  }
})

ClientBot.login(BotToken)
