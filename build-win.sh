#!/usr/bin/env bash
# Build Windows portable .exe from macOS.
# Works around DNS resolution issue in electron-builder's Go binary.

set -e
PROJ="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -p "require('$PROJ/package.json').version")"
ELECTRON_VER="$(node -p "require('$PROJ/node_modules/electron/package.json').version")"

MIRROR_DIR="/tmp/electron-mirror"
MIRROR_PORT=8766
ZIP_NAME="electron-v${ELECTRON_VER}-win32-x64.zip"

# Ensure local Electron mirror is set up
mkdir -p "${MIRROR_DIR}/v${ELECTRON_VER}"
if [ ! -f "${MIRROR_DIR}/v${ELECTRON_VER}/${ZIP_NAME}" ]; then
  echo "==> Downloading Electron ${ELECTRON_VER} for Windows..."
  curl -fL --progress-bar \
    -o "${MIRROR_DIR}/v${ELECTRON_VER}/${ZIP_NAME}" \
    "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/${ZIP_NAME}"
fi
if [ ! -f "${MIRROR_DIR}/v${ELECTRON_VER}/SHASUMS256.txt" ]; then
  curl -fsL \
    -o "${MIRROR_DIR}/v${ELECTRON_VER}/SHASUMS256.txt" \
    "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/SHASUMS256.txt"
fi

# Ensure winCodeSign + wine are in builder cache
CACHE="$HOME/Library/Caches/electron-builder"
if [ ! -d "$CACHE/winCodeSign/winCodeSign-2.6.0" ]; then
  echo "==> Caching winCodeSign-2.6.0..."
  curl -fsL -o /tmp/winCodeSign-2.6.0.7z \
    "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
  mkdir -p /tmp/winCodeSign-extracted
  "${PROJ}/node_modules/7zip-bin/mac/arm64/7za" x /tmp/winCodeSign-2.6.0.7z -o/tmp/winCodeSign-extracted -y >/dev/null
  rm -rf "$CACHE/winCodeSign/winCodeSign-2.6.0"
  mkdir -p "$CACHE/winCodeSign/winCodeSign-2.6.0"
  cp -R /tmp/winCodeSign-extracted/* "$CACHE/winCodeSign/winCodeSign-2.6.0"/
fi
if [ ! -d "$CACHE/wine/wine-4.0.1-mac" ]; then
  echo "==> Caching wine-4.0.1-mac..."
  curl -fsL -o /tmp/wine-4.0.1-mac.7z \
    "https://github.com/electron-userland/electron-builder-binaries/releases/download/wine-4.0.1-mac/wine-4.0.1-mac.7z"
  mkdir -p /tmp/wine-extracted
  "${PROJ}/node_modules/7zip-bin/mac/arm64/7za" x /tmp/wine-4.0.1-mac.7z -o/tmp/wine-extracted -y >/dev/null
  rm -rf "$CACHE/wine/wine-4.0.1-mac"
  mkdir -p "$CACHE/wine/wine-4.0.1-mac"
  cp -R /tmp/wine-extracted/* "$CACHE/wine/wine-4.0.1-mac"/
fi

# Start local mirror server if not running
if ! curl -fs "http://127.0.0.1:${MIRROR_PORT}/v${ELECTRON_VER}/${ZIP_NAME}" -o /dev/null -r 0-1 2>/dev/null; then
  echo "==> Starting local Electron mirror on :${MIRROR_PORT}..."
  pkill -f "node.*electron-mirror/serve.js" 2>/dev/null || true
  sleep 1
  if [ ! -f "${MIRROR_DIR}/serve.js" ]; then
    cat > "${MIRROR_DIR}/serve.js" <<'JS'
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.dirname(require.main.filename);
http.createServer((req,res)=>{const p=path.join(ROOT,req.url.split('?')[0]);
  if(!p.startsWith(ROOT)){res.writeHead(403);res.end();return;}
  fs.stat(p,(e,s)=>{if(e||!s.isFile()){res.writeHead(404);res.end();return;}
    const range=req.headers.range,total=s.size;
    if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);res.end();return;}
      const start=+m[1],end=m[2]?+m[2]:total-1;
      res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${total}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});
      fs.createReadStream(p,{start,end}).pipe(res);}
    else{res.writeHead(200,{'Accept-Ranges':'bytes','Content-Length':total});fs.createReadStream(p).pipe(res);}});
}).listen(8766,'127.0.0.1');
JS
  fi
  node "${MIRROR_DIR}/serve.js" &
  MIRROR_PID=$!
  sleep 1
  trap "kill $MIRROR_PID 2>/dev/null || true" EXIT
fi

echo "==> Building Windows portable.exe v${VERSION}..."
cd "$PROJ"
ELECTRON_MIRROR="http://127.0.0.1:${MIRROR_PORT}/" \
ELECTRON_CUSTOM_DIR="v${ELECTRON_VER}" \
npm run dist:win

echo ""
echo "Done. Output: dist/Trading-Suite-${VERSION}-x64-portable.exe"
