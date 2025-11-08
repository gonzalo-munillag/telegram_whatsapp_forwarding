/**
 * TELEGRAM ↔ WHATSAPP BIDIRECTIONAL BRIDGE
 * 
 * This is the main bridge script that forwards messages between Telegram and WhatsApp.
 * 
 * Features:
 * - Telegram → WhatsApp: Forwards messages from specified friend(s) to your WhatsApp
 * - WhatsApp → Telegram: Sends messages (with prefix) from WhatsApp to Telegram friend
 * - Supports multiple friends
 * - Auto-reconnection on failures
 * - Session persistence (no re-authentication)
 * 
 * Run with: node index.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Import Telegram client
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

// Import WhatsApp client
const { Client: WhatsAppClient, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Import Node.js built-ins
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM .env FILE
// ═══════════════════════════════════════════════════════════════

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID);
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH;
const TELEGRAM_PHONE = process.env.TELEGRAM_PHONE;

// Support both singular and plural variable names for friend IDs
const friendIdsString = process.env.FRIEND_TELEGRAM_IDS || process.env.FRIEND_TELEGRAM_ID;
const YOUR_WHATSAPP_NUMBER = process.env.YOUR_WHATSAPP_NUMBER;
const MESSAGE_PREFIX = process.env.MESSAGE_PREFIX || 'tg:';
const FRIEND_TAGS = process.env.FRIEND_TAGS || '';

// Parse friend IDs (comma-separated string to array of numbers)
// IMPORTANT: FRIEND_TELEGRAM_IDS should only contain numeric IDs, not tags!
const FRIEND_TELEGRAM_IDS = friendIdsString
    .split(',')
    .map(id => id.trim())
    .filter(id => id && id !== '000000000')
    .map(id => {
        // Check if user accidentally put tags in FRIEND_TELEGRAM_IDS
        if (id.includes(':')) {
            const [tag, numId] = id.split(':');
            console.error('\n❌ ERROR: Invalid format in FRIEND_TELEGRAM_IDS');
            console.error(`   Found: "${id}"`);
            console.error(`   Expected: Just numeric IDs`);
            console.error('\n   Tags should go in FRIEND_TAGS, not FRIEND_TELEGRAM_IDS!');
            console.error('\n   Change your .env from:');
            console.error(`   FRIEND_TELEGRAM_IDS=${friendIdsString}`);
            console.error('\n   To:');
            console.error(`   FRIEND_TELEGRAM_IDS=${numId}${friendIdsString.replace(id, '').replace(/^,|,$/g, '')}`);
            console.error(`   FRIEND_TAGS=${id}${FRIEND_TAGS ? ',' + FRIEND_TAGS : ''}`);
            console.error('');
            process.exit(1);
        }
        
        // Check if it's a valid number
        if (!/^\d+$/.test(id)) {
            console.error('\n❌ ERROR: Invalid ID in FRIEND_TELEGRAM_IDS');
            console.error(`   Found in .env: FRIEND_TELEGRAM_IDS=${friendIdsString}`);
            console.error(`   Invalid part: "${id}"`);
            console.error(`   Expected: Only numbers (e.g., "123456789" or "123456789,987654321")`);
            console.error('');
            process.exit(1);
        }
        
        return BigInt(id);
    }); // Telegram uses BigInt for user IDs

// Parse friend tags into a map: { tag: telegramId, ... }
// Example: "john:123456789,mary:987654321" → { john: 123456789n, mary: 987654321n }
const FRIEND_TAG_MAP = {};
const FRIEND_ID_TO_TAG = {}; // Reverse lookup: { telegramId: tag, ... }

if (FRIEND_TAGS) {
    FRIEND_TAGS.split(',').forEach(pair => {
        const [tag, id] = pair.split(':').map(s => s.trim());
        if (tag && id) {
            const bigIntId = BigInt(id);
            FRIEND_TAG_MAP[tag.toLowerCase()] = bigIntId;
            FRIEND_ID_TO_TAG[bigIntId.toString()] = tag;
        }
    });
}

// Session file path
const SESSION_FILE = path.join(__dirname, 'telegram-session.txt');

// ═══════════════════════════════════════════════════════════════
// VALIDATE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('🌉 TELEGRAM ↔ WHATSAPP BRIDGE');
console.log('═'.repeat(70) + '\n');

console.log('🔍 Validating configuration...\n');

// Validate Telegram configuration
if (!TELEGRAM_API_ID || isNaN(TELEGRAM_API_ID)) {
    console.error('❌ ERROR: TELEGRAM_API_ID is missing or invalid');
    process.exit(1);
}

if (!TELEGRAM_API_HASH) {
    console.error('❌ ERROR: TELEGRAM_API_HASH is missing');
    process.exit(1);
}

if (!TELEGRAM_PHONE) {
    console.error('❌ ERROR: TELEGRAM_PHONE is missing');
    process.exit(1);
}

if (!fs.existsSync(SESSION_FILE)) {
    console.error('❌ ERROR: Telegram session file not found');
    console.error('   Please run: node test-telegram.js');
    process.exit(1);
}

// Validate friend IDs
if (FRIEND_TELEGRAM_IDS.length === 0) {
    console.error('❌ ERROR: No valid friend Telegram IDs found');
    console.error('   Please set FRIEND_TELEGRAM_IDS in .env file');
    console.error('   Run: node get-friend-id.js to discover IDs');
    process.exit(1);
}

// Validate WhatsApp configuration
if (!YOUR_WHATSAPP_NUMBER || YOUR_WHATSAPP_NUMBER === '34000000000') {
    console.error('❌ ERROR: YOUR_WHATSAPP_NUMBER is missing or invalid');
    process.exit(1);
}

console.log('✅ Configuration valid!');
console.log('   Telegram API ID:', TELEGRAM_API_ID);
console.log('   Telegram Phone:', TELEGRAM_PHONE);
console.log('   Friend IDs:', FRIEND_TELEGRAM_IDS.map(id => id.toString()).join(', '));
console.log('   WhatsApp Number:', YOUR_WHATSAPP_NUMBER);
console.log('   Message Prefix:', MESSAGE_PREFIX + ' (case-insensitive)');
if (Object.keys(FRIEND_TAG_MAP).length > 0) {
    console.log('   Friend Tags:', Object.entries(FRIEND_TAG_MAP)
        .map(([tag, id]) => `${tag}:${id}`)
        .join(', '));
}
console.log('');

// ═══════════════════════════════════════════════════════════════
// INITIALIZE TELEGRAM CLIENT
// ═══════════════════════════════════════════════════════════════

console.log('📱 Initializing Telegram client...');

// Load saved session
const sessionString = fs.readFileSync(SESSION_FILE, 'utf8').trim();
const stringSession = new StringSession(sessionString);

// Create Telegram client
const telegramClient = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
});

// ═══════════════════════════════════════════════════════════════
// INITIALIZE WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════

console.log('📱 Initializing WhatsApp client...\n');

// Create WhatsApp client with LocalAuth for session persistence
const whatsappClient = new WhatsAppClient({
    authStrategy: new LocalAuth({
        clientId: 'telegram-bridge'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Event: QR code for WhatsApp authentication
 * Should only trigger if session expired or doesn't exist
 */
whatsappClient.on('qr', (qr) => {
    console.log('\n⚠️  WhatsApp session expired or not found!');
    console.log('📷 Please scan this QR code with your phone:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n📱 Open WhatsApp → Linked Devices → Link a Device\n');
});

/**
 * Event: WhatsApp authenticated
 */
whatsappClient.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated successfully');
});

/**
 * Event: WhatsApp ready
 */
whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp client ready!');
    console.log('   Connected as:', whatsappClient.info.pushname);
    console.log('   Phone:', whatsappClient.info.wid.user);
});

/**
 * Event: WhatsApp authentication failure
 */
whatsappClient.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp authentication failed:', msg);
    console.error('   Try running: node test-whatsapp.js');
});

/**
 * Event: WhatsApp disconnected
 */
whatsappClient.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp disconnected:', reason);
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE FORWARDING: WHATSAPP → TELEGRAM
// ═══════════════════════════════════════════════════════════════

/**
 * Listen for messages on WhatsApp
 * When a message starts with the prefix, send it to Telegram friend(s)
 * 
 * Supported formats (case-insensitive):
 * - "tg: message" or "TG: message" → sends to all friends
 * - "tg:all message" → sends to all friends
 * - "tg:john message" → sends to friend tagged as "john"
 * 
 * Note: Using 'message_create' instead of 'message' to capture self-sent messages
 */
async function handleWhatsAppMessage(msg) {
    try {
        // Only process messages from YOUR WhatsApp number or messages you sent
        const fromNumber = msg.from.replace('@c.us', '');
        
        // IMPORTANT: Check if this is a message FROM us (using fromMe property)
        // This is crucial for self-messaging to work
        if (!msg.fromMe && fromNumber !== YOUR_WHATSAPP_NUMBER) {
            return; // Ignore messages from other people
        }

        // Check if message starts with the prefix (case-insensitive)
        const lowerBody = msg.body.toLowerCase();
        const lowerPrefix = MESSAGE_PREFIX.toLowerCase();
        
        if (!lowerBody.startsWith(lowerPrefix)) {
            return; // Not a command for the bridge
        }

        // Extract everything after the prefix
        const afterPrefix = msg.body.substring(MESSAGE_PREFIX.length).trim();

        if (!afterPrefix) {
            const tagHelp = Object.keys(FRIEND_TAG_MAP).length > 0 
                ? `\n   Tags: ${Object.keys(FRIEND_TAG_MAP).join(', ')}, all`
                : '';
            await msg.reply('⚠️ Message is empty.\n\nUsage:\n   ' + MESSAGE_PREFIX + ' Your message\n   ' + MESSAGE_PREFIX + 'all Your message\n   ' + MESSAGE_PREFIX + 'john Your message' + tagHelp);
            return;
        }

        // Parse tag and message
        // Format: "tag message" or just "message"
        let targetTag = 'all'; // default to all friends
        let messageToSend = afterPrefix;
        
        // Check if first word is a tag (no space after colon)
        const firstSpace = afterPrefix.indexOf(' ');
        if (firstSpace > 0) {
            const potentialTag = afterPrefix.substring(0, firstSpace).toLowerCase();
            
            if (potentialTag === 'all' || FRIEND_TAG_MAP[potentialTag]) {
                targetTag = potentialTag;
                messageToSend = afterPrefix.substring(firstSpace + 1).trim();
            }
        } else if (afterPrefix.toLowerCase() === 'all' || FRIEND_TAG_MAP[afterPrefix.toLowerCase()]) {
            await msg.reply('⚠️ No message provided after tag.');
            return;
        }

        if (!messageToSend) {
            await msg.reply('⚠️ Message is empty.');
            return;
        }

        // Determine which friends to send to
        let targetFriendIds = [];
        let targetDescription = '';

        if (targetTag === 'all') {
            targetFriendIds = FRIEND_TELEGRAM_IDS;
            targetDescription = 'all friends';
        } else if (FRIEND_TAG_MAP[targetTag]) {
            targetFriendIds = [FRIEND_TAG_MAP[targetTag]];
            targetDescription = `friend "${targetTag}"`;
        } else {
            await msg.reply(`⚠️ Unknown tag: "${targetTag}"\nAvailable: ${Object.keys(FRIEND_TAG_MAP).join(', ')}, all`);
            return;
        }

        console.log(`\n📤 [WhatsApp → Telegram] Sending message...`);
        console.log(`   From: You (WhatsApp)`);
        console.log(`   To: ${targetDescription} (${targetFriendIds.length} recipient(s))`);
        console.log(`   Message: "${messageToSend.substring(0, 50)}${messageToSend.length > 50 ? '...' : ''}"`);

        // Send to target friend(s) on Telegram
        let successCount = 0;
        let errorCount = 0;

        for (const friendId of targetFriendIds) {
            try {
                await telegramClient.sendMessage(friendId, { message: messageToSend });
                successCount++;
                const friendTag = FRIEND_ID_TO_TAG[friendId.toString()] || friendId.toString();
                console.log(`   ✅ Sent to: ${friendTag}`);
            } catch (error) {
                errorCount++;
                const friendTag = FRIEND_ID_TO_TAG[friendId.toString()] || friendId.toString();
                console.error(`   ❌ Failed to send to ${friendTag}:`, error.message);
            }
        }

        // Send confirmation back to WhatsApp
        if (successCount > 0) {
            const recipients = targetTag === 'all' 
                ? `${successCount} friend(s)` 
                : targetTag;
            await msg.reply(`✅ Sent to ${recipients} on Telegram`);
        }
        if (errorCount > 0) {
            await msg.reply(`⚠️ Failed to send to ${errorCount} friend(s)`);
        }

    } catch (error) {
        console.error('❌ Error in WhatsApp → Telegram forwarding:', error.message);
        try {
            await msg.reply('❌ Error sending message to Telegram');
        } catch (replyError) {
            console.error('   Could not send error reply:', replyError.message);
        }
    }
}

// Listen to BOTH 'message' and 'message_create' events
// 'message_create' is needed to capture messages you send yourself
whatsappClient.on('message', handleWhatsAppMessage);
whatsappClient.on('message_create', handleWhatsAppMessage);

