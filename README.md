# 📦 PackHub

A modern, self-hostable modpack manager inspired by **packwiz**, featuring simultaneous **Modrinth** and **CurseForge** mod discovery, automatic dependency resolution, an update checker, a web dashboard, a CLI, and direct integration with **Prism Launcher**.

---

## 🌟 Key Features

1. **100% Self-Hostable**:
   - Run locally on your machine or deploy via Docker / Docker Compose on your home server, NAS, or VPS.
   - Built-in HTTP server hosts your modpack index and metadata directly for automatic in-game syncing.
   - Zero complex database dependencies: packs are saved in standard human-readable, Git-friendly TOML files.

2. **Dual-Platform Mod Search & Updates (Modrinth + CurseForge)**:
   - Search across **both Modrinth and CurseForge** in a unified dashboard or CLI.
   - Filter by Minecraft version, mod loader (Fabric, Forge, NeoForge, Quilt), and target side (client/server/both).
   - **Automatic Dependency Resolution**: Automatically detects and installs required dependencies (e.g. Fabric API, Architectury).
   - **Cross-Platform Update Checker**: Live-scans installed mods against both APIs to detect newer versions and lets you update individually or all at once.

3. **Flush 1-Click Auto-Push to Modrinth & CurseForge**:
   - Seamlessly publish releases to **both Modrinth (`.mrpack`) and CurseForge (`manifest.json`)** with a single click.
   - Set release titles, version numbers, changelogs, and release channels (Release/Beta/Alpha).
   - Save your API tokens once for zero-friction future releases.
   - Live status reporting with direct links to the published versions on both platforms.

4. **Prism Launcher Integration**:
   - **Option 1: Ready-to-Play Prism Instance (`.zip`)**: Download a pre-configured zip with `mmc-pack.json` and `instance.cfg`. In Prism Launcher: *Add Instance ➜ Import from zip*.
   - **Option 2: 1-Click Direct Deploy**: Drops the instance directly into your local Prism Launcher `instances/` folder. Open Prism Launcher and click Play!
   - **Option 3: Modrinth `.mrpack` Export**: Drag-and-drop directly into Prism Launcher for multi-threaded parallel downloads.
   - **Option 4: Live Auto-Syncing**: Prism instances can use the self-hosted PackHub pack URL to auto-update mods every time you launch the game.

5. **100% Packwiz TOML Compatible**:
   - Reads and writes standard `pack.toml`, `index.toml`, and `.pw.toml` files with SHA-256 / SHA-1 checksum validation.
   - Existing packwiz packs work out of the box.

---

## 🚀 Quick Start

### Method 1: Local (Windows / Mac / Linux)

