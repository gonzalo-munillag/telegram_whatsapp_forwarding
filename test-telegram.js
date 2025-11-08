/**
 * TEST TELEGRAM CONNECTION
 * 
 * This script tests your Telegram credentials and authentication.
 * It will:
 * 1. Load your credentials from .env file
 * 2. Connect to Telegram servers
 * 3. Ask for a verification code (sent to your Telegram app/SMS)
 * 4. Save the session for future use
 * 5. Display your account info to confirm connection
 * 
 * Run with: node test-telegram.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Import required libraries
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM .env FILE
// ═══════════════════════════════════════════════════════════════

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phoneNumber = process.env.TELEGRAM_PHONE;

// Path to store session file
const SESSION_FILE = path.join(__dirname, 'telegram-session.txt');

// Load existing session if available, otherwise create new empty session
let sessionString = '';
if (fs.existsSync(SESSION_FILE)) {
    sessionString = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    console.log('📂 Found existing session file');
}

const stringSession = new StringSession(sessionString);

// ═══════════════════════════════════════════════════════════════
// VALIDATE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

console.log('\n🔍 Validating configuration...\n');

if (!apiId || isNaN(apiId)) {
    console.error('❌ ERROR: TELEGRAM_API_ID is missing or invalid in .env file');
    console.error('   Expected: A number (e.g., TELEGRAM_API_ID=12345678)');
    console.error('   Found:', process.env.TELEGRAM_API_ID);
    process.exit(1);
}

if (!apiHash || apiHash === 'your_api_hash_here') {
    console.error('❌ ERROR: TELEGRAM_API_HASH is missing or invalid in .env file');
    console.error('   Expected: A 32-character alphanumeric string');
    console.error('   Found:', apiHash);
    process.exit(1);
}

if (!phoneNumber || phoneNumber === '+34000000000') {
    console.error('❌ ERROR: TELEGRAM_PHONE is missing or invalid in .env file');
    console.error('   Expected: Phone number with country code (e.g., +34612345678)');
    console.error('   Found:', phoneNumber);
    process.exit(1);
}

if (!phoneNumber.startsWith('+')) {
    console.error('❌ ERROR: TELEGRAM_PHONE must start with + sign');
    console.error('   Expected: +34612345678');
    console.error('   Found:', phoneNumber);
    process.exit(1);
}

console.log('✅ Configuration looks good!');
console.log('   API ID:', apiId);
console.log('   API Hash:', apiHash.substring(0, 8) + '...' + apiHash.substring(apiHash.length - 4));
console.log('   Phone:', phoneNumber);

// ═══════════════════════════════════════════════════════════════
// CONNECT TO TELEGRAM
// ═══════════════════════════════════════════════════════════════

console.log('\n📱 Connecting to Telegram...\n');

// Create Telegram client
const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

// Start the client and authenticate
(async () => {
    try {
        await client.start({
            phoneNumber: async () => phoneNumber,
            password: async () => {
                // If you have 2FA (two-factor authentication) enabled
                return await input.text('🔐 Please enter your 2FA password: ');
            },
            phoneCode: async () => {
                // Telegram will send a code to your app or SMS
                console.log('📨 Telegram is sending you a verification code...');
                console.log('   Check your Telegram app or SMS\n');
                return await input.text('🔢 Enter the code you received: ');
            },
            onError: (err) => {
                console.error('❌ Authentication error:', err.message);
            },
        });

        console.log('\n✅ Successfully connected to Telegram!');
        
        // Get your account information
        const me = await client.getMe();
        console.log('\n👤 Your Telegram Account:');
        console.log('   Name:', me.firstName, me.lastName || '');
        console.log('   Username:', me.username ? '@' + me.username : '(no username)');
        console.log('   User ID:', me.id.toString());
        console.log('   Phone:', me.phone);

        // Save the session string for future use
        const savedSession = client.session.save();
        
        // Save to file
        fs.writeFileSync(SESSION_FILE, savedSession, 'utf8');
        
        console.log('\n💾 Session saved successfully!');
        console.log('   Location: telegram-session.txt');
        console.log('   Preview: ' + savedSession.substring(0, 50) + '...');

        console.log('\n🎉 Test completed successfully!');
        console.log('   Your Telegram credentials are working correctly.');
        console.log('\n📝 Next step: Run Step 4 to discover your friend\'s Telegram ID\n');

    } catch (error) {
        console.error('\n❌ Connection failed:', error.message);
        console.error('\n🔧 Troubleshooting tips:');
        console.error('   1. Check that your API_ID and API_HASH are correct');
        console.error('   2. Verify your phone number includes the country code');
        console.error('   3. Make sure you entered the verification code correctly');
        console.error('   4. Check your internet connection');
        console.error('   5. Try logging out from other Telegram sessions temporarily');
    } finally {
        // Disconnect from Telegram
        await client.disconnect();
    }
})();

