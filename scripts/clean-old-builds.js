#!/usr/bin/env node
/**
 * Pre-build cleanup: deletes ALL DMG/ZIP/blockmap artifacts in dist/ except
 * those matching the CURRENT version in package.json. Keeps dist/ tidy
 * across version bumps. Runs automatically via npm pre-hook (predist).
 *
 * Doesn't touch:
 *   - mac-arm64/ and win-unpacked/ folders (intermediate, electron-builder
 *     overwrites them on next build)
 *   - builder-debug.yml (re-generated each build)
 *   - .DS_Store (macOS metadata)
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  // Nothing to clean — first build
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const currentVersion = pkg.version;

const KEEP_FILES = new Set(['.DS_Store', 'builder-debug.yml']);
const ARTIFACT_EXT = /\.(dmg|zip|exe|blockmap)$/i;

let removed = 0;
fs.readdirSync(distDir).forEach(name => {
  const full = path.join(distDir, name);
  let stat;
  try { stat = fs.statSync(full); } catch (_) { return; }
  if (stat.isDirectory()) return;            // skip unpacked folders
  if (KEEP_FILES.has(name)) return;          // skip metadata
  if (!ARTIFACT_EXT.test(name)) return;      // skip non-artifacts
  if (name.includes(currentVersion)) return; // keep CURRENT version

  try {
    fs.unlinkSync(full);
    console.log('  · removed old: ' + name);
    removed++;
  } catch (e) {
    console.warn('  ! could not remove ' + name + ': ' + e.message);
  }
});

if (removed > 0) {
  console.log('  ✓ cleaned ' + removed + ' old build file(s); keeping v' + currentVersion);
}
