require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('accept')
        .setDescription('Accept the applicant by replying directly to their submission message.'),
    new SlashCommandBuilder()
        .setName('reject')
        .setDescription('Reject the applicant by replying directly to their submission message.')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎵 Shanty bot is online as ${client.user.tag}!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Setup command (!setup-apply)
client.on('messageCreate', async (message) => {
    if (message.author?.bot) return;
    if (!message.guild) return;

    if (message.content === '!setup-apply' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('trigger_apply_modal')
                .setLabel('Apply for Crew')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setTitle('Join the Crew!')
            .setDescription('Click the button below to submit your application and set your server nickname.')
            .setColor(0x00AE86);

            await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Reusable functions
async function processAcceptance(guild, targetUserId, newNickname) {
    try {
        const member = await guild.members.fetch(targetUserId);
        await member.setNickname(newNickname);
        await member.roles.add(process.env.CREW_ROLE_ID);
        await member.send(`Congratulations! Your application has been approved. Welcome to the crew, **${newNickname}**!`).catch(() => null);
        return true;
    } catch (error) {
        console.error("❌ Action Error in processAcceptance:", error);
        return false;
    }
}

async function processRejection(guild, targetUserId) {
    try {
        const member = await guild.members.fetch(targetUserId);
        await member.send(`Thank you for applying. Unfortunately, your crew application was denied at this time.`).catch(() => null);
        return true;
    } catch (error) {
        console.error("❌ Action Error in processRejection:", error);
        return false;
    }
}

// Global Interaction Handler
client.on('interactionCreate', async (interaction) => {
    
    // --- 1. HANDLE SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'accept' || interaction.commandName === 'reject') {
            
            if (interaction.channelId !== process.env.STAFF_CHANNEL_ID) {
                return interaction.reply({ content: "You can only use this command in the staff review channel.", ephemeral: true });
            }

            const channel = interaction.channel;
            const referencedMessageId = interaction.reference?.messageId;
            const msgReference = referencedMessageId ? await channel.messages.fetch(referencedMessageId).catch(() => null) : null;

            if (!msgReference || !msgReference.embeds || msgReference.embeds.length === 0) {
                return interaction.reply({ content: "❌ You must use this command as a **Reply** directly to an open application message!", ephemeral: true });
            }

            const embed = msgReference.embeds[0];
            const fields = embed.fields || [];
            const applicantField = fields.find(f => f.name === 'Applicant')?.value;
            const nicknameField = fields.find(f => f.name === 'Requested Nickname')?.value;

            if (!applicantField || !nicknameField) {
                return interaction.reply({ content: "❌ This message doesn't look like a valid application format.", ephemeral: true });
            }

            const match = applicantField.match(/\d+/);
            if (!match) {
                return interaction.reply({ content: "❌ Could not extract a valid User ID from the applicant field.", ephemeral: true });
            }
            const targetUserId = match[0];

            await interaction.deferReply({ ephemeral: true });

            if (interaction.commandName === 'accept') {
                const success = await processAcceptance(interaction.guild, targetUserId, nicknameField);
                if (success) {
                    const updatedEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle('Application Approved ✅')
                        .addFields(
                            { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                            { name: 'Accepted Nickname', value: nicknameField, inline: true },
                            { name: 'Processed Via Command By', value: `<@${interaction.user.id}>` }
                        );

                    await msgReference.edit({ embeds: [updatedEmbed], components: [] });
                    await interaction.editReply({ content: `Successfully accepted application!` });
                } else {
                    await interaction.editReply({ content: `❌ Error running acceptance. Check server hierarchy restrictions.` });
                }
            } 
            
            else if (interaction.commandName === 'reject') {
                await processRejection(interaction.guild, targetUserId);
                
                const updatedEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('Application Denied ❌')
                    .addFields(
                        { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                        { name: 'Processed Via Command By', value: `<@${interaction.user.id}>` }
                    );

                await msgReference.edit({ embeds: [updatedEmbed], components: [] });
                await interaction.editReply({ content: `Successfully rejected application.` });
            }
        }
    }

    // --- 2. BUTTONS: Trigger Application Form ---
    if (interaction.isButton() && interaction.customId === 'trigger_apply_modal') {
        const modal = new ModalBuilder()
            .setCustomId('crew_app_modal')
            .setTitle('Crew Application Form');

        const nameInput = new TextInputBuilder()
            .setCustomId('app_nickname')
            .setLabel('What should your server nickname be?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('e.g., Captain Sally');

        const row = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    }

    // --- 3. MODALS: Form Submission Handler ---
    if (interaction.isModalSubmit() && interaction.customId === 'crew_app_modal') {
        const requestedName = interaction.fields.getTextInputValue('app_nickname');
        const staffChannel = await interaction.guild.channels.fetch(process.env.STAFF_CHANNEL_ID);

        const staffEmbed = new EmbedBuilder()
            .setTitle('New Crew Application Pending')
            .setColor(0xE67E22)
            .addFields(
                { name: 'Applicant', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: 'Requested Nickname', value: requestedName, inline: true }
            )
            .setTimestamp();

        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${interaction.user.id}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`deny_${interaction.user.id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
        );

        await staffChannel.send({ embeds: [staffEmbed], components: [actionButtons] });
        await interaction.reply({ content: 'Your application has been sent to the staff! Stand by.', ephemeral: true });
    }

    // --- 4. BUTTONS: Staff UI Buttons Clicked (Accept / Deny) ---
    if (interaction.isButton() && (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('deny_'))) {
        const parts = interaction.customId.split('_');
        const action = parts[0];
        const targetUserId = parts[1];

        const rawEmbeds = interaction.message.embeds;
        if (!rawEmbeds || rawEmbeds.length === 0) {
            return interaction.reply({ content: "❌ Could not find the original embed data.", ephemeral: true });
        }

        const targetFields = rawEmbeds[0].fields || [];
        const nicknameField = targetFields.find(f => f.name === 'Requested Nickname')?.value || "Unknown Crew Member";

        if (action === 'accept') {
            const updatedEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('Application Approved ✅')
                .addFields(
                    { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                    { name: 'Accepted Nickname', value: nicknameField, inline: true },
                    { name: 'Processed By', value: `<@${interaction.user.id}>`, inline: false }
                );

            await interaction.update({ embeds: [updatedEmbed], components: [] });

            processAcceptance(interaction.guild, targetUserId, nicknameField).then(success => {
                if (!success) {
                    console.log(`❌ Background process failed for accepting user ${targetUserId}. Check role hierarchy.`);
                }
            });

        } else if (action === 'deny') {
            const updatedEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('Application Denied ❌')
                .addFields(
                    { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                    { name: 'Processed By', value: `${interaction.user}`, inline: false }
                );

            await interaction.update({ embeds: [updatedEmbed], components: [] });

            processRejection(interaction.guild, targetUserId).then(success => {
                if (!success) {
                    console.log(`❌ Background process failed for rejecting user ${targetUserId}.`);
                }
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);