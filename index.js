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
    EmbedBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Triggered when the bot is ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Command to spawn the initial landing application button
client.on('messageCreate', async (message) => {
    if (message.content === '!setup-apply' && message.member.permissions.has('Administrator')) {
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
        await message.delete();
    }
});

// Handle Interactions (Buttons and Modals)
client.on('interactionCreate', async (interaction) => {
    
    // 1. User clicks the initial "Apply for Crew" button
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

    // 2. User submits the Modal form
    if (interaction.isModalSubmit() && interaction.customId === 'crew_app_modal') {
        const requestedName = interaction.fields.getTextInputValue('app_nickname');
        const staffChannel = await interaction.guild.channels.fetch(process.env.STAFF_CHANNEL_ID);

        const staffEmbed = new EmbedBuilder()
            .setTitle('New Crew Application Pending')
            .setColor(0xE67E22)
            .addFields(
                { name: 'Applicant', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                { name: 'Requested Nickname', value: requestedName, inline: true }
            )
            .setTimestamp();

        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${interaction.user.id}_${requestedName}`)
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

    // 3. Staff clicks Accept or Deny
    if (interaction.isButton() && (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('deny_'))) {
        await interaction.deferUpdate(); // Prevents interaction timeout errors

        const parts = interaction.customId.split('_');
        const action = parts[0]; // 'accept' or 'deny'
        const targetUserId = parts[1];
        const newNickname = parts.slice(2).join('_'); // Rebuilds name if it contained underscores

        try {
            const member = await interaction.guild.members.fetch(targetUserId);
            
            if (action === 'accept') {
                // Change Nickname
                await member.setNickname(newNickname);
                // Assign Crew Role
                await member.roles.add(process.env.CREW_ROLE_ID);

                // Update staff message to show completion
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x2ECC71)
                    .setTitle('Application Approved ✅')
                    .addFields({ name: 'Processed By', value: `${interaction.user}` });

                await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
                
                // DM the user the good news
                await member.send(`Congratulations! Your application has been approved. Welcome to the crew, **${newNickname}**!`).catch(() => null);
            
            } else if (action === 'deny') {
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xE74C3C)
                    .setTitle('Application Denied ❌')
                    .addFields({ name: 'Processed By', value: `${interaction.user}` });

                await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
                await member.send(`Thank you for applying. Unfortunately, your crew application was denied at this time.`).catch(() => null);
            }

        } catch (error) {
            console.error(error);
            await interaction.followUp({ content: `Error processing application: Target user may have left the server, or the bot role hierarchy position is too low to modify them.`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);