/**
 * TEST WHATSAPP CONNECTION
 * 
 * This script tests your WhatsApp Web connection.
 * It will:
 * 1. Initialize WhatsApp Web client (simulates a browser)
 * 2. Display a QR code in your terminal
 * 3. You scan the QR code with your phone (WhatsApp app)
 * 4. Save the session for future use
 * 5. Display your account info to confirm connection
 * 
 * HOW TO SCAN QR CODE:
 * - Open WhatsApp on your phone
 * - Tap Menu (⋮) or Settings
 * - Tap "Linked Devices"
 * - Tap "Link a Device"
 * - Scan the QR code shown in this terminal
 * 
 * Run with: node test-whatsapp.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Import WhatsApp client library
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION FROM .env FILE
// ═══════════════════════════════════════════════════════════════

const yourWhatsAppNumber = process.env.YOUR_WHATSAPP_NUMBER;

// ═══════════════════════════════════════════════════════════════
// VALIDATE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

console.log('\n🔍 Validating configuration...\n');

if (!yourWhatsAppNumber || yourWhatsAppNumber === '34000000000') {
    console.error('❌ ERROR: YOUR_WHATSAPP_NUMBER is missing or invalid in .env file');
    console.error('   Expected: Phone number WITHOUT + sign (e.g., 34612345678)');
    console.error('   Found:', yourWhatsAppNumber);
    process.exit(1);
}

if (yourWhatsAppNumber.startsWith('+')) {
    console.error('❌ ERROR: YOUR_WHATSAPP_NUMBER should NOT start with + sign');
    console.error('   Expected: 34612345678');
    console.error('   Found:', yourWhatsAppNumber);
    process.exit(1);
}

console.log('✅ Configuration looks good!');
console.log('   WhatsApp Number:', yourWhatsAppNumber);

// ═══════════════════════════════════════════════════════════════
// INITIALIZE WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════

console.log('\n📱 Initializing WhatsApp Web client...\n');
console.log('⏳ This may take a minute - starting browser simulation...\n');

/**
 * LocalAuth strategy:
 * - Saves authentication session to .wwebjs_auth/ folder
 * - Session persists across restarts (no need to re-scan QR code)
 * - Similar to how WhatsApp Web works in your browser
 */
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'telegram-bridge' // Unique identifier for this session
    }),
    puppeteer: {
        headless: true, // Run browser in background (no visible window)
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
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Event: qr
 * Triggered when QR code is ready to scan
 * This happens on first run or if session expired
 */
client.on('qr', (qr) => {
    console.log('═'.repeat(60));
    console.log('\n📷 QR CODE READY!\n');
    console.log('Please scan this QR code with your WhatsApp:\n');
    
    // Display QR code in terminal
    qrcode.generate(qr, { small: true });
    
    console.log('\n📱 HOW TO SCAN:');
    console.log('   1. Open WhatsApp on your phone');
    console.log('   2. Tap Menu (⋮) or Settings');
    console.log('   3. Tap "Linked Devices"');
    console.log('   4. Tap "Link a Device"');
    console.log('   5. Point your camera at the QR code above');
    console.log('\n⏳ Waiting for scan...\n');
    console.log('═'.repeat(60));
});

/**
 * Event: loading_screen
 * Triggered during initialization
 */
client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading WhatsApp: ${percent}% - ${message}`);
});

/**
 * Event: authenticated
 * Triggered when QR code is successfully scanned
 */
client.on('authenticated', () => {
    console.log('\n✅ QR Code scanned successfully!');
    console.log('   Authenticating with WhatsApp servers...\n');
});

/**
 * Event: auth_failure
 * Triggered if authentication fails
 */
client.on('auth_failure', (msg) => {
    console.error('\n❌ Authentication failed:', msg);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Make sure you scanned the correct QR code');
    console.error('   2. Check your phone has internet connection');
    console.error('   3. Try running the script again');
    console.error('   4. If problem persists, delete .wwebjs_auth/ folder and retry\n');
});

/**
 * Event: ready
 * Triggered when client is fully connected and ready
 */
client.on('ready', async () => {
    console.log('═'.repeat(60));
    console.log('\n✅ Successfully connected to WhatsApp!\n');
    
    try {
        // Get account information
        const info = client.info;
        
        console.log('👤 Your WhatsApp Account:');
        console.log('   Name:', info.pushname || '(no name set)');
        console.log('   Phone:', info.wid.user); // Phone number
        console.log('   WhatsApp ID:', info.wid._serialized);
        console.log('   Platform:', info.platform);
        
        console.log('\n💾 Session saved successfully!');
        console.log('   Location: .wwebjs_auth/telegram-bridge/');
        console.log('   Next time you run, no QR code will be needed!');
        
        console.log('\n🎉 Test completed successfully!');
        console.log('   Your WhatsApp credentials are working correctly.');
        console.log('\n📝 Next step: Proceed to Step 6 to implement the bridge!\n');
        
    } catch (error) {
        console.error('❌ Error getting account info:', error.message);
    }
    
    console.log('═'.repeat(60));
    console.log('\n⏳ Keeping connection alive for 5 seconds...\n');
    
    // Keep connection alive briefly, then disconnect
    setTimeout(async () => {
        console.log('🔌 Disconnecting...\n');
        await client.destroy();
        console.log('✅ Disconnected successfully!\n');
        process.exit(0);
    }, 5000);
});

/**
 * Event: disconnected
 * Triggered when connection is lost
 */
client.on('disconnected', (reason) => {
    console.log('\n⚠️  Disconnected from WhatsApp:', reason);
    console.log('   This is normal if you closed the connection.\n');
});

// ═══════════════════════════════════════════════════════════════
// START THE CLIENT
// ═══════════════════════════════════════════════════════════════

console.log('🚀 Starting WhatsApp Web client...');
console.log('   This will launch a headless Chrome browser');
console.log('   and connect to WhatsApp Web servers.\n');

// Initialize the client
client.initialize().catch(error => {
    console.error('\n❌ Failed to initialize WhatsApp client:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Make sure you have Chrome/Chromium installed');
    console.error('   2. Check your internet connection');
    console.error('   3. Try deleting .wwebjs_auth/ and .wwebjs_cache/ folders');
    console.error('   4. Run: rm -rf .wwebjs_auth .wwebjs_cache');
    console.error('   5. Then run this script again\n');
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received interrupt signal...');
    console.log('🔌 Disconnecting from WhatsApp...\n');
    await client.destroy();
    process.exit(0);
});

