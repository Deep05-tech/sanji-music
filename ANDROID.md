# Sanji Android Build

## What was generated

- Android project: `client/android`
- Debug APK: `client/android/app/build/outputs/apk/debug/app-debug.apk`
- App id: `com.sanji.music`
- App name: `Sanji`

## Important backend rule

The Android app is a native shell for the React player. Search and streaming require one reachable Node backend because the backend runs `yt-dlp` and `ffmpeg`.

For friends, do not ship an APK that points to `localhost`. Host the server once, then build the Android app with that public URL:

```powershell
cd client
$env:VITE_SANJI_API_URL='https://your-sanji-server.example.com'
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The app now opens directly to Sign In / Register. Server settings are still available from the sign-in screen and from the profile menu for development or migration.

## Backend hosting checklist

From `server`:

```powershell
npm install
$env:TOKEN_SECRET='use-a-long-random-secret'
$env:HOST='0.0.0.0'
$env:PORT='5000'
npm start
```

The hosted machine must have:

- Node.js
- `yt-dlp` available on PATH
- `ffmpeg` available on PATH, or `FFMPEG_PATH` set to the ffmpeg executable
- A public HTTPS URL for production Android builds

User accounts and libraries are stored in `server/data/db.json`.

## Local development

For browser development:

```powershell
cd server
npm run dev
```

```powershell
cd client
npm run dev
```

The local Vite app uses `http://localhost:5000` automatically. Android devices should use a hosted backend URL or a LAN IP while testing.

## Rebuild the APK locally

From `client`:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```