Prerequisites: [Node.js](https://nodejs.org/) (v18+)

```bash
# Clone or navigate to the packhub folder
cd C:\Users\Andre\.gemini\antigravity\scratch\packhub

# Install dependencies (already pre-installed)
npm install

# Start the Web Dashboard and API server
npm start
# (Or on Windows, simply double click: start-server.bat)
```

Open your browser to:
👉 **`http://localhost:8080`**

---

### Method 2: Docker / Docker Compose (Self-Hosting on Server / VPS)

```bash
# Run with docker compose
docker compose up -d
```

The server will be available on port `8080` and stores all pack data in `./data`.

---

## 💻 CLI Usage

You can also use PackHub from the command line, just like packwiz:

```bash
# List all managed packs
node cli/packhub.js list

# Initialize a new pack
node cli/packhub.js init -n "BetterAdv" -m "1.21.1" -l fabric -a "Andre"

# Search for mods across Modrinth and CurseForge
node cli/packhub.js search "sodium" -m "1.21.1" -l fabric

# Add a mod from Modrinth (with auto-dependencies)
node cli/packhub.js add-modrinth sodium -p betteradv

# Add a mod from CurseForge (by mod ID or slug)
node cli/packhub.js add-curseforge appleskin -p betteradv

# Check for updates across both platforms
node cli/packhub.js update -p betteradv

# Apply all available updates
node cli/packhub.js update -p betteradv --apply

# Export as a Prism Launcher Instance zip
node cli/packhub.js export-prism -p betteradv -o mypack-prism.zip

# Or 1-click deploy directly into your local Prism Launcher instances folder!
node cli/packhub.js export-prism -p betteradv --deploy

# Export as Modrinth .mrpack
node cli/packhub.js export-mrpack -p betteradv -o mypack.mrpack

# Export as CurseForge modpack zip
node cli/packhub.js export-curseforge -p betteradv -o mypack-curseforge.zip

# Save your platform API tokens
node cli/packhub.js config-tokens --mr-token "mrp_..." --cf-token "your_token"

# Flush push release to BOTH Modrinth & CurseForge simultaneously!
node cli/packhub.js publish -p betteradv --all --mr-project my-modpack-slug --cf-project 123456 -v "v1.0.1" -c "Changelog text"
```

---

## 🎮 How to Run Packs into Prism Launcher

### Option A: 1-Click Import from Zip
1. In the PackHub Web UI, click **🚀 Prism Launcher** ➜ **Download Prism Instance (.zip)**.
2. Open **Prism Launcher**.
3. Click **Add Instance** (top left).
4. Select **Import from zip** on the left menu, select the downloaded `.zip` file, and click **OK**.
5. Launch and play!

### Option B: 1-Click Direct Deploy
1. In the PackHub Web UI, click **🚀 Prism Launcher** ➜ **1-Click Direct Deploy**.
2. Click **Deploy into Prism Launcher Folder**.
3. Open or refresh **Prism Launcher** — your pack is already there in the launcher grid!

### Option C: Modrinth `.mrpack`
1. Click **Download .mrpack**.
2. Drag and drop the `.mrpack` file straight onto your Prism Launcher window.
3. Prism will download all mods directly from official CDNs and set up the instance.

### Option D: Live Syncing (Pre-Launch Hook)
In your Prism Launcher instance settings:
- Go to **Edit Instance** ➜ **Custom Commands**.
- Enable **Custom Commands** and under **Pre-launch command**, paste:
  ```bash
  "$INST_JAVA" -jar packwiz-installer-bootstrap.jar http://<YOUR_SERVER_IP>:8080/api/packs/<pack_id>/pack.toml
  ```
Whenever you add or update mods in PackHub, Prism will automatically sync your game files before starting!

---

## ⚙️ Configuration (`.env`)

You can edit `.env` to configure:

```env
PORT=8080
HOST=0.0.0.0
DATA_DIR=./data

# Optional: Personal CurseForge API Key
CURSEFORGE_API_KEY=$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm

# User Agent
USER_AGENT=PackHub/1.0.0
```

---

## 📂 Project Structure

```
packhub/
├── client/              # Modern responsive Web UI
│   ├── index.html       # Single-page dashboard
│   ├── style.css        # Clean dark theme
│   └── app.js           # Reactive frontend controller
├── server/              # Express API & packwiz distribution server
│   ├── index.js         # Server entrypoint
│   ├── config.js        # Environment and Prism path detection
│   ├── services/
│   │   ├── modrinth.js      # Labrinth API v2 client
│   │   ├── curseforge.js    # CurseForge API client
│   │   ├── packwiz.js       # TOML parser/serializer & SHA indexer
│   │   ├── packManager.js   # Pack lifecycle & auto-dependency resolver
│   │   └── prismExporter.js # Prism instance & .mrpack generator
│   └── routes/          # REST endpoints
├── cli/                 # CLI tool (packhub.js)
├── data/                # Modpacks & storage (packs/<id>/...)
├── Dockerfile           # Docker container configuration
├── docker-compose.yml   # 1-click compose setup
└── start-server.bat     # Windows 1-click launcher
```
