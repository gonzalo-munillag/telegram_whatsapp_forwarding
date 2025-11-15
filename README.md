# Telegram ↔ WhatsApp Bridge

Bidirectional message forwarding between Telegram and WhatsApp running on your Raspberry Pi.

## Features

- 📨 **Telegram → WhatsApp**: Auto-forwards messages from Telegram friends
- 📱 **WhatsApp → Telegram**: Send with `tg:friend message` prefix
- 🏷️ **Friend Tagging**: Target specific friends or broadcast to all
- 🔄 **Case-insensitive**: `tg:` or `TG:` both work
- 🔒 **Private**: Runs locally, no third-party services
- 🐳 **Dockerized**: Auto-deployment with Watchtower

## How It Works

### Architecture Overview

```
┌─────────────────────┐
│  Your Friend        │
│  (Telegram)         │
└──────────┬──────────┘
           │ Sends message
           ▼
┌─────────────────────┐
│  Telegram Client    │
│  (Your Account)     │  ← Runs as "userbot" using your credentials
└──────────┬──────────┘
           │ Forwards via Node.js script
           ▼
┌─────────────────────┐
│  WhatsApp Client    │
│  (Your Account)     │  ← Simulates WhatsApp Web in your browser
└──────────┬──────────┘
           │ You see message
           ▼
      Your Phone/Computer
```

### Receive Messages (Telegram → WhatsApp)
1. Your friend sends you a message on Telegram
2. The bot detects it (using your Telegram account as a userbot)
3. Forwards the message to your WhatsApp with a prefix like "📨 TG | Friend: message"

**Technology Stack:**
- Node.js + Express
- **telegram (gramjs)**: MTProto client (userbot mode)
- **whatsapp-web.js**: WhatsApp Web client (Puppeteer-based)
- Docker + Watchtower for deployment

**Security Notes**:
- Only forwards from configured friend IDs
- Only processes WhatsApp messages from YOUR number
- All processing happens locally on your machine
- No external servers involved
- Sessions encrypted by Telegram/WhatsApp libraries
---

## Setup Instructions

### Step 1: Initialize Project

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```
   
   This installs:
   - `telegram` (gramjs): Telegram client library
   - `whatsapp-web.js`: WhatsApp Web client
   - `qrcode-terminal`: For WhatsApp QR code authentication
   - `dotenv`: Environment variable loader
   - `input`: Terminal input helper

2. **Configure environment variables**:
   - A `.env.example` file shows the template structure
   - Copy it to create your own `.env` file: `cp .env.example .env`
   - You'll fill in your credentials in the next steps

### Step 2: Get Telegram API Credentials

You'll need to:
1. Visit https://my.telegram.org/apps
2. Log in with your Telegram phone number
3. Create a new application with these details:
   - **App title**: Use simple alphanumeric with spaces, e.g., `Message Bridge` or `TG WA Forwarder`
   - **Short name**: `tgwabridge` or `msgbridge` (5-32 characters, alphanumeric only, no spaces/underscores)
   - **URL**: Leave empty (optional)
   - **Platform**: Select **Desktop** (since it runs on your computer/Pi)
   - **Description**: Leave empty or add brief description (optional)
4. Click "Create Application"
5. Copy the `api_id` and `api_hash` that appear after creation
6. Add them to your `.env` file:
   ```
   TELEGRAM_API_ID=12345678
   TELEGRAM_API_HASH=your_hash_here
   TELEGRAM_PHONE=+1234567890
   ```

**Why?** Telegram requires API credentials to use their client libraries. This is like registering your "app" with Telegram, even though you're the only user.

### Step 3: Test Telegram Connection ⏳

Now we'll test that your Telegram credentials work correctly.

1. **Run the test script**:
   ```bash
   node test-telegram.js
   ```

2. **What will happen**:
   - Script validates your `.env` configuration
   - Connects to Telegram servers
   - Asks for a **verification code** (check your Telegram app or SMS)
   - If you have 2FA enabled, asks for your password
   - Shows your account information
   - Saves the session for future use

**Session persistence:** You only need to authenticate once. The session file is reused on subsequent runs.

---

### Step 4: Get Friend's Telegram IDs

4. **What the script does** (technical details):
   - Uses **gramjs** (Telegram's MTProto library for JavaScript)
   - Creates a **StringSession** to store authentication
   - Performs **userbot authentication** (logs in as you, not as a bot)
   - Saves the session to `telegram-session.txt` file
   - Session persists, so you won't need to re-authenticate next time
   - This session file is used by all subsequent scripts


### Step 4: Get Your Friend's Telegram ID ⏳

Now we need to find your friend's numeric Telegram ID (not their @username).

1. **Run the ID discovery script**:
   ```bash
   node get-friend-id.js
   ```

**What happens:**
- Lists your recent Telegram chats
- Shows numeric ID for each contact
- You copy the IDs you need

**Add to `.env` the IDs and tags that you have found in the logs:**
```bash
# Single friend
FRIEND_TELEGRAM_IDS=123456789

# Multiple friends
FRIEND_TELEGRAM_IDS=123456789,987654321,555666777

# Optional: Add tags for easier messaging
FRIEND_TAGS=friend1:123456789,friend2:987654321
```

**Important:** Use the numeric ID, not the @username!

---

**What the script does** (technical details):
- Loads the saved session from `telegram-session.txt` (created in Step 3)
- Uses **getDialogs()** API call to fetch recent chats
- Distinguishes between Users, Groups, Channels, and Supergroups
- Displays entity ID which is the permanent identifier
- No re-authentication needed (uses saved session)

### Step 5: Test WhatsApp Connection ⏳

Now we'll set up and test WhatsApp Web authentication.

```bash
node test-whatsapp.js
```

2. **What will happen**:
   - Script starts a headless Chrome browser (Puppeteer)
   - Simulates WhatsApp Web (like opening web.whatsapp.com)
   - Displays a **QR code** in your terminal
   - You scan it with your phone
   - Session is saved to `.wwebjs_auth/` folder
   - Shows your account information

3. **How to scan the QR code**:
   - Open **WhatsApp** on your phone
   - Tap **Menu (⋮)** or **Settings**
   - Tap **"Linked Devices"**
   - Tap **"Link a Device"**
   - Point your camera at the QR code in the terminal
   - Wait for confirmation

---

### Wireshark Network Analysis: Showing what is E2E Encrypted 🔬

**Goal:** Capture WhatsApp Web traffic, decrypt TLS, and show which metadata is truly E2E encrypted vs server-visible.

**Method:** Packet capture → TLS decryption → Identify encrypted blobs (Signal Protocol) vs plaintext.

---

#### Step 1: Install Wireshark on Raspberry Pi

```bash
# Update and install
sudo apt update
sudo apt install wireshark -y
```

**During install:** When asked "Should non-superusers capture packets?" → **YES**

```bash
# Configure non-root capture
sudo usermod -a -G wireshark $USER
sudo setcap 'CAP_NET_RAW+eip CAP_NET_ADMIN+eip' /usr/bin/dumpcap

# Reboot for changes
sudo reboot
```

**Verify after reboot:**
```bash
wireshark --version
getcap /usr/bin/dumpcap  # Should show: cap_net_admin,cap_net_raw=eip
```

---

#### Step 2: Deploy Updated Docker Image with SSL Key Export

**On your Mac (development machine):**

```bash
# 1. Commit the Docker changes
git add Dockerfile docker-compose.yml .gitignore
git commit -m "Add Wireshark SSL key logging to Docker"
git push

# 2. Rebuild and push Docker image
docker build -t YOUR_DOCKERHUB_USERNAME/tgwabridge:latest .
docker push YOUR_DOCKERHUB_USERNAME/tgwabridge:latest
```

**On your Raspberry Pi:**

```bash
# 1. Navigate to your bridge directory
cd /var/www/tgwabridge

# 2. Create wireshark directory (will be mounted as volume)
mkdir -p wireshark

# 3. Pull updated Docker image
docker-compose pull

# 4. Recreate container with new image
docker-compose up -d

# 5. Verify SSL key file will be created
ls -la wireshark/
```

**Expected:** `wireshark/` directory exists (empty for now, will be populated when container runs)

---

#### Step 3: Start Packet Capture on Pi

**Install tshark (if not already installed from Step 1):**
```bash
sudo apt install tshark -y
```

**Start capturing Docker container traffic:**
```bash
# Navigate to bridge directory
cd /var/www/tgwabridge

# Start tshark (captures ALL Pi network traffic including Docker)
tshark -i any -w wireshark/whatsapp-capture.pcapng
```

**Expected output:**
```
Capturing on 'any'
    1
    2
    3
    ...
```

**Keep this running!** The packet counter will keep increasing.

---

#### Step 4: Trigger WhatsApp Activity & Verify SSL Keys

**While tshark is running, send WhatsApp messages to generate traffic.**

**In a NEW SSH session, check if SSL keys are being generated:**

```bash
# Check if sslkeys.log is being created
ls -la /var/www/tgwabridge/wireshark/

