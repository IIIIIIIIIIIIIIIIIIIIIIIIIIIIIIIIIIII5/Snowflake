import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logAction } from '../utils/logAction.js';

const AllowedRoles = ['1398691449939169331','1386369108408406096','1418979785165766717'];
const LogChannelId = '1419190262697033758';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server.')
    .addUserOption(option => option.setName('target').setDescription('User to ban').setRequired(true))
    .addStringOption(option => 
      option.setName('appealable')
        .setDescription('Can this punishment be appealed?')
        .setRequired(true)
        .addChoices(
          { name: 'Yes', value: 'Yes' },
          { name: 'No', value: 'No' }
        )
    )
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setRequired(false)),

  async execute(Interaction) {
    if(!Interaction.member.roles.cache.some(r => AllowedRoles.includes(r.id)))
      return Interaction.reply({ content:'You do not have permission.', ephemeral:true });

    const Member = Interaction.options.getMember('target');
    const Appealable = Interaction.options.getString('appealable') || 'Yes';
    const Reason = Interaction.options.getString('reason') || 'No reason provided.';

    if(!Member) return Interaction.reply({ content:'User not found', ephemeral:true });
    if(!Member.bannable) return Interaction.reply({ content:'I cannot ban this user.', ephemeral:true });

    let DmDescription = `You have been **banned** from **Snowflake Penitentiary Communications Server**, for ${Reason}.`;
    if (Appealable === 'Yes') DmDescription += `\n\nIf you feel this punishment has been delivered to you unfairly then join our Administration Server to appeal your punishment.`;

    const DmEmbed = new EmbedBuilder()
      .setTitle('PUNISHMENT RECEIVED')
      .setDescription(DmDescription)
      .setColor(0xFF0000)
      .setTimestamp();

    try { await Member.send({ embeds:[DmEmbed] }); } catch {}

    await Member.ban({ reason: Reason });

    const PublicEmbed = new EmbedBuilder()
      .setDescription(`<@${Member.id}> has been banned. Reason: ${Reason}`)
      .setColor(0xFF0000)
      .setTimestamp()
      .setFooter({ text:`Banned by ${Interaction.user.tag}` });

    await Interaction.reply({ embeds:[PublicEmbed] });

    const PunishmentId = await logAction({ type:'ban', user:Member.id, moderator:Interaction.user.id, reason: Reason, appealable: Appealable });

    const LogEmbed = new EmbedBuilder()
      .setTitle(`Ban Issued - ${Member.user.tag}`)
      .addFields(
        { name:'Reason', value:Reason },
        { name:'Appealable', value:Appealable },
        { name:'Issued by', value:`<@${Interaction.user.id}>` },
        { name:'Time', value:new Date().toLocaleString('en-US',{ dateStyle:'full', timeStyle:'short' }) }
      )
      .setFooter({ text:`Case ${PunishmentId}` })
      .setColor(0xFF0000);

    const LogChannel = await Interaction.client.channels.fetch(LogChannelId);
    await LogChannel.send({ embeds:[LogEmbed] });
  }
};