// ═══════════════════════════════════════════════════════════════
// MESSAGE FORWARDING: TELEGRAM → WHATSAPP
// ═══════════════════════════════════════════════════════════════

/**
 * Listen for new messages on Telegram
 * When a message is from a configured friend, forward it to WhatsApp
 */
async function setupTelegramForwarding() {
    // Get your own Telegram info (for logging)
    const me = await telegramClient.getMe();
    console.log('✅ Telegram client ready!');
    console.log('   Connected as:', me.firstName, me.lastName || '');
    console.log('   Username:', me.username ? '@' + me.username : '(no username)');

    console.log('\n' + '═'.repeat(70));
    console.log('🎉 BRIDGE IS ACTIVE!');
    console.log('═'.repeat(70));
    console.log('\n📨 Forwarding Configuration:');
    console.log('   Telegram → WhatsApp: Messages from ' + FRIEND_TELEGRAM_IDS.length + ' friend(s)');
    console.log('   WhatsApp → Telegram: Messages starting with "' + MESSAGE_PREFIX + '"');

    // Listen for new messages
    telegramClient.addEventHandler(async (event) => {
        try {
            const message = event.message;

            // Ignore events without a message object
            if (!message) {
                return;
            }

            // Ignore messages without text
            if (!message.text) {
                return;
            }

            // Get sender ID and convert to BigInt for comparison
            const senderId = message.senderId;
            const senderIdBigInt = typeof senderId === 'bigint' ? senderId : BigInt(senderId.toString());

            // Check if sender is one of our configured friends
            const isFriend = FRIEND_TELEGRAM_IDS.some(id => id === senderIdBigInt);

            if (!isFriend) {
                return; // Not from a configured friend, ignore
            }

            // Get sender information
            const sender = await message.getSender();
            const senderName = sender.firstName + (sender.lastName ? ' ' + sender.lastName : '');
            
            // Get tag for this friend if available (using BigInt version)
            const senderTag = FRIEND_ID_TO_TAG[senderIdBigInt.toString()];
            const displayName = senderTag ? `${senderName} (${senderTag})` : senderName;

            console.log(`\n📥 [Telegram → WhatsApp] New message received!`);
            console.log(`   From: ${displayName} (ID: ${senderIdBigInt})`);
            console.log(`   Message: "${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}"`);

            // Format message for WhatsApp (include tag if available)
            const messageHeader = senderTag 
                ? `📨 TG | ${senderName} (${senderTag}):`
                : `📨 TG | ${senderName}:`;
            const forwardedMessage = `${messageHeader}\n${message.text}`;

            // Send to your WhatsApp
            const whatsappNumber = YOUR_WHATSAPP_NUMBER + '@c.us';
            await whatsappClient.sendMessage(whatsappNumber, forwardedMessage);

            console.log(`   ✅ Forwarded to WhatsApp`);

        } catch (error) {
            console.error('❌ Error in Telegram → WhatsApp forwarding:', error.message);
        }
    }, new NewMessage({}));
}

// ═══════════════════════════════════════════════════════════════
// START THE BRIDGE
// ═══════════════════════════════════════════════════════════════

(async () => {
    try {
        // Start Telegram client
        await telegramClient.connect();
        await setupTelegramForwarding();

        // Start WhatsApp client
        await whatsappClient.initialize();

    } catch (error) {
        console.error('\n❌ Failed to start bridge:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Check your .env file has correct values');
        console.error('   2. Run test-telegram.js to verify Telegram connection');
        console.error('   3. Run test-whatsapp.js to verify WhatsApp connection');
        console.error('   4. Check your internet connection');
        process.exit(1);
    }
})();

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

/**
 * Handle process termination (Ctrl+C)
 * Cleanly disconnect both clients
 */
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Shutting down bridge...');
    console.log('🔌 Disconnecting clients...\n');
    
    try {
        await telegramClient.disconnect();
        console.log('✅ Telegram disconnected');
    } catch (error) {
        console.error('⚠️  Error disconnecting Telegram:', error.message);
    }
    
    try {
        await whatsappClient.destroy();
        console.log('✅ WhatsApp disconnected');
    } catch (error) {
        console.error('⚠️  Error disconnecting WhatsApp:', error.message);
    }
    
    console.log('\n👋 Bridge stopped. Goodbye!\n');
    process.exit(0);
});

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
    console.error('\n❌ Unhandled error:', error);
});

