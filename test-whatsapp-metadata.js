/**
 * ============================================================================
 * WhatsApp Metadata Inspector
 * ============================================================================
 * 
 * PURPOSE:
 * This script analyzes and logs ALL metadata that WhatsApp exposes through
 * their Web API. It demonstrates the difference between:
 * - Server-side metadata (visible to Meta/WhatsApp Inc.)
 * - End-to-end encrypted content (only visible to sender/recipient)
 * 
 * EDUCATIONAL VALUE:
 * Shows exactly what data WhatsApp collects, helping users understand
 * the privacy implications of messaging platforms that claim "E2EE".
 * 
 * TECHNICAL APPROACH:
 * Uses whatsapp-web.js to reverse-engineer WhatsApp Web, extracting
 * the complete data structure that the browser receives from WhatsApp servers.
 * 
 * USAGE:
 * node test-whatsapp-metadata.js
 * 
 * REQUIREMENTS:
 * - Node.js installed
 * - whatsapp-web.js package (npm install whatsapp-web.js)
 * - qrcode-terminal package (npm install qrcode-terminal)
 * - Internet connection (for IP geolocation)
 * 
 * @license MIT
 */

// ============================================================================
// IMPORTS & DEPENDENCIES
// ============================================================================

/**
 * whatsapp-web.js: Unofficial library that reverse-engineers WhatsApp Web
 * - Launches headless Chrome via Puppeteer
 * - Simulates web.whatsapp.com behavior
 * - Exposes JavaScript API for message handling
 * - Not official - could break if WhatsApp changes their web client
 */
const { Client, LocalAuth } = require('whatsapp-web.js');

/**
 * qrcode-terminal: Generates QR codes in the terminal
 * - Used for WhatsApp Web authentication
 * - User scans QR with phone to link device
 * - One-time setup, session persists afterward
 */
const qrcode = require('qrcode-terminal');

/**
 * fs.promises: Node.js filesystem module (Promise-based API)
 * - Used to save JSON logs to disk
 * - mkdir: Create directories
 * - writeFile: Save JSON data
 */
const fs = require('fs').promises;

/**
 * path: Node.js path manipulation module
 * - join(): Safely combine path segments
 * - Works cross-platform (Windows/Mac/Linux)
 */
const path = require('path');

// ============================================================================
// LOG DIRECTORY SETUP
// ============================================================================

/**
 * Directory structure for metadata logs
 * 
 * WHY SAVE LOGS?
 * - Provides evidence for claims
 * - Allows independent verification
 * - Enables offline analysis
 * - Creates audit trail
 * 
 * STRUCTURE:
 * metadata_logs/
 * ├── message_objects/     - Complete Message API responses
 * ├── chat_objects/        - Complete Chat API responses
 * ├── raw_data_structures/ - Raw _data property + analysis notes
 * └── terminal_logs/       - Complete terminal output per message
 */
const LOGS_DIR = path.join(__dirname, 'metadata_logs');
const MESSAGE_DIR = path.join(LOGS_DIR, 'message_objects');
const CHAT_DIR = path.join(LOGS_DIR, 'chat_objects');
const RAW_DIR = path.join(LOGS_DIR, 'raw_data_structures');
const TERMINAL_DIR = path.join(LOGS_DIR, 'terminal_logs');

/**
 * Log buffer for capturing terminal output
 * 
 * WHY BUFFER LOGS?
 * - Save complete analysis to file
 * - Allow simpler terminal output
 * - Create readable audit trail
 * - Easy to review later offline
 */
let logBuffer = [];

/**
 * Dual logging function
 * 
 * Logs to both:
 * 1. Terminal (console) - for real-time viewing
 * 2. Buffer (array) - for saving to file
 * 
 * @param {string} message - The message to log
 * @param {boolean} consoleOnly - If true, only log to console (not buffer)
 */
function log(message, consoleOnly = false) {
  console.log(message);
  if (!consoleOnly) {
    logBuffer.push(message);
  }
}

// ============================================================================
// INITIALIZATION MESSAGE
// ============================================================================

console.log('🔍 WhatsApp Metadata Inspector - Evidence-Based Analysis\n');
console.log('This tool analyzes metadata:');
console.log('  • What Meta could observe from API data');
console.log('  • What is E2E encrypted');
console.log('  • What Meta could calculate server-side\n');
console.log(`Logs will be saved to: ${LOGS_DIR}\n`);

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

/**
 * WhatsApp Client Setup
 * 
 * The Client object manages the connection to WhatsApp Web servers
 * and provides event handlers for messages, authentication, etc.
 */
const client = new Client({
  /**
   * authStrategy: LocalAuth
   * - Saves authentication session locally in .wwebjs_auth/ folder
   * - Prevents need to re-scan QR code on every run
   * - Session includes encryption keys and device registration
   * - Alternative: NoAuth (requires QR scan every time)
   */
  authStrategy: new LocalAuth(),
  
  /**
   * puppeteer: Configuration for headless Chrome
   * - WhatsApp Web runs in a real Chrome browser instance
   * - Puppeteer controls this browser programmatically
   */
  puppeteer: {
    /**
     * headless: false
     * - Shows the browser window (useful for debugging)
     * - Set to true to run in background (no visible window)
     * - Visible window helps verify QR scan and connection status
     */
    headless: false,
    
    /**
     * args: Chrome command-line flags
     * - These flags optimize Chrome for automation and Docker environments
     */
    args: [
      '--no-sandbox',                      // Required for Docker (disables Chrome sandbox)
      '--disable-setuid-sandbox',          // Additional sandbox disabling (for containers)
      '--disable-dev-shm-usage',           // Use /tmp instead of /dev/shm (prevents crashes in limited RAM)
      '--disable-accelerated-2d-canvas',   // Disable GPU acceleration (saves resources)
      '--no-first-run',                    // Skip first-run wizards
      '--no-zygote',                       // Disable zygote process (for stability)
      '--disable-gpu'                      // Disable GPU entirely (headless environments)
    ]
  }
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * QR CODE EVENT
 * 
 * Triggered when WhatsApp requires device linking via QR code.
 * This happens on first run or when session expires (~30 days).
 * 
 * How it works:
 * 1. WhatsApp Web generates a unique QR code
 * 2. QR contains encryption keys and session ID
 * 3. User scans with phone camera (via WhatsApp app)
 * 4. Phone sends encrypted session data to WhatsApp servers
 * 5. Web client receives session confirmation
 * 6. Connection established, messages start flowing
 * 
 * @param {string} qr - Base64-encoded QR code data
 */
client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with WhatsApp:\n');
  
  /**
   * qrcode.generate():
   * - Renders QR code as ASCII art in terminal
   * - small: true = compact output (fits in terminal)
   * - User scans this with WhatsApp > Menu > Linked Devices > Link a Device
   */
  qrcode.generate(qr, { small: true });
});

/**
 * READY EVENT
 * 
 * Triggered when WhatsApp client is fully authenticated and connected.
 * At this point, the client can send/receive messages.
 * 
 * Connection flow:
 * 1. QR scanned (or session loaded)
 * 2. WebSocket connection established to WhatsApp servers
 * 3. Client receives user info, chats list, initial messages
 * 4. 'ready' event fires
 * 5. Now safe to call message-related methods
 */
client.on('ready', () => {
  console.log('✅ WhatsApp client ready!');
  console.log('📨 Send yourself a message to see the metadata...\n');
  console.log('='.repeat(80));
});

// ============================================================================
// MESSAGE PROCESSING EVENT
// ============================================================================

/**
 * MESSAGE_CREATE EVENT
 * 
 * Triggered for EVERY message (incoming and outgoing).
 * 
 * Key differences from 'message' event:
 * - 'message': Only messages FROM others (incoming)
 * - 'message_create': ALL messages including ones YOU send
 * 
 * Why message_create?
 * - Allows testing by sending messages to yourself
 * - Shows bidirectional metadata collection
 * - Mirrors what WhatsApp servers see (all traffic)
 * 
 * @param {Message} msg - Complete message object with all properties
 */