# View keys (should see CLIENT_RANDOM lines)
tail -f /var/www/tgwabridge/wireshark/sslkeys.log
```

**Expected:** Lines like `CLIENT_RANDOM a1b2c3... d4e5f6...`

**If file doesn't exist:** Container needs to be restarted after code change:
```bash
docker-compose restart
```

**After seeing SSL keys being logged, send more test messages, then stop capture:**

```bash
# In the tshark terminal, press Ctrl+C to stop
```

**Verify capture file size:**
```bash
ls -lh /var/www/tgwabridge/wireshark/whatsapp-capture.pcapng
```

**Expected:** File size > 1MB (should have captured traffic)

---

### Step 6 & 7: Run the Bidirectional Bridge 🌉

Now for the main event - the actual message forwarding bridge!

```bash
node index.js
```

You should see:
```
🎉 BRIDGE IS ACTIVE!
📨 Forwarding Configuration:
   Telegram → WhatsApp: Messages from 2 friend(s)
   WhatsApp → Telegram: Messages starting with "tg:"
```

**Usage examples:**

| Action | Command | Result |
|--------|---------|--------|
| Send to specific friend | `tg:friend1 Hello!` | Sends to friend1 only |
| Send to all | `tg:all Hey everyone` | Broadcasts to all |
| Send to all (alt) | `tg: Message` | Broadcasts to all |
| Receive from friend | (friend messages you on Telegram) | You see on WhatsApp: `📨 TG \| Friend: message` |

**Notes:**
- Message yourself on WhatsApp (not your friends!)
- Keep the bridge running in the terminal
- Messages from configured friends auto-forward to WhatsApp

---

### Step 8: Test Both Directions

**Test Telegram → WhatsApp:**
1. Ask friend to message you on Telegram (or use "Saved Messages")
2. Check WhatsApp for forwarded message
3. Verify format: `📨 TG | Friend (tag): message`

**Test WhatsApp → Telegram:**
1. Message yourself on WhatsApp: `tg:friend1 Test message`
2. Check friend receives it on Telegram
3. You should get confirmation: `✅ Sent to friend1 on Telegram`

---

### Step 9 & 10: Docker Deployment

**Why Docker + Watchtower?**
- Build once, deploy everywhere
- Automatic updates from Docker Hub
- No manual file transfers
- Auto-restart on crashes

6. **What the bridge does** (technical details):
   - **Telegram Listener**: Uses `NewMessage` event handler to detect incoming messages
   - **WhatsApp Listener**: Uses `message` event to detect outgoing messages from you
   - **Friend Filtering**: Only forwards messages from specified friend IDs
   - **Prefix Detection**: Case-insensitive (`tg:` or `TG:` both work!)
   - **Tag Parsing**: Extracts tags like `tg:john` to route to specific friend
   - **Multiple Friends**: Supports broadcasting to all or targeting individuals
   - **Session Reuse**: No re-authentication needed (uses saved sessions)
   - **Error Handling**: Catches and logs errors without crashing
   - **Graceful Shutdown**: Properly disconnects on Ctrl+C

---

### Step 11: Test Docker Locally

**Prerequisites:** Docker Desktop for Mac

```bash
# Build (first time only)
docker-compose build

# Run
docker-compose up

1. **Test Telegram → WhatsApp**:
   - Ask your friend to send you a message on Telegram
   - Check your WhatsApp - you should receive it with "📨 TG | Friend:" prefix
   - Check terminal logs for confirmation
   Note: If your friend is not available, include your own ID into the allowlist in .env and test it yourself

# Run in background
docker-compose up -d
docker-compose logs -f
```

**Expected:** Same functionality as `node index.js` but containerized.

---

### Step 12: Deploy to Raspberry Pi

**Prerequisites on Pi:**
- Docker installed
- Watchtower running (for auto-updates)

#### 12.1: Initial Setup (One-Time)

**1. Set your Docker Hub username in `.env`:**
```bash
YOUR_DOCKERHUB_USERNAME=your_username
```

**2. Build and push:**
```bash
./deploy.sh
```

This builds for both ARM64 (Pi) and AMD64 (PC) and pushes to Docker Hub.

**3. Transfer config to Pi:**
```bash
scp .env telegram-session.txt docker-compose.yml pi@PI_IP:~/tg-wa-bridge/
```

**4. Start on Pi:**
```bash
ssh pi@PI_IP
cd ~/tg-wa-bridge
docker-compose pull
docker-compose up -d
```

**5. Verify:**
```bash
docker-compose logs -f
# Should see "BRIDGE IS ACTIVE!"
```

#### 12.2: Future Updates

Whenever you change code:
```bash
./deploy.sh
```

Watchtower auto-detects and deploys in 1-2 minutes. No SSH needed!

---

## Configuration

### .env File Structure

```bash
# Telegram
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash
TELEGRAM_PHONE=+1234567890

# Friends (comma-separated IDs, no spaces)
FRIEND_TELEGRAM_IDS=111111111,222222222,333333333

# Optional: Tags for easier targeting
FRIEND_TAGS=friend1:111111111,friend2:222222222

# WhatsApp (no + sign)
YOUR_WHATSAPP_NUMBER=1234567890

# Prefix (case-insensitive)
MESSAGE_PREFIX=tg:

