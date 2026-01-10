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

## Mobile Apps (iOS & Android) - READY FOR DEVELOPMENT

Mobile app infrastructure has been added with local LLM inference support via Capacitor.

### Files Added:
- `src/services/mobile-llm.js` - Mobile-specific LLM service with:
  - Model download to device storage
  - Local inference via llama.cpp native plugin
  - Device RAM detection for model recommendations
  - Offline-capable operation
- `capacitor.config.ts` - Updated with mobile-specific settings

### Updated Files:
- `src/services/local-llm.js` - Now supports iOS/Android via unified API
- `src/services/huggingface.js` - Platform-aware inference routing
- `package.json` - Added Capacitor dependencies and mobile scripts

### Mobile-Compatible Models

| Model | Size | RAM Needed | All Phones? | Notes |
|-------|------|------------|-------------|-------|
| **PleIAs 350M** | 200MB | 1GB | ✅ Yes | Recommended default |
| Llama 3.2 1B | 600MB | 2GB | ✅ Yes | Good quality |
| Llama 3.2 3B | 1.8GB | 4GB | ⚠️ 6GB+ phones | High-end only |

### Setup Commands:

```bash
# 1. Install dependencies
npm install

# 2. Add iOS platform (requires Mac with Xcode)
npm run cap:add:ios

# 3. Add Android platform (requires Android Studio)
npm run cap:add:android

# 4. Build and sync to platforms
npm run cap:sync

# 5. Open in Xcode for iOS development
npm run cap:open:ios

# 6. Open in Android Studio for Android development
npm run cap:open:android
```

### iOS Development Requirements

| Requirement | Details | Cost |
|-------------|---------|------|
| Mac computer | Required for iOS development | — |
| Xcode | From Mac App Store | Free |
| Apple Developer Account | For App Store distribution | $99/year |
| Physical iPhone | For testing (simulator works too) | — |

### capacitor-llama-cpp Plugin (CREATED)

A custom Capacitor plugin has been created at `plugins/capacitor-llama-cpp/` to wrap llama.cpp for iOS and Android.

**Plugin Structure:**
```
plugins/capacitor-llama-cpp/
├── package.json              # Plugin config
├── CapacitorLlamaCpp.podspec # iOS CocoaPods spec
├── src/
│   ├── index.ts              # Plugin registration
│   ├── definitions.ts        # TypeScript API interfaces
│   └── web.ts                # Web fallback/mock
├── ios/Plugin/
│   ├── LlamaCppPlugin.swift  # iOS Capacitor plugin
│   ├── LlamaContext.swift    # Swift wrapper for llama.cpp
│   └── llama-bridging-header.h
└── android/
    ├── build.gradle          # Android build with NDK
    └── src/main/
        ├── java/.../LlamaCppPlugin.java  # Android plugin
        └── cpp/
            ├── CMakeLists.txt
            └── llamacpp_jni.cpp  # JNI bindings
```

**Plugin API:**
- `loadModel(options)` - Load a GGUF model from path
- `unloadModel()` - Free model from memory  
- `generate(options)` - Generate text with streaming callback
- `getModelInfo()` - Get loaded model details
- `stopGeneration()` - Cancel ongoing generation

**Build Requirements:**

*iOS:*
1. Clone llama.cpp: `git clone https://github.com/ggerganov/llama.cpp`
2. Build as xcframework:
   ```bash
   cd llama.cpp
   mkdir build-ios && cd build-ios
   cmake .. -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DLLAMA_METAL=ON
   xcodebuild -scheme llama -configuration Release -sdk iphoneos
   ```
3. Add the resulting framework to the Xcode project

*Android:*
1. Clone llama.cpp into the plugin:
   ```bash
   cd plugins/capacitor-llama-cpp/android/src/main/cpp
   git clone https://github.com/ggerganov/llama.cpp
   ```
2. The CMakeLists.txt will build it automatically with Android NDK

### Android Development Requirements

| Requirement | Details | Cost |
|-------------|---------|------|
| Android Studio | IDE for Android | Free |
| JDK 17+ | Required by Android Studio | Free |
| Android SDK | Installed via Android Studio | Free |
| Google Play Developer | For Play Store distribution | $25 one-time |

### Remaining Mobile Tasks:

**iOS:**
- [ ] Clone and build llama.cpp as iOS xcframework (see above)
- [ ] Add framework to Xcode project after `cap add ios`
- [ ] Test model download on iOS Simulator
- [ ] Test local inference on physical iPhone
- [ ] Create app icons (1024x1024 for App Store)
- [ ] Configure App Store Connect
- [ ] Submit for TestFlight beta testing

**Android:**
- [ ] Clone llama.cpp into `plugins/capacitor-llama-cpp/android/src/main/cpp/`
- [ ] Run `npm run cap:add:android` to create Android project
- [ ] Test model download on Android Emulator
- [ ] Test local inference on physical Android device
- [ ] Create app icons (512x512 for Play Store)
- [ ] Configure Google Play Console
- [ ] Submit for internal testing track

### Mobile Architecture

```
┌─────────────────────────────────────────────────┐
│  User opens app                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  First launch:                                  │
│  └─> Show "Download Model" prompt              │
│      └─> Download PleIAs 350M (200MB)          │
│          └─> Save to app's private storage     │
│                                                 │
│  Subsequent launches:                           │
│  └─> Load model from local storage             │
│      └─> Ready for instant inference           │
│                                                 │
│  Inference:                                     │
│  └─> User types prompt                         │
│      └─> Call llama.cpp native plugin          │
│          └─> Get response in 2-5 seconds       │
│                                                 │
│  Fallback (if online):                          │
│  └─> Can still use Cloud API if preferred      │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Cost Summary for Mobile

| Item | One-time | Annual |
|------|----------|--------|
| Apple Developer (iOS) | — | $99 |
| Google Play Developer | $25 | — |
| **Total Year 1** | **$25** | **$99** |
| **Total Year 2+** | — | **$99** |

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