client.on('message_create', async (msg) => {
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: INITIALIZE NEW MESSAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Clear log buffer for new message
   * 
   * Each message gets its own analysis and log file
   * Buffer accumulates all output for this message only
   */
  logBuffer = [];
  
  /**
   * Create clear visual separator
   * 
   * Makes it easy to see where each message analysis starts/ends
   * in the terminal output
   */
  const separator = '\n' + '█'.repeat(80) + '\n';
  const timestamp = new Date().toISOString();
  
  // Terminal: Concise header
  console.log(separator);
  console.log(`🔍 NEW MESSAGE ANALYSIS STARTED - ${timestamp}`);
  console.log('█'.repeat(80));
  
  // Buffer: Detailed header for file
  log('');
  log('█'.repeat(80));
  log('█'.repeat(80));
  log('███');
  log(`███  WhatsApp Metadata Analysis Report`);
  log(`███  Generated: ${timestamp}`);
  log('███');
  log('█'.repeat(80));
  log('█'.repeat(80));
  log('');
  
  /**
   * Get chat object
   * 
   * msg.getChat() is an async call to fetch full chat details.
   * Why async? 
   * - Chat data might not be cached locally
   * - May require server query to get participant list, settings, etc.
   * 
   * @returns {Chat} Chat object with group info, participants, settings
   */
  const chat = await msg.getChat();
  
  /**
   * Determine chat type
   * 
   * isGroup distinguishes between:
   * - Individual (1-on-1): chat.isGroup = false
   * - Group chat: chat.isGroup = true
   * 
   * This affects what metadata is available:
   * - Groups have: participants[], admins, group name, creation date
   * - Individual chats have: just two participants (you + contact)
   */
  const isGroup = chat.isGroup;
  
  // ───────────────────────────────────────────────────────────────────────
  // Display message type classification
  // ───────────────────────────────────────────────────────────────────────
  
  // Terminal: Simple
  console.log(`\n📍 Type: ${isGroup ? 'GROUP' : 'INDIVIDUAL'} | From: ${msg.from.split('@')[0]}`);
  
  // Buffer: Detailed
  log('');
  log('📍 MESSAGE TYPE:');
  log('─'.repeat(80));
  
  if (isGroup) {
    /**
     * GROUP MESSAGE
     * 
     * Group metadata visible to all participants:
     * - Group name (set by admin)
     * - Group ID (permanent, doesn't change)
     * - Participant count (visible to all members)
     */
    log(`TYPE: GROUP MESSAGE`);
    log(`Group Name: ${chat.name}`);
    log(`Group ID: ${chat.id._serialized}`);
    log(`Participants: ${chat.participants.length} members`);
  } else {
    /**
     * INDIVIDUAL MESSAGE (1-on-1)
     * 
     * Only two participants: you and the contact
     * More private than groups (no third-party participants)
     */
    log(`TYPE: INDIVIDUAL MESSAGE (1-on-1 chat)`);
    
    /**
     * Get contact object
     * 
     * Fetches additional info about the sender/recipient:
     * - Display name (how they appear to you)
     * - Phone number
     * - Profile picture URL
     * - Whether they're in your contacts
     */
    const contact = await msg.getContact();
    
    /**
     * Special case: Messages to yourself
     * 
     * Useful for testing because:
     * - You control both sender and recipient
     * - Can verify metadata immediately
     * - No need to coordinate with another person
     * 
     * Detected by comparing: msg.from === msg.to
     */
    if (msg.fromMe && msg.to === msg.from) {
      log(`Special: Message to yourself (testing)`);
    }
  }
  
  log('─'.repeat(80));
  
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 1: METADATA VISIBLE TO META (WhatsApp Inc.)
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * This section logs all data that WhatsApp servers can see.
   * 
   * Important distinction:
   * - Message CONTENT (text, images) is E2E encrypted
   * - Message METADATA (who, when, type, size) is NOT encrypted
   * 
   * Why isn't metadata encrypted?
   * - Servers need it for routing (who to send to)
   * - Delivery confirmation requires acknowledgment
   * - Spam/abuse detection uses metadata patterns
   * - Business analytics (Meta's revenue model)
   */
  log('\n' + '█'.repeat(80));
  log('🔴 VISIBLE TO META (WhatsApp Inc.) - SERVER-SIDE METADATA');
  log('█'.repeat(80));
  log('⚠️  WhatsApp servers can see and log all of this information\n');
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Communication Patterns
  // ───────────────────────────────────────────────────────────────────────
  
  /**
   * Fetch complete message history
   * 
   * chat.fetchMessages() retrieves messages from server/local cache.
   * 
   * Parameters:
   * - limit: 99999 (attempt to get ALL messages)
   * - Actual limit depends on WhatsApp's server limits
   * - Older messages may not be available (server retention policy)
   * 
   * Why fetch history?
   * - Calculate communication frequency
   * - Demonstrate that Meta has access to conversation patterns
   * - Show how much behavioral data is collected
   */
  log('Fetching message history...');
  const allMessages = await chat.fetchMessages({ limit: 99999 }).catch(() => []);
  const messageCount = allMessages.length;
  
  /**
   * Calculate average messages per day
   * 
   * Formula: total_messages / days_between_first_and_last
   * 
   * Why this matters:
   * - Shows conversation intensity
   * - Meta could use this for engagement metrics
   * - Could identify closest relationships (high frequency = close friend)
   */
  let avgPerDay = 'N/A';
  let avgPerDayNote = '';
  
  if (messageCount < 2) {
    avgPerDayNote = '(Need at least 2 messages to calculate)';
  } else if (allMessages.length > 1) {
    /**
     * Get oldest and newest messages
     * 
     * allMessages is sorted by timestamp (newest first)
     * - allMessages[0] = newest message
     * - allMessages[length-1] = oldest message
     */
    const oldestMsg = allMessages[allMessages.length - 1];
    const newestMsg = allMessages[0];
    
    /**
     * Calculate time span in days
     * 
     * timestamp is Unix time (seconds since Jan 1, 1970)
     * - Subtract: get seconds difference
     * - Divide by 86400: convert seconds to days (60*60*24 = 86400)
     */
    const daysDiff = (newestMsg.timestamp - oldestMsg.timestamp) / 86400;
    
    log(`  → Debug: oldest timestamp=${oldestMsg.timestamp}, newest=${newestMsg.timestamp}, days=${daysDiff.toFixed(2)}`);
    
    /**
     * Calculate average with 2 decimal places
     * 
     * .toFixed(2) rounds to 2 decimal places
     * Example: 3.456789 -> "3.46"
     */
    if (daysDiff > 0) {
      avgPerDay = (messageCount / daysDiff).toFixed(2);
    } else {
      avgPerDay = 'N/A';
      avgPerDayNote = '(All messages sent same day)';
    }
  }
  
  log('Communication Patterns:');
  
  /**
   * Phone numbers
   * 
   * msg.from and msg.to format examples: 
   * - "1234567890@c.us" (personal accounts)
   * - "1234567890@lid" (some newer accounts)
   * - "123456789-987654321@g.us" (group chats)
   * 
   * Format breakdown:
   * - Number before @: actual phone number
   * - @c.us or @lid: Personal account domains
   * - @g.us: Group chat domain
   * 
   * .split('@')[0]: extract just the phone number part
   * 
   * NOTE: Check saved JSON logs to verify actual format in your case
   * 
   * WHAT META HAS ACCESS TO:
   * Meta could track your entire social graph (who communicates with whom)
   */
  log(`  • Your phone number: ${msg.from.split('@')[0]}`);
  log(`  • Your phone ID format: ${msg.from}`);
  log(`  • Contact's phone number: ${msg.to.split('@')[0]}`);
  log(`  • Contact's phone ID format: ${msg.to}`);
  log(`  • Who you talk to: ${isGroup ? `Group "${chat.name}"` : `Individual ${msg.to.split('@')[0]}`}`);
  
  /**
   * Timestamps
   * 
   * msg.timestamp: Unix timestamp (seconds since epoch)
   * - new Date(timestamp * 1000): Convert to JavaScript Date
   * - * 1000: JavaScript uses milliseconds, Unix uses seconds
   * - .toISOString(): Format as ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
   * 
   * PRIVACY IMPLICATION:
   * Meta knows EXACTLY when you communicate (down to the second)
   * Can build behavioral profiles: sleep schedule, work hours, etc.
   */
  log(`  • When you talk: ${new Date(msg.timestamp * 1000).toISOString()}`);
  
  /**
   * Communication frequency
   * 
   * avgPerDay calculated above from fetched message history
   * Shows intensity of relationship
   * 
   * WHAT META COULD CALCULATE:
   * Meta could calculate communication frequency from message timestamps
   * - Track messages over time
   * - Identify relationship intensity
   * - Determine closest contacts
   */
  log(`  • How often you talk: ${avgPerDay} messages/day average ${avgPerDayNote}`);
  log(`  → Meta could calculate: Communication frequency patterns from timestamps`);
  
  /**
   * Total message volume
   * 
   * messageCount from fetched history
   * Shows depth of relationship over time
   * 
   * WHAT META HAS ACCESS TO:
   * Meta could track total message count per conversation
   * - Historical conversation depth
   * - New vs long-term relationships
   * - Conversation lifecycle
   */
  log(`  • Message volume: ${messageCount} total messages in this chat`);
  log(`  → Meta could track: Total message counts over time`);
  
  /**
   * Group-specific metadata
   * 
   * Only shown for group chats
   * Additional data points about group dynamics
   */
  if (isGroup) {
    /**
     * Group membership
     * 
     * Meta knows which groups you're in
     * Can build interest graphs (political groups, hobby groups, etc.)
     */
    log(`  • Group memberships: Member of "${chat.name}"`);
    
    /**
     * Group creation timestamp
     * 
     * chat.createdAt: Unix timestamp of group creation
     * Shows group age and your join timing
     * 
     * PRIVACY IMPLICATION:
     * Meta tracks group lifecycle events
     */
    log(`  • Group creation/deletion events: Group created ${chat.createdAt ? new Date(chat.createdAt * 1000).toISOString() : 'Unknown'}`);
    
    /**
     * Join/leave events
     * 
     * Not directly visible in message object
     * But Meta logs these server-side
     */
    log(`  • When you join/leave groups: (Meta logs all group changes)`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Device Information
  // ───────────────────────────────────────────────────────────────────────
  
  log('\nDevice Information:');
  
  try {
    /**
     * Get client info
     * 
     * client.info contains YOUR account information:
     * - wid: WhatsApp ID (phone number + internal ID)
     * - platform: Device type (web, android, ios)
     * - Other account metadata
     */
    const info = await client.info;
    
    /**
     * Get public IP address and geolocation
     * 
     * getPublicIP() calls ipapi.co to fetch:
     * - Public IP address
     * - City, region, country
     * - ISP/organization
     * - Timezone
     * - GPS coordinates (approximate)
     * 
     * PRIVACY IMPLICATION:
     * WhatsApp sees your IP on every connection
     * Can track your location even without explicit location sharing
     */
    const ipInfo = await getPublicIP();
    
    /**
     * Get contact for additional metadata
     * (Used later for profile picture)
     */
    const contact = await msg.getContact();
    
    /**
     * Device type
     * 
     * msg.deviceType shows what WhatsApp API reports as the primary device
     * Possible values:
     * - "android": Android phone
     * - "ios": iPhone  
     * - "web": WhatsApp Web (desktop browser)
     * 
     * IMPORTANT NOTES:
     * - This comes from the API's msg.deviceType property
     * - It represents the PRIMARY WhatsApp device (usually your phone)
     * - This is NOT the bridge's OS (bridge runs on: ${process.platform})
     * - If showing "android" for an iPhone, WhatsApp may be detecting linked device type
     * 
     * WHAT META RECEIVES:
     * - deviceType from message metadata
     * - Browser User-Agent from HTTP headers (shows actual browser/OS)
     * - These may differ (phone vs web client)
     */
    log(`  • Device type (from API): "${msg.deviceType || 'web'}"`);
    log(`  • Bridge platform (local): "${process.platform}"`);
    log(`  → Meta receives: deviceType from API + User-Agent from HTTP headers`);
    
    /**
     * User-Agent string
     * 
     * Browser identification string containing:
     * - OS version (e.g., "Windows NT 10.0")
     * - Browser version (e.g., "Chrome/120.0.0.0")
     * - Rendering engine (e.g., "AppleWebKit/537.36")
     * 
     * PRIVACY IMPLICATION:
     * Meta gets detailed device fingerprint
     * Can track you across sessions even without cookies
     */
    log(`  • Operating system (User-Agent): ${await getOSInfo()}`);
    
    /**
     * WhatsApp version
     * 
     * Retrieved from window.Debug.VERSION in the browser
     * Shows which version of WhatsApp Web you're running
     * 
     * Useful for:
     * - Meta to enforce updates
     * - Compatibility checking
     * - Security patch verification
     */
    log(`  • WhatsApp version: ${await getWhatsAppVersion()}`);
    
    /**
     * Device ID
     * 
     * info.wid._serialized: Unique identifier for your account
     * Format: "1234567890@c.us"
     * 
     * This is permanent and doesn't change
     * Links all your activity together
     */
    log(`  • Device ID: ${info.wid._serialized}`);
    
    /**
     * IP address
     * 
     * HOW META GETS THIS:
     * - Every HTTP/WebSocket connection includes source IP in packet headers
     * - Server automatically logs connecting IP address
     * - No special code needed - built into TCP/IP protocol
     * 
     * Note: We're using ipapi.co API for demonstration
     * Meta gets your IP directly from the connection, not from an API
     * 
     * WHAT META COULD DO WITH IT:
     * - Derive approximate location (city-level)
     * - Detect VPN usage
     * - Track when you switch networks (WiFi -> cellular)
     */
    log(`  • Your IP address (We're using ipapi.co API for demonstration): ${ipInfo.ip}`);
    log(`  → Meta receives: IP from every HTTP/WebSocket request (automatic, built into TCP/IP protocol)`);
    
    /**
     * Geographic location
     * 
     * HOW META GETS THIS:
     * - Look up IP address in geolocation database (MaxMind, IP2Location, etc.)
     * - These databases map IP ranges to physical locations
     * - Accuracy: typically city-level, sometimes neighborhood
     * 
     * Note: We're using ipapi.co for demonstration
     * Meta would use their own geolocation database
     * 
     * WHAT META COULD DO WITH IT:
     * - Track where you are when you message
     * - Build travel pattern profiles
     * - Identify home/work locations (frequent IPs)
     */
    log(`  • Your location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
    log(`  → Meta could calculate: Geolocation from IP address using GeoIP databases`);
    
    /**
     * ISP/Network operator
     * 
     * HOW META GETS THIS:
     * - IP WHOIS lookup (public information)
     * - Organization that owns the IP block
     * - Examples: "Comcast", "AT&T", "Verizon", "Starbucks WiFi"
     * 
     * Note: We're using ipapi.co for demonstration
     * Meta could do reverse DNS lookup or WHOIS query
     * 
     * WHAT META COULD LEARN:
     * - Which network you're on (home ISP vs mobile vs WiFi)
     * - Corporate WiFi could reveal employer
     * - Public WiFi reveals venue (coffee shop, airport, etc.)
     */
    log(`  • ISP/Network: ${ipInfo.org || 'Unknown'}`);
    log(`  → Meta could determine: ISP/organization from IP WHOIS lookup`);
    
     /**
     * Language settings
     * 
     * HOW META GETS THIS:
     * - HTTP "Accept-Language" header sent with every request
     * - Example: "Accept-Language: en-US,en;q=0.9,es;q=0.8"
     * - Browser automatically sends preferred languages
     * 
     * What we're showing here:
     * - Using Intl.DateTimeFormat() for demonstration
     * - This is the browser's/system's locale setting
     * - Meta would get this from HTTP headers automatically
     * 
     * WHAT META COULD LEARN:
     * - User's language/culture preferences
     * - Could use for targeted content/ads
     * - Combined with other data, helps fingerprint users
     */
    log(`  • Language (from browser): ${Intl.DateTimeFormat().resolvedOptions().locale}`);
    log(`  → Meta receives: "Accept-Language" HTTP header with every request`);
    
    /**
     * Timezone
     * 
     * HOW META GETS THIS:
     * - JavaScript Date object includes timezone offset
     * - Example: new Date().getTimezoneOffset() = -480 (for UTC+8)
     * - WhatsApp Web sends timestamps that include timezone info
     * - Can also be inferred from message timestamps vs server time
     * 
     * What we're showing here:
     * - Using Intl.DateTimeFormat() for demonstration
     * - This is the system/browser timezone setting
     * - Examples: "America/Los_Angeles", "Europe/London"
     * 
     * WHAT META COULD LEARN:
     * - Another location indicator (narrows down where you are)
     * - Combined with IP, gives more precise location
     * - Reveals when user travels (timezone changes)
     * - Can identify work hours, sleep patterns
     */
    log(`  • Time zone (from browser for demonstration): ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    log(`  → Meta could determine: Timezone from JavaScript Date objects or timestamp analysis`);
    
  } catch (err) {
    /**
     * Error handling
     * 
     * If device info can't be fetched, show graceful fallback
     * Errors can occur if:
     * - Network timeout
     * - API rate limiting
     * - Permission denied
     */
    log(`  • Device type: ${msg.deviceType || 'Unknown'}`);
    log(`  • Error fetching details: ${err.message}`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Account Activity
  // ───────────────────────────────────────────────────────────────────────
  
  log('\nAccount Activity:');
  
  try {
    /**
     * Get contact object (again, if not already fetched)
     */
    const contact = await msg.getContact();
    
    /**
     * Profile picture URL
     * 
     * contact.getProfilePicUrl() fetches the CDN URL for profile photo
     * Format: https://pps.whatsapp.net/v/...
     * 
     * Returns null if:
     * - User has no profile picture
     * - Privacy settings hide it from you
     * 
     * PRIVACY IMPLICATION:
     * Meta hosts all profile pictures on their CDN
     * Can track profile picture changes
     * Picture metadata reveals upload time, device, etc.
     */
    const profilePicUrl = await contact.getProfilePicUrl().catch(() => null);
    
    /**
     * Last seen timestamp
     * 
     * Shows when this message was sent
     * Doubles as "last active" indicator
     */
    log(`  • Last seen timestamp: ${new Date(msg.timestamp * 1000).toISOString()}`);
    
    /**
     * Online/offline status
     * 
     * HOW META TRACKS THIS:
     * - WebSocket connection = you're online
     * - When you open WhatsApp (web/mobile), client connects to server
     * - Server logs: connection timestamp, disconnection timestamp
     * - "Last seen" feature proves Meta tracks this
     * 
     * Not in message object, but Meta tracks server-side:
     * - Connection events (when you come online)
     * - Disconnection events (when you go offline)
     * - Duration of each session
     * - Online patterns (most active hours)
     * 
     * PROOF: 
     * - WhatsApp shows "online" indicator to other users
     * - This data must be stored somewhere = Meta has access
     * - "Last seen" feature shows Meta logs connection timestamps
     */
    log(`  • Online/offline status: Online (sending message now)`);
    log(`  → Meta tracks: Connection/disconnection events server-side (proven by existing "Last Seen" feature)`);
    
    /**
     * Profile picture URL
     * 
     * Shows actual CDN URL if available
     * "Hidden/Not available" if privacy settings restrict it
     */
    log(`  • Profile picture URL: ${profilePicUrl || 'Hidden/Not available'}`);
    
    /**
     * Profile picture visibility
     * 
     * Explains whether Meta could see the profile picture
     * ✅ Visible: Hosted on Meta's servers
     * 🔒 Hidden: User's privacy settings prevent access
     */
    log(`  • Profile picture: ${profilePicUrl ? '✅ Visible to Meta' : '🔒 Hidden by privacy settings'}`);
    
    /**
     * Status updates (WhatsApp Stories feature)
     * 
     * HOW WE KNOW META TRACKS THIS:
     * - Status feature shows "view count" and "viewed by" list
     * - This data must be stored on Meta's servers to sync across devices
     * - When you view someone's status, they're notified = server tracks it
     * - Meta confirms in privacy policy that Status interactions are logged
     * 
     * WHAT META COULD TRACK:
     * - Who posts status updates (with timestamps)
     * - Who views them (viewer list with timestamps)
     * - View duration (how long you watched)
     * - Status content (images/videos/text - stored temporarily)
     * 
     * Note: Not in message API, but provable through Status feature behavior
     */
    log(`  • Status updates: Not in message object, but Meta tracks (proven by existing "viewed by" feature)`);
    log(`  → Meta tracks: Status posts, views, and timestamps (visible in Status interface)`);
    
    /**
     * Account creation date
     * 
     * CLARIFICATION: 
     * - We cannot prove Meta exposes this from the API
     * - Account age is stored SOMEWHERE (needed for spam detection, compliance)
     * - But not exposed in message object or contact info
     * 
     * Removed from direct claims - cannot verify from API responses
     */
    // log(`  • Account creation date: Cannot verify from API`);
    
    /**
     * Linked devices
     * 
     * HOW WE KNOW META TRACKS THIS:
     * - WhatsApp Settings shows "Linked Devices" list
     * - You can see device names, types, and "Last active" time
     * - This proves Meta tracks all linked devices server-side
     * - WhatsApp allows up to 5 companion devices
     * 
     * WHAT META COULD TRACK (proven by UI):
     * - Number of linked devices
     * - Device types (WhatsApp Web, Desktop, Portal)
     * - Link timestamps (when device was linked)
     * - Last active time per device
     * - Device names/browsers
     * 
     * Note: Not in message API, but provable through "Linked Devices" feature
     */
    log(`  • Linked devices: Not in message object, but Meta tracks (proven by "Linked Devices" UI)`);
    log(`  → Meta could track: Device list, types, and last active times (visible in Settings)`);
    
  } catch (err) {
    /**
     * Error handling for account activity
     */
    log(`  • Last seen timestamp: ${new Date(msg.timestamp * 1000).toISOString()}`);
    log(`  • Error fetching account details: ${err.message}`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Message Metadata (NOT content)
  // ───────────────────────────────────────────────────────────────────────
  
  log('\nMessage Metadata (NOT content):');
  
  /**
   * Message ID
   * 
   * Unique identifier for this specific message
   * Format: "true_1234567890@c.us_3EB0C8F4E2D5A1B6C3D4E5F6"
   * 
   * Components:
   * - true/false: whether you sent it (true) or received (false)
   * - Phone@c.us: participant ID
   * - Random string: unique message identifier
   * 
   * PRIVACY IMPLICATION:
   * Every message is tracked with permanent ID
   * Used for delivery confirmation, deletion tracking, etc.
   */
  log(`  • Message ID: ${msg.id._serialized}`);
  
  /**
   * Timestamp (sent)
   * 
   * When the message was created
   * Precision: 1 second
   * 
   * PRIVACY IMPLICATION:
   * Meta knows exact timing of all communications
   */
  log(`  • Timestamp (sent): ${new Date(msg.timestamp * 1000).toISOString()}`);
  
  /**
   * Delivery confirmation
   * 
   * msg.ack (acknowledgment) values:
   * - 0: Message sent from your device
   * - 1: Message delivered to server
   * - 2: Message delivered to recipient's device
   * - 3: Message read by recipient
   * - 4: Message played (for voice/video)
   * 
   * PRIVACY IMPLICATION:
   * Meta tracks delivery pipeline
   * Knows when recipient reads your message
   */
  log(`  • Timestamp (delivered): ${msg.ack >= 2 ? 'Yes' : 'Pending'}`);
  log(`  • Timestamp (read): ${msg.ack >= 3 ? 'Yes' : 'Not yet'}`);
  log(`  • Delivery status: ${getAckStatus(msg.ack)}`);
  
  /**
   * Forward count
   * 
   * msg.isForwarded: boolean (was this message forwarded?)
   * msg.forwardingScore: number of times forwarded
   * 
   * PRIVACY IMPLICATION:
   * Meta tracks viral content
   * Used to identify misinformation/spam
   * Limits forwarding to 5 chats at once
   */
  log(`  • Forward count: ${msg.isForwarded ? `Forwarded ${msg.forwardingScore || 1}x` : 'Not forwarded'}`);
  
  /**
   * Reply chains
   * 
   * msg.hasQuotedMsg: whether this is a reply
   * Tracks conversation threading
   * 
   * PRIVACY IMPLICATION:
   * Meta knows conversation structure
   * Can analyze engagement patterns
   * Identifies which messages drive responses
   */
  log(`  • Reply chains: ${msg.hasQuotedMsg ? 'Reply to message ' + (await msg.getQuotedMessage().catch(() => ({id: {_serialized: 'unknown'}}))).id._serialized : 'Original message'}`);
  
  /**
   * Media type
   * 
   * msg.type values:
   * - "chat": Plain text
   * - "image": Photo
   * - "video": Video file
   * - "audio": Audio file
   * - "ptt": Push-to-talk (voice message)
   * - "document": PDF, DOC, etc.
   * - "sticker": Sticker image
   * - "location": GPS coordinates
   * - "vcard": Contact card
   * 
   * PRIVACY IMPLICATION:
   * Meta knows you sent media (but not content)
   * Used for storage billing, compression, etc.
   */
  log(`  • Media type: ${msg.type} ${msg.hasMedia ? '(has media attachment)' : '(text only)'}`);
  
  /**
   * File size
   * 
   * Only available if msg.hasMedia is true
   * 
   * downloadMedia() retrieves the media:
   * - Returns base64-encoded data
   * - media.data.length = base64 string length
   * - * 0.75 = approximate bytes (base64 is 33% overhead)
   * - / 1024 = convert bytes to kilobytes
   * 
   * PRIVACY IMPLICATION:
   * Meta knows file sizes (storage tracking)
   * Large files flagged for compression
   * File size can reveal content type (large = video, small = photo)
   */
  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      log(`  • File size: ~${Math.round(media.data.length * 0.75 / 1024)} KB (approximate)`);
    } catch {
      log(`  • File size: (Unable to determine)`);
    }
  }
  
  /**
   * Link URLs
   * 
   * msg.links: Array of detected URLs in message
   * Extracted from message text automatically
   * 
   * IMPORTANT: Links are NOT end-to-end encrypted!
   * 
   * PRIVACY IMPLICATION:
   * Meta sees ALL URLs you share
   * Used for:
   * - Malware/phishing detection
   * - Link preview generation
   * - Tracking content sharing patterns
   * - Building interest profiles
   */
  if (msg.links && msg.links.length > 0) {
    log(`  • Link URLs: ${msg.links.map(l => l.link).join(', ')}`);
  } else {
    log(`  • Link URLs: None`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Call Metadata
  // ───────────────────────────────────────────────────────────────────────
  
  /**
   * Call metadata
   * 
   * HOW TO DETECT CALLS:
   * - msg.type === 'call_log' for call records
   * - msg.body contains call event description
   * - Not present in regular text messages
   * 
   * WhatsApp tracks voice and video calls
   * Call AUDIO/VIDEO is E2E encrypted
   * But call METADATA is not
   * 
   * Meta could log:
   * - Caller and recipient IDs
   * - Call start and end timestamps
   * - Call duration
   * - Call type (voice vs video)
   * - Missed/declined/canceled calls
   * 
   * WHAT META COULD LEARN:
   * - Who you call and how often
   * - Call duration patterns
   * - Voice vs video preference
   * - Missed call patterns
   * 
   * Note: Call AUDIO is E2E encrypted, but METADATA is not
   */
  log('\nCall Metadata (when calls are made):');
  
  if (msg.type === 'call_log') {
    /**
     * CALL DETECTED!
     * 
     * Extract call metadata from message object
     */
    log(`  • ✅ CALL DETECTED!`);
    log(`  • Call type: ${msg.type}`);
    log(`  • Call description: ${msg.body}`);
    log(`  • Timestamp: ${new Date(msg.timestamp * 1000).toISOString()}`);
    log(`  • From: ${msg.from}`);
    log(`  • To: ${msg.to}`);
    if (msg.duration) {
      log(`  • Duration: ${msg.duration} seconds`);
    }
    log(`  `);
    log(`  → Meta could log all of this: caller, callee, timestamp, duration, type`);
  } else {
    /**
     * No call in this message
     * 
     * Explaining what WOULD be tracked if it were a call
     */
    log(`  • Note: This message is type "${msg.type}", not a call_log`);
    log(`  • To test: Make a voice/video call and check if it appears as call_log`);
    log(`  • Meta could log: caller ID, timestamp, duration, type (voice/video)`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Location Data
  // ───────────────────────────────────────────────────────────────────────
  
  /**
   * Shared location
   * 
   * msg.type === 'location': User explicitly shared location
   * msg.location: Object with coordinates
   * 
   * CRITICAL PRIVACY ISSUE:
   * Shared locations are NOT end-to-end encrypted!
   * They are metadata, visible to WhatsApp servers
   * 
   * Why?
   * - Location needs to be processed for maps
   * - Link preview generation requires server access
   * - Reverse geocoding (address lookup) done server-side
   */
  log('\nLocation Data (if shared):');
  
  if (msg.type === 'location') {
    /**
     * GPS coordinates
     * 
     * msg.location.latitude: Latitude (North/South)
     * msg.location.longitude: Longitude (East/West)
     * 
     * Precision: typically 5-6 decimal places
     * Accuracy: ~1 meter
     * 
     * MAJOR PRIVACY IMPLICATION:
     * Meta knows EXACT location you shared
     * Can build movement history
     * Identify home/work addresses
     * Track travel patterns
     */
    log(`  • GPS coordinates: ${msg.location.latitude}, ${msg.location.longitude} ⚠️ NOT E2E ENCRYPTED`);
    
    /**
     * Location timestamp
     * 
     * When the location was shared
     * Combined with coordinates, tracks movement
     */
    log(`  • Location timestamps: ${new Date(msg.timestamp * 1000).toISOString()}`);
    
    /**
     * Live location tracking
     * 
     * WhatsApp supports "Live Location" feature
     * Continuously updates your position for duration (15min, 1hr, 8hr)
     * 
     * msg.location.description indicates if live tracking enabled
     */
    log(`  • Live location tracking: ${msg.location.description ? 'Enabled' : 'Disabled'}`);
    
    /**
     * Movement patterns
     * 
     * Over time, Meta could build:
     * - Home address (frequent nighttime location)
     * - Work address (frequent daytime location)
     * - Commute routes
     * - Travel history
     * - Favorite places (restaurants, gyms, etc.)
     */
    log(`  • Movement patterns and places you frequent: (Meta builds location history)`);
    log(`  `);
    log(`  ⚠️ IMPORTANT: Shared locations are METADATA, not message content!`);
    log(`     WhatsApp can see exact coordinates you share.`);
  } else {
    /**
     * No location in this message
     * 
     * But note: IP address already reveals approximate location
     */
    log(`  • GPS coordinates: Not shared in this message`);
    log(`  • Location timestamps: N/A`);
    log(`  • Live location tracking: N/A`);
    log(`  • Movement patterns: (Meta tracks when you DO share location)`);
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Group-Specific Metadata
  // ───────────────────────────────────────────────────────────────────────
  
  /**
   * Additional metadata for group chats
   * 
   * Groups expose more metadata than individual chats:
   * - Participant list (social graph)
   * - Admin status (power dynamics)
   * - Message author (who said what in group)
   * - Mentions (attention patterns)
   */
  if (isGroup) {
    log('\nGroup-Specific Metadata:');
    
    /**
     * Group ID
     * 
     * Permanent identifier for this group
     * Format: "123456789-987654321@g.us"
     * 
     * @g.us = group chat domain
     */
    log(`  • Group ID: ${chat.id._serialized}`);
    
    /**
     * Group name
     * 
     * Set by admin, can change over time
     * Meta tracks name history
     */
    log(`  • Group Name: ${chat.name}`);
    
    /**
     * Participant count
     * 
     * Number of members in group
     * Meta tracks join/leave events
     * 
     * PRIVACY IMPLICATION:
     * Reveals size of social circle
     * Large groups = public/community
     * Small groups = close friends/family
     */
    log(`  • Group Members: ${chat.participants.length} participants`);
    
    /**
     * Admin count
     * 
     * chat.participants.filter(p => p.isAdmin)
     * - Filters participant array
     * - Keeps only admins
     * - Counts result
     * 
     * PRIVACY IMPLICATION:
     * Reveals power structure
     * Multiple admins = democratic
     * Single admin = hierarchical
     */
    log(`  • Group Admin: ${chat.participants.filter(p => p.isAdmin).length} admin(s)`);
    
    /**
     * Message author
     * 
     * In groups, msg.author shows who sent the message
     * Different from msg.from (which is the group ID)
     * 
     * PRIVACY IMPLICATION:
     * Meta knows who says what in groups
     * Can analyze:
     * - Most active members
     * - Influence patterns
     * - Conversation dynamics
     */
    log(`  • Message Author: ${msg.author || msg.from}`);
    
    /**
     * Mentions
     * 
     * msg.mentionedIds: Array of @mentioned users
     * Format: ["1234567890@c.us", "9876543210@c.us"]
     * 
     * PRIVACY IMPLICATION:
     * Meta knows social connections within groups
     * Frequent mentions = close relationship
     * Mention patterns reveal subgroups/cliques
     */
    if (msg.mentionedIds && msg.mentionedIds.length > 0) {
      log(`  • Mentions: ${msg.mentionedIds.length} user(s) mentioned`);
      msg.mentionedIds.forEach((id, idx) => {
        log(`    [${idx + 1}] ${id}`);
      });
    } else {
      log(`  • Mentions: None`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 2: DATA NOT VISIBLE TO META (End-to-End Encrypted)
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * This section shows data protected by E2E encryption
   * 
   * E2EE (End-to-End Encryption) means:
   * - Message encrypted on sender's device
   * - Only recipient's device can decrypt
   * - WhatsApp servers see encrypted blob (gibberish)
   * - Even Meta/law enforcement can't read it
   * 
   * WhatsApp uses Signal Protocol for E2EE
   * 
   * IMPORTANT:
   * - Message CONTENT is encrypted
   * - Message METADATA is not encrypted (shown in Section 1)
   */
  log('\n' + '█'.repeat(80));
  log('🟢 NOT VISIBLE TO META - END-TO-END ENCRYPTED');
  log('█'.repeat(80));
  log('✅ WhatsApp servers CANNOT see this (only sender and recipient)\n');
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Message Content
  // ───────────────────────────────────────────────────────────────────────
  
  log('Message Content:');
  
  /**
   * Message text (body)
   * 
   * msg.body: The actual text of the message
   * 
   * WHY WE CAN SEE IT:
   * - We're running as the recipient (you)
   * - Our client has the decryption key
   * - Message was decrypted locally on your device
   * 
   * WHY META CAN'T SEE IT:
   * - Servers only see encrypted ciphertext
   * - Decryption key never leaves your device
   * - Signal Protocol prevents server decryption
   * 
   * Example encrypted payload Meta sees:
   * "A8f3kJ9sP2mX7qL..." (base64-encoded ciphertext)
   */
  log(`  • Message text: "${msg.body}"`);
  
  /**
   * Message length
   * 
   * WHAT WE SEE:
   * - msg.body.length = character count of DECRYPTED text (plaintext)
   * 
   * WHAT META SEES:
   * - Encrypted payload size in BYTES (KB), NOT character count
   * - Encryption adds padding, so bytes ≠ character count
   * - Example: "Hi" (2 chars) might be 256 bytes encrypted
   * - Estimated encrypted size: ~${Math.ceil(msg.body.length / 10) * 16} bytes
   * 
   * CLARIFICATION:
   * - "Size" = bytes (KB/MB) of encrypted data (what Meta sees)
   * - "Length" = number of characters in plaintext (what we see)
   * - Meta CANNOT determine exact character count from encrypted size
   * - Encryption padding prevents exact length inference
   */
  log(`  • Message length: ${msg.body.length} characters (plaintext, after decryption)`);
  log(`  • Estimated encrypted size: ~${Math.ceil(msg.body.length / 10) * 16} bytes (what Meta sees)`);
  log(`  → Meta sees: Encrypted payload size in BYTES (KB), NOT character count`);
  
  /**
   * Media content
   * 
   * Images, videos, documents are E2E encrypted
   * 
   * HOW IT WORKS:
   * 1. Media file encrypted on sender's device
   * 2. Encrypted file uploaded to WhatsApp CDN
   * 3. Encryption key sent in E2E encrypted message
   * 4. Recipient downloads encrypted file
   * 5. Recipient decrypts using key from message
   * 
   * WHAT META SEES:
   * - Encrypted file blob (gibberish)
   * - File size (for storage billing)
   * - Mime type (image/video/document)
   * - Upload/download timestamps
   * 
   * WHAT META CAN'T SEE:
   * - Actual image/video content
   * - Faces in photos
   * - Text in documents
   * - Audio in voice messages
   */
  if (msg.hasMedia) {
    try {
      /**
       * Download and decrypt media
       * 
       * msg.downloadMedia():
       * 1. Fetches encrypted file from CDN
       * 2. Gets decryption key from message
       * 3. Decrypts locally
       * 4. Returns decrypted data as base64
       * 
       * media.mimetype: File type (image/jpeg, video/mp4, etc.)
       * media.filename: Original filename (if preserved)
       * media.data: Base64-encoded decrypted content
       */
      const media = await msg.downloadMedia();
      log(`  • Media content: ${media.mimetype} file (encrypted)`);
      log(`  • Media filename: ${media.filename || 'unnamed'}`);
      log(`  • Actual image/video: (E2E encrypted - Meta cannot see)`);
    } catch {
      log(`  • Media content: Present but unable to download`);
    }
  }
  
  /**
   * Voice messages
   * 
   * msg.type === 'ptt': Push-to-talk voice message
   * msg.type === 'audio': Regular audio file
   * 
   * Both are E2E encrypted
   * Meta cannot transcribe or listen to them
   * 
   * PRIVACY WIN:
   * - Voice messages fully private
   * - No server-side speech recognition
   * - Can't be used for voice fingerprinting
   */
  if (msg.type === 'ptt' || msg.type === 'audio') {
    log(`  • Voice message audio: (E2E encrypted - Meta cannot hear)`);
  }
  
  /**
   * Quoted (replied) message content
   * 
   * When you reply to a message, the quoted text is also E2E encrypted
   * 
   * msg.getQuotedMessage() retrieves the original message object
   * - Has same structure as regular message
   * - Body is encrypted
   * - Metadata visible (timestamp, sender, etc.)
   */
  if (msg.hasQuotedMsg) {
    try {
      const quoted = await msg.getQuotedMessage();
      log(`  • Quoted message text: "${quoted.body}" (encrypted)`);
    } catch {
      log(`  • Quoted message text: (encrypted)`);
    }
  }
  
  // ───────────────────────────────────────────────────────────────────────
  // SUBSECTION: Local-Only Data
  // ───────────────────────────────────────────────────────────────────────
  
  /**
   * Data stored only on your device, never synced to servers
   * 
   * These are truly private - not even E2E encrypted messages carry them
   */
  log('\nLocal-Only Data:');
  
  try {
    const contact = await msg.getContact();
    
    /**
     * Contact name
     * 
     * How YOU named this person in your phone's contacts
     * 
     * contact.pushname: Name they set in WhatsApp
     * contact.name: Name you saved in phone contacts
     * 
     * PRIVACY WIN:
     * - Your nicknames for people are never synced
     * - Meta doesn't know how you label people
     * - Can't be used to identify relationships
     * 
     * Example:
     * - Their pushname: "John Smith"
     * - Your saved name: "John - College Roommate"
     * - Meta only sees "John Smith"
     */
    log(`  • Contact name (how YOU named them): ${contact.pushname || contact.name || 'Unknown'}`);
    
    /**
     * Phonebook status
     * 
     * contact.isMyContact: boolean
     * - true: In your phone's contacts
     * - false: Not saved (just phone number)
     * 
     * PRIVACY WIN:
     * - Meta doesn't get your full contact list
     * - Only knows numbers you message
     */
    log(`  • Contact saved in phonebook: ${contact.isMyContact ? 'Yes' : 'No'}`);
  } catch {
    log(`  • Contact name: (Stored locally only)`);
  }
  
  /**
   * Chat organization
   * 
   * Local-only features:
   * - Labels/tags you assign to chats
   * - Custom notes about conversations
   * 
   * Not synced between devices
   * Not backed up to cloud
   */
  log(`  • Chat labels/tags: (Your organization, not synced to Meta)`);
  log(`  • Chat notes: (Local only)`);
  
  /**
   * Starred messages
   * 
   * msg.isStarred: Whether you marked this message important
   * 
   * INTERESTING CASE:
   * - Starred status IS synced between your devices
   * - But synced via E2E encrypted channel
   * - Meta knows you starred SOMETHING (metadata)
   * - But doesn't know WHICH message (encrypted)
   */
  log(`  • Message stars: ${msg.isStarred ? 'Starred' : 'Not starred'} (synced via E2E)`);
  
  /**
   * Reactions (emoji)
   * 
   * msg.hasReaction: boolean
   * msg.getReactions(): Array of reaction objects
   * 
   * Reactions are E2E encrypted!
   * Meta knows someone reacted (metadata)
   * But doesn't know which emoji (encrypted)
   */
  if (msg.hasReaction) {
    try {
      const reactions = await msg.getReactions();
      log(`  • Reactions: ${reactions.map(r => r.text).join(', ')} (E2E encrypted)`);
    } catch {
      log(`  • Reactions: Present (E2E encrypted)`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 3: PRISTINE RAW DATA - COMPLETE OBJECT DUMP
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * This section dumps the COMPLETE raw data structure
   * 
   * Purpose:
   * - Prove claims with actual data
   * - Show exactly what the API exposes
   * - Enable independent verification
   * - Document the data structure
   * 
   * This is the "source code" of metadata collection
   */

    /**
   * Interpretation guide
   * 
   * Explains what the JSON dump means
   */
    log('\n\n💡 WHAT THE BELOW JSON SHOWS:');
    log('   ✅ COMPLETE message object (all properties)');
    log('   ✅ COMPLETE chat object (all properties)');
    log('   ✅ Internal _data structures (raw protocol data)');
    log('   ✅ This is what WhatsApp Web sends to the client');
    log('   ⚠️  Meta has access to ALL of this server-side');
    log('   🔴 "body" is E2E encrypted in transit, but visible at endpoints');
  /**
   * Helper function to serialize complex objects
   * 
   * JavaScript objects can contain:
   * - Circular references (object referring to itself)
   * - Functions (can't be serialized to JSON)
   * - Special types (Date, Buffer, etc.)
   * 
   * This function handles all edge cases:
   * 
   * @param {any} obj - Object to serialize
   * @param {number} depth - Current recursion depth
   * @param {number} maxDepth - Maximum depth to prevent infinite loops
   * @returns {any} Serializable version of object
   */
  function serializeComplete(obj, depth = 0, maxDepth = 5) {
    /**
     * Base case: Max depth reached
     * 
     * Prevents infinite recursion on circular references
     * Example: msg._client._messages includes msg again
     */
    if (depth > maxDepth) return '[Max depth reached]';
    
    /**
     * Handle null and undefined
     * 
     * These are valid JSON values, return as-is
     */
    if (obj === null || obj === undefined) return obj;
    
    /**
     * Handle primitive types
     * 
     * string, number, boolean are directly JSON-serializable
     */
    const type = typeof obj;
    if (type === 'string' || type === 'number' || type === 'boolean') return obj;
    
    /**
     * Handle functions
     * 
     * Functions can't be serialized to JSON
     * Replace with placeholder string
     */
    if (type === 'function') return '[Function]';
    
    /**
     * Handle Date objects
     * 
     * Convert to ISO 8601 string format
     * Example: "2024-11-09T14:30:45.123Z"
     */
    if (obj instanceof Date) return obj.toISOString();
    
    /**
     * Handle Buffer objects
     * 
     * Buffers contain binary data (images, files, etc.)
     * Too large to display, show size instead
     */
    if (obj instanceof Buffer) return `[Buffer ${obj.length} bytes]`;
    
    /**
     * Handle arrays
     * 
     * Recursively serialize each element
     * Limit to first 10 items to prevent huge output
     */
    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => serializeComplete(item, depth + 1, maxDepth));
    }
    
    /**
     * Handle objects
     * 
     * Strategy:
     * 1. Get all property names (including non-enumerable)
     * 2. Remove duplicates
     * 3. Serialize each property recursively
     */
    const result = {};
    
    /**
     * Get ALL property names
     * 
     * Object.keys() only gets enumerable properties
     * Object.getOwnPropertyNames() gets ALL properties (including hidden)
     * 
     * Combine both to ensure we don't miss anything
     */
    const allKeys = [
      ...Object.keys(obj),
      ...Object.getOwnPropertyNames(obj)
    ];
    
    /**
     * Remove duplicates
     * 
     * [...new Set(array)] is a trick to get unique values
     * Set automatically removes duplicates
     */
    const uniqueKeys = [...new Set(allKeys)];
    
    /**
     * Serialize each property
     */
    for (const key of uniqueKeys) {
      try {
        const value = obj[key];
        
        /**
         * Skip functions
         * 
         * Object methods aren't useful data, mark as [Function]
         */
        if (typeof value === 'function') {
          result[key] = '[Function]';
        }
        /**
         * Skip client references
         * 
         * _client and client properties create circular references
         * Would cause infinite recursion
         */
        else if (key === '_client' || key === 'client') {
          result[key] = '[Client Reference - Omitted]';
        }
        /**
         * Recursively serialize value
         * 
         * Increment depth to track recursion level
         */
        else {
          result[key] = serializeComplete(value, depth + 1, maxDepth);
        }
      } catch (err) {
        /**
         * Handle serialization errors
         * 
         * Some properties throw when accessed
         * Mark with error message instead of crashing
         */
        result[key] = `[Error: ${err.message}]`;
      }
    }
    
    return result;
  }
  
  /**
   * Dump MESSAGE object
   * 
   * This contains all message-specific data:
   * - Body, timestamp, sender, recipient
   * - Media info, links, mentions
   * - Delivery status, forward count
   * - Internal properties (_data, _links, etc.)
   */
  log('═══════════════════════════════════════════════════════════════');
  log('MESSAGE OBJECT (msg):');
  log('═══════════════════════════════════════════════════════════════\n');
  
  const pristineMsg = serializeComplete(msg);
  log(JSON.stringify(pristineMsg, null, 2));
  
  /**
   * Dump CHAT object
   * 
   * This contains all chat-specific data:
   * - Participant list (groups)
   * - Chat name, ID
   * - Settings (archived, pinned, muted)
   * - Unread count, last message timestamp
   */
  log('\n\n═══════════════════════════════════════════════════════════════');
  log('CHAT OBJECT (chat):');
  log('═══════════════════════════════════════════════════════════════\n');
  
  const pristineChat = serializeComplete(chat);
  log(JSON.stringify(pristineChat, null, 2));
  
  /**
   * Dump _data property
   * 
   * msg._data contains the RAW protocol data
   * This is what WhatsApp Web actually receives from servers
   * Closest to the "wire format"
   * 
   * If present, this is the most "pristine" data available
   */
  log('\n\n═══════════════════════════════════════════════════════════════');
  log('RAW DATA STRUCTURE (_data property if available):');
  log('═══════════════════════════════════════════════════════════════\n');
  
  if (msg._data) {
    log('Message._data:');
    log(JSON.stringify(serializeComplete(msg._data), null, 2));
  } else {
    log('No _data property found (might be hidden)');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: FILE SAVING
  // ═══════════════════════════════════════════════════════════════════════
  
  /**
   * Save JSON and log files for verification
   * 
   * WHY SAVE FILES?
   * - Provides evidence for all claims made
   * - Allows offline analysis  
   * - Enables independent verification
   * - Creates permanent audit trail
   * 
   * FOUR FILES SAVED:
   * 1. Message object - Complete API response (JSON)
   * 2. Chat object - Full chat data (JSON)
   * 3. Raw data - Internal _data property + notes (JSON)
   * 4. Terminal log - Complete analysis output (TXT)
   */
  log('\n\n💾 SAVING FILES FOR VERIFICATION...\n');
  log('\n\n💾 SAVING FILES FOR VERIFICATION...\n');
  
  const saveTimestamp = Date.now();
  
  try {
    /**
     * Generate unique filenames
     * 
     * Format: type_timestamp_identifier.json/txt
     * Example: message_1699564245_3EB0C8F4.json
     * 
     * This ensures:
     * - No collisions (timestamp unique)
     * - Easy sorting (by timestamp)
     * - Identifiable (message ID in name)
     */
    const msgFilename = `message_${saveTimestamp}_${msg.id.id.substring(0, 8)}.json`;
    const chatFilename = `chat_${saveTimestamp}_${chat.id._serialized.replace(/[@\.]/g, '_').substring(0, 20)}.json`;
    const rawFilename = `raw_${saveTimestamp}.json`;
    const terminalFilename = `terminal_${saveTimestamp}_${msg.id.id.substring(0, 8)}.txt`;
    
    /**
     * Save message object
     * 
     * Contains all message metadata visible to this client
     * This is what Meta's servers send to WhatsApp Web
     */
    const msgData = serializeComplete(msg);
    await fs.writeFile(
      path.join(MESSAGE_DIR, msgFilename),
      JSON.stringify(msgData, null, 2)
    );
    log(`✅ Message object: ${MESSAGE_DIR}/${msgFilename}`);
    
    /**
     * Save chat object
     * 
     * Contains chat settings, participants (for groups), etc.
     */
    const chatData = serializeComplete(chat);
    await fs.writeFile(
      path.join(CHAT_DIR, chatFilename),
      JSON.stringify(chatData, null, 2)
    );
    log(`✅ Chat object: ${CHAT_DIR}/${chatFilename}`);
    
    /**
     * Save raw _data structure
     * 
     * Internal protocol data + analysis notes
     * Most "pristine" data available
     */
    const rawData = {
      message_data: msg._data || null,
      chat_data: chat._data || null,
      timestamp: timestamp,
      analysis_notes: {
        message_type: msg.type,
        is_group: isGroup,
        has_media: msg.hasMedia,
        has_location: msg.type === 'location',
        device_type: msg.deviceType,
        from: msg.from,
        to: msg.to
      }
    };
    await fs.writeFile(
      path.join(RAW_DIR, rawFilename),
      JSON.stringify(rawData, null, 2)
    );
    log(`✅ Raw data: ${RAW_DIR}/${rawFilename}`);
    
    /**
     * Save terminal log (complete analysis output)
     * 
     * Contains the full detailed analysis as text
     * Easier to read than JSON files
     * Shows the complete reasoning and explanations
     */
    const terminalLog = logBuffer.join('\n');
    await fs.writeFile(
      path.join(TERMINAL_DIR, terminalFilename),
      terminalLog
    );
    log(`✅ Terminal log: ${TERMINAL_DIR}/${terminalFilename}`);
    log(`✅ Terminal log: ${TERMINAL_DIR}/${terminalFilename}`);
    
    log('\n💡 All files saved! Review them to verify any claims made in this analysis.');
    log('\n💡 All files saved! Review them to verify any claims made in this analysis.');
    log(`   📂 Open folder: ${LOGS_DIR}`);
    log(`   📂 Open folder: ${LOGS_DIR}`);
    
  } catch (err) {
    const errorMsg = `\n❌ Error saving files: ${err.message}`;
    log(errorMsg);
    log(errorMsg);
    log('Make sure metadata_logs/ directories exist and are writable');
    log('Make sure metadata_logs/ directories exist and are writable');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: FINAL SUMMARY (logged to file and console)
  // ═══════════════════════════════════════════════════════════════════════
  
  // Terminal: Show concise completion message
  console.log('\n' + '█'.repeat(80));
  console.log('✅ ANALYSIS COMPLETE');
  console.log('█'.repeat(80));
  console.log(`📂 Files saved to: ${LOGS_DIR}`);
  console.log(`   • Message JSON: message_${saveTimestamp}_*.json`);
  console.log(`   • Chat JSON: chat_${saveTimestamp}_*.json`);
  console.log(`   • Raw data JSON: raw_${saveTimestamp}.json`);
  console.log(`   • Terminal log: terminal_${saveTimestamp}_*.txt`);
  console.log('█'.repeat(80) + '\n');
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Decode ACK (acknowledgment) status codes
 * 
 * WhatsApp uses numeric codes for delivery status
 * This function translates them to human-readable strings
 * 
 * @param {number} ack - Acknowledgment code (0-4, or -1 for error)
 * @returns {string} Human-readable status
 */
function getAckStatus(ack) {
  const statuses = {
    '-1': 'ERROR',                        // Sending failed
    '0': 'PENDING',                       // Waiting to send
    '1': 'SENT (Single checkmark)',       // Sent to server
    '2': 'RECEIVED (Double checkmark)',   // Delivered to recipient
    '3': 'READ (Blue checkmark)',         // Recipient read it
    '4': 'PLAYED'                         // Voice/video played
  };
  return statuses[ack] || `Unknown (${ack})`;
}

/**
 * Get WhatsApp Web version
 * 
 * Queries the browser's JavaScript context for version info
 * window.Debug.VERSION is exposed by WhatsApp Web for debugging
 * 
 * @returns {Promise<string>} Version string (e.g., "2.2449.5")
 */
async function getWhatsAppVersion() {
  try {
    /**
     * client.pupPage: Puppeteer Page object
     * evaluate(): Runs JavaScript in browser context
     * window.Debug: WhatsApp's debug object
     * VERSION: Version string property
     */
    return await client.pupPage.evaluate(() => window.Debug?.VERSION || 'Unknown');
  } catch {
    return 'Unknown';
  }
}

/**
 * Get public IP address and geolocation
 * 
 * Uses ipapi.co free API to get:
 * - Public IP address
 * - Geographic location
 * - ISP/organization
 * - Timezone
 * 
 * This simulates what WhatsApp servers see when you connect
 * 
 * @returns {Promise<Object>} IP info object
 */
async function getPublicIP() {
  try {
    const https = require('https');
    
    /**
     * Make HTTPS request to ipapi.co
     * 
     * Why this API?
     * - Free (up to 1000 requests/day)
     * - No API key required
     * - Returns comprehensive geolocation data
     * - JSON response (easy to parse)
     */
    return new Promise((resolve) => {
      https.get('https://ipapi.co/json/', (res) => {
        let data = '';
        
        /**
         * Accumulate response data
         * 
         * HTTP responses come in chunks
         * Need to concatenate all chunks
         */
        res.on('data', (chunk) => data += chunk);
        
        /**
         * Parse complete response
         */
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            /**
             * Check for API errors (e.g., rate limiting)
             * 
             * ipapi.co returns error messages like:
             * {"error": true, "reason": "RateLimited"}
             */
            if (parsed.error) {
              console.log('     [IP API]:', `Rate limited or error: ${parsed.reason || 'unknown'}`);
              resolve({ 
                ip: 'Rate limited - Meta would see your real IP from HTTP request', 
                city: 'N/A (demonstration only)', 
                region: 'N/A (demonstration only)', 
                country: 'N/A (demonstration only)', 
                org: 'N/A (demonstration only)' 
              });
              return;
            }
            
            /**
             * Debug log: Show raw API response
             * 
             * Helps verify what data is actually returned
             */
            console.log('     [IP API Response]:', parsed);
            
            /**
             * Extract and normalize data
             * 
             * API might return slightly different field names
             * Normalize to consistent format
             */
            resolve({
              ip: parsed.ip || 'Unknown',
              city: parsed.city || 'Unknown',
              region: parsed.region || 'Unknown',
              country: parsed.country_name || parsed.country || 'Unknown',
              org: parsed.org || parsed.isp || 'Unknown',
              latitude: parsed.latitude || null,
              longitude: parsed.longitude || null,
              timezone: parsed.timezone || 'Unknown'
            });
          } catch (err) {
            /**
             * JSON parsing failed
             * 
             * Could happen if:
             * - API returned error HTML instead of JSON
             * - Network corruption
             * - API format changed
             * - Rate limit response not valid JSON
             */
            console.log('     [IP API Parse Error]:', err.message, '- First 100 chars:', data.substring(0, 100));
            resolve({ 
              ip: 'Parse error - Meta would see your real IP from HTTP request', 
              city: 'N/A (demonstration only)', 
              region: 'N/A (demonstration only)', 
              country: 'N/A (demonstration only)', 
              org: 'N/A (demonstration only)' 
            });
          }
        });
      }).on('error', (err) => {
        /**
         * Network request failed
         * 
         * Could happen if:
         * - No internet connection
         * - DNS resolution failed
         * - API is down
         */
        console.error('     [IP API Network Error]:', err.message);
        resolve({ ip: 'Unknown', city: 'Unknown', region: 'Unknown', country: 'Unknown', org: 'Unknown' });
      });
    });
  } catch (err) {
    /**
     * Unexpected error
     * 
     * Catch-all for any other errors
     */
    console.error('     [IP API General Error]:', err.message);
    return { ip: 'Unknown', city: 'Unknown', region: 'Unknown', country: 'Unknown', org: 'Unknown' };
  }
}

/**
 * Get operating system / user agent
 * 
 * Retrieves the browser's User-Agent string
 * Contains:
 * - OS name and version
 * - Browser name and version
 * - Rendering engine info
 * 
 * This is what WhatsApp servers see in HTTP headers
 * 
 * @returns {Promise<string>} User-Agent string
 */
async function getOSInfo() {
  try {
    /**
     * Query navigator.userAgent from browser
     * 
     * Example User-Agent:
     * "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) 
     *  AppleWebKit/537.36 (KHTML, like Gecko) 
     *  Chrome/120.0.0.0 Safari/537.36"
     */
    return await client.pupPage.evaluate(() => navigator.userAgent);
  } catch {
    return 'Unknown';
  }
}

// ============================================================================
// START CLIENT
// ============================================================================

/**
 * Initialize WhatsApp client
 * 
 * This starts the connection process:
 * 1. Launch Puppeteer browser
 * 2. Navigate to web.whatsapp.com
 * 3. Load saved session (or show QR code)
 * 4. Establish WebSocket connection
 * 5. Fire 'ready' event when connected
 */
client.initialize();

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================

/**
 * Guide user on how to test the script
 * 
 * Suggests different message types to demonstrate various metadata
 */
console.log('💡 TIP: Send yourself messages to test:\n');
console.log('📝 Try these:');
console.log('   • Regular text: "Hello world"');
console.log('   • With link: "Check out https://example.com"');
console.log('   • Reply to a message');
console.log('   • Share your location ⚠️  (you\'ll see Meta could see GPS!)');
console.log('   • Send an image');
console.log('   • Send in a group (if you\'re in one)\n');