# Docker (for deployment)
YOUR_DOCKERHUB_USERNAME=your_username
```

### Friend Tags Explained

**Without tags:** `tg:all Hello` or `tg: Hello`
**With tags:** `tg:friend1 Hello` (more intuitive)

Tags help you remember who's who without needing to memorize IDs.

---

## Docker Commands

```bash
# Local development
docker-compose build           # Build image
docker-compose up              # Run (foreground)
docker-compose up -d           # Run (background)
docker-compose logs -f         # View logs
docker-compose down            # Stop
docker-compose restart         # Restart

# On Pi
docker-compose pull            # Pull latest image
docker-compose up -d           # Start
docker stats telegram-whatsapp-bridge  # Monitor resources
```

---

## Troubleshooting

### Telegram Issues

| Problem | Solution |
|---------|----------|
| AUTH_KEY_UNREGISTERED | Re-run `node test-telegram.js` |
| Invalid phone | Include + and country code: `+1234567890` |
| Code doesn't arrive | Wait 1-2 min or request SMS |
| Session expired | Delete `telegram-session.txt`, re-authenticate |

### WhatsApp Issues

| Problem | Solution |
|---------|----------|
| QR doesn't appear | Wait 2-3 min for Chrome download |
| Session expired | Delete `.wwebjs_auth/`, re-scan QR |
| Not forwarding | Message YOURSELF, not your friend |
| Slow/laggy | Normal on Mac Docker (faster on Pi) |

### Docker Issues

| Problem | Solution |
|---------|----------|
| Build fails (Python error) | Fixed in current Dockerfile |
| package-lock.json error | Fixed in current .dockerignore |
| Permission denied | `chmod 666 telegram-session.txt` |
| Out of memory | Increase limit in docker-compose.yml |
| Can't push to Docker Hub | Set `YOUR_DOCKERHUB_USERNAME` in .env |

### General

- **Type mismatch (is friend? false):** Fixed in current version (BigInt conversion)
- **Messages not appearing:** Check both clients show "ready" status in logs
- **High latency:** Docker on Mac has overhead; Pi is faster

---

## Technical Details

### Userbot vs Bot

**Regular Bot:**
- Uses bot token from @BotFather
- Limited API access
- Shows as "Bot" in chat
- Can't read your private messages

**Userbot (this project):**
- Uses your personal account
- Full API access (can read all your chats)
- Appears as you
- Session-based authentication

### WhatsApp Web Client

`whatsapp-web.js` reverse-engineers the WhatsApp Web protocol:
1. Launches headless Chrome via Puppeteer
2. Opens web.whatsapp.com
3. You scan QR code once
4. Session persists in `.wwebjs_auth/`
5. Can send/receive messages programmatically

**Not official:** WhatsApp doesn't provide a public API. This library may break if WhatsApp changes their web client.

### Multi-Platform Docker Builds

```bash
docker buildx build --platform linux/arm64,linux/amd64 ...
```

Builds for:
- **linux/arm64**: Raspberry Pi (ARM architecture)
- **linux/amd64**: Regular PCs (x86 architecture)

Single image works on both!

---

## Security Considerations


**What to protect:**
- ⚠️ Never commit `.env` or session files to git
- ⚠️ Keep Docker image private if it contains secrets
- ⚠️ Sessions give full account access - protect them
- ⚠️ Friend IDs are permanent - verify before adding

---

## Limitations

- Text messages only (no media forwarding implemented)
- WhatsApp requires phone to stay online
- Unofficial WhatsApp API (could break on updates)
- One friend at a time for replies (no group broadcasts within Telegram)
- Sessions expire if not used for ~30 days

---

## Project Structure

```
telegram_whatsapp_forwarding/
├── index.js                   # Main bridge (515 lines)
├── test-telegram.js           # Telegram auth test
├── test-whatsapp.js           # WhatsApp auth test
├── test-whatsapp-metadata.js  # Metadata inspector (2,194 lines)
├── get-friend-id.js           # ID discovery tool
├── deploy.sh                  # Docker build/push script
├── Dockerfile                 # Container definition
├── docker-compose.yml         # Orchestration config
├── package.json               # Dependencies
├── .env                       # Your config (gitignored)
├── .env.example               # Config template
├── .gitignore                 # Excludes sensitive files
├── .dockerignore              # Optimizes Docker builds
├── README.md                  # This file
├── METADATA_PRIVACY.md        # Privacy analysis (1,054 lines)
├── blogpost.md                # Technical deep dive (gitignored)
└── metadata_logs/             # Inspector output (gitignored)
    ├── terminal_logs/         # Human-readable reports
    ├── message_objects/       # Raw message JSON
    ├── chat_objects/          # Chat metadata JSON
    └── raw_data_structures/   # Complete raw data
```

---

## License

MIT

## Credits

Built with [gramjs](https://github.com/gram-js/gramjs) and [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).
