# Future Development

- [ ] Implement user signup / subscription flow
- [ ] Add "forgot password" loop
- [ ] Integrate payment processing for subscriptions

---

## Desktop App (Mac) - IN PROGRESS

The Electron shell has been added for Mac desktop distribution with local LLM inference.

### Files Added:
- `electron/main.js` - Main Electron process with llama.cpp integration
- `electron/preload.js` - IPC bridge for renderer process
- `electron/entitlements.mac.plist` - Mac app entitlements for code signing
- `src/services/local-llm.js` - Local model management and inference

### Setup Commands:
```bash
# Install new dependencies (including Electron and node-llama-cpp)
npm install

# Run in development mode
npm run electron:dev

# Build Mac app (.dmg)
npm run electron:build
```

### Remaining Mac Tasks:
- [ ] Create app icon (1024x1024 PNG → .icns) at `public/icon.icns`
- [ ] Sign up for Apple Developer account ($99/year)
- [ ] Generate code signing certificates
- [ ] Test model download UI in settings
- [ ] Test local inference with PleIAs 350M
- [ ] Configure notarization for distribution
- [ ] Test on both Intel and Apple Silicon Macs

### Distribution Options:
1. **Direct download** - .dmg on your website (notarization required)
2. **Mac App Store** - Requires sandbox compliance review

---

## Desktop Expansion (Windows, Linux, Chromebook) - FUTURE

### Windows Distribution

| Requirement | Details | Cost |
|-------------|---------|------|
| Microsoft Store account | One-time registration | $19 |
| Code signing certificate | Required for Windows | $200-400/year |
| MSIX packaging | electron-builder supports this | — |

**Code Changes:**
- Add `electron-builder` config for Windows in package.json
- Test on Windows VM or physical machine
- Handle Windows-specific file paths

**Build Command:**
```bash
npm run electron:build -- --win
```

**package.json addition:**
```json
"win": {
  "target": ["nsis", "appx"],
  "icon": "public/icon.ico"
}
```

### Linux Distribution

| Format | Description | Users |
|--------|-------------|-------|
| AppImage | Universal, no install needed | Most compatible |
| .deb | Debian/Ubuntu package | Ubuntu users |
| .rpm | Red Hat/Fedora package | Fedora users |
| Flatpak | Sandboxed, auto-updates | Modern distros |
| Snap | Ubuntu-centric | Ubuntu users |

**Code Changes:**
- Add Linux targets to electron-builder config
- Test on Ubuntu VM
- No code signing required (optional GPG)

**Build Command:**
```bash
npm run electron:build -- --linux
```

**package.json addition:**
```json
"linux": {
  "target": ["AppImage", "deb", "rpm"],
  "category": "Office",
  "icon": "public/icon.png"
}
```

### Chromebook Support

Chromebooks can run EthicalAIditor via:

1. **Web app** (current) - Works now at ethicalaiditor.netlify.app
2. **Linux app** (via Crostini) - Use Linux AppImage build
3. **Android app** (via Play Store) - Use Capacitor build (already configured)

**Limitations:**
- Most Chromebooks have 4-8GB RAM
- Only smaller models (up to 7B) feasible
- Local storage may be limited

### Model Compatibility by Platform

| Model | Mac (M1/M2) | Windows | Linux | Chromebook |
|-------|-------------|---------|-------|------------|
| PleIAs 350M (~200MB) | ✅ All | ✅ All | ✅ All | ✅ All |
| Llama 3.2 1B (~600MB) | ✅ All | ✅ All | ✅ All | ✅ Most |
| Llama 3.2 3B (~1.8GB) | ✅ 8GB+ | ✅ 8GB+ | ✅ 8GB+ | ⚠️ 8GB only |
| Qwen 2.5 3B (~1.8GB) | ✅ 8GB+ | ✅ 8GB+ | ✅ 8GB+ | ⚠️ 8GB only |
| Mistral 7B (~4GB) | ✅ 16GB+ | ✅ 16GB+ | ✅ 16GB+ | ❌ |
| Llama 70B (~40GB) | ✅ 64GB+ | ✅ 64GB+ | ✅ 64GB+ | ❌ |

### Cross-Platform Build Script

When ready to support all platforms, add to package.json:
```json
"scripts": {
  "electron:build:all": "vite build && electron-builder --mac --win --linux"
}
```

### Cost Summary for Full Desktop Expansion

| Item | One-time | Annual |
|------|----------|--------|
| Apple Developer (Mac) | — | $99 |
| Microsoft Store (Windows) | $19 | — |
| Windows code signing cert | — | $200-400 |
| Linux distribution | — | Free |
| **Total Year 1** | **$19** | **$300-500** |
| **Total Year 2+** | — | **$300-500** |

---

## Cold Start Indicator Component (To Be Integrated)

A cold start indicator component has been created to show users when the LLM API is waking up from idle state. This needs to be integrated into the chat/main component.

### Files Created:
- `src/components/ColdStartIndicator.tsx` - Main component
- `src/components/ColdStartIndicator.css` - Styling (optional)

### Integration Steps:
1. Import the component in your chat/API-calling component:
   ```typescript
   import { ColdStartIndicator } from './ColdStartIndicator';
   ```

2. Add a loading state if not already present:
   ```typescript
   const [isGenerating, setIsGenerating] = useState(false);
   ```

3. Wrap API calls with the loading state:
   ```typescript
   const handleSubmit = async () => {
     setIsGenerating(true);
     try {
       // ...API call...
     } finally {
       setIsGenerating(false);
     }
   };
   ```

4. Add the component to your JSX:
   ```tsx
   <ColdStartIndicator isLoading={isGenerating} />
   ```

### To Disable:
Edit `src/components/ColdStartIndicator.tsx` line 4:
```typescript
const COLD_START_ENABLED = false;
```

### Notes:
- Only shows after 3 seconds of loading (to avoid showing for warm requests)
- Expected cold start time: 30-60 seconds
- Shows progress bar and elapsed/remaining time estimates
- Supports dark mode
