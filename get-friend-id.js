/**
 * GET FRIEND'S TELEGRAM ID
 * 
 * This script lists your recent Telegram chats and shows their numeric IDs.
 * You'll use this to find your friend's Telegram ID and add it to your .env file.
 * 
 * How it works:
 * 1. Connects to Telegram using your saved session from Step 3
 * 2. Fetches your recent dialogs (chats)
 * 3. Displays each contact/group with their numeric ID
 * 4. You find your friend and copy their ID to .env
 * 
 * Run with: node get-friend-id.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Import required libraries
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM .env FILE
// ═══════════════════════════════════════════════════════════════

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Path to session file saved in Step 3
const SESSION_FILE = path.join(__dirname, 'telegram-session.txt');

// Load the saved session from Step 3
let sessionString = '';
if (fs.existsSync(SESSION_FILE)) {
    sessionString = fs.readFileSync(SESSION_FILE, 'utf8').trim();
} else {
    console.error('❌ ERROR: Session file not found!');
    console.error('   Please run Step 3 first: node test-telegram.js');
    console.error('   Expected file: telegram-session.txt\n');
    process.exit(1);
}

const stringSession = new StringSession(sessionString);

// ═══════════════════════════════════════════════════════════════
// VALIDATE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

console.log('\n🔍 Validating configuration...\n');

if (!apiId || isNaN(apiId)) {
    console.error('❌ ERROR: TELEGRAM_API_ID is missing or invalid');
    process.exit(1);
}

if (!apiHash) {
    console.error('❌ ERROR: TELEGRAM_API_HASH is missing');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// CONNECT TO TELEGRAM
// ═══════════════════════════════════════════════════════════════

console.log('📱 Connecting to Telegram...\n');

// Create Telegram client
const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

// Function to format chat information
function formatChatInfo(dialog) {
    const entity = dialog.entity;
    
    // Determine chat type
    let chatType = '';
    let chatName = '';
    let username = '';
    let chatId = '';
    
    if (entity.className === 'User') {
        // Private chat with a user
        chatType = '👤 User';
        chatName = `${entity.firstName || ''} ${entity.lastName || ''}`.trim();
        username = entity.username ? `@${entity.username}` : '';
        chatId = entity.id.toString();
    } else if (entity.className === 'Chat') {
        // Group chat (small group)
        chatType = '👥 Group';
        chatName = entity.title || 'Unnamed Group';
        chatId = entity.id.toString();
    } else if (entity.className === 'Channel') {
        // Channel or supergroup
        if (entity.megagroup) {
            chatType = '👥 Supergroup';
        } else if (entity.broadcast) {
            chatType = '📢 Channel';
        } else {
            chatType = '📢 Channel/Group';
        }
        chatName = entity.title || 'Unnamed Channel';
        username = entity.username ? `@${entity.username}` : '';
        chatId = entity.id.toString();
    }
    
    return { chatType, chatName, username, chatId };
}

// Main function to get and display dialogs
(async () => {
    try {
        // Start the client (will use saved session from Step 3)
        await client.connect();
        
        console.log('✅ Connected to Telegram!\n');
        console.log('📋 Fetching your recent chats...\n');
        console.log('═'.repeat(80));
        
        // Get all dialogs (recent chats)
        const dialogs = await client.getDialogs({ limit: 50 });
        
        console.log('\n🔍 YOUR RECENT TELEGRAM CHATS:\n');
        console.log('Format: [Type] Name (@username) | ID: numeric_id\n');
        console.log('─'.repeat(80));
        
        let userCount = 0;
        
        // Display each dialog
        dialogs.forEach((dialog, index) => {
            const { chatType, chatName, username, chatId } = formatChatInfo(dialog);
            
            // Only count users (not groups/channels)
            if (chatType === '👤 User') {
                userCount++;
            }
            
            // Format the output
            const usernameDisplay = username ? `(${username})` : '';
            console.log(`${index + 1}. ${chatType} | ${chatName} ${usernameDisplay}`);
            console.log(`   ID: ${chatId}`);
            console.log('');
        });
        
        console.log('─'.repeat(80));
        console.log(`\nTotal: ${dialogs.length} chats (${userCount} users, ${dialogs.length - userCount} groups/channels)\n`);
        
        // Instructions
        console.log('═'.repeat(80));
        console.log('\n📝 NEXT STEPS:\n');
        console.log('1. Find your friend in the list above');
        console.log('2. Copy their numeric ID (the number after "ID:")');
        console.log('3. Open your .env file');
        console.log('4. Update FRIEND_TELEGRAM_ID with the copied number');
        console.log('   Example: FRIEND_TELEGRAM_ID=123456789');
        console.log('5. Save the .env file\n');
        
        console.log('💡 TIP: Look for a 👤 User entry with your friend\'s name\n');
        console.log('⚠️  IMPORTANT: Use the numeric ID, NOT the @username!\n');
        
        console.log('═'.repeat(80));
        console.log('\n✅ Step 4 complete! Update your .env file and proceed to Step 5.\n');
        
    } catch (error) {
        console.error('\n❌ Error fetching chats:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Make sure you completed Step 3 (test-telegram.js) successfully');
        console.error('   2. Check that your .env file has correct credentials');
        console.error('   3. Try running test-telegram.js again to refresh your session');
        console.error('   4. Ensure you have an active internet connection\n');
    } finally {
        // Disconnect from Telegram
        await client.disconnect();
    }
})();

