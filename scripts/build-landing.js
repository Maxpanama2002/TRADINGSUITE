#!/usr/bin/env node
/**
 * Builds the landing site to mirror the current desktop version:
 *
 *   1. Copies app/ → landing/app/ (web demo mirrors desktop build)
 *   2. Injects "web demo" banner into landing/app/index.html
 *   3. Auto-syncs version: reads version from package.json and updates
 *      every version reference in landing HTML + renames binaries in
 *      landing/downloads/ so the site always shows the current version.
 *
 *   npm run build:landing
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'app');
const dst = path.join(root, 'landing', 'app');

if (!fs.existsSync(src)) {
  console.error('  ✗ app/ not found at ' + src);
  process.exit(1);
}

// Read current version from package.json — single source of truth
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;

fs.mkdirSync(dst, { recursive: true });

let copied = 0;
fs.readdirSync(src).forEach(name => {
  const s = path.join(src, name);
  const d = path.join(dst, name);
  const stat = fs.statSync(s);
  if (stat.isFile()) {
    fs.copyFileSync(s, d);
    copied++;
    console.log('  · ' + name + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
  }
});

// Inject a "web demo" banner script into the COPY of index.html so the
// hosted web version informs the user about Electron-only limitations
// (iCloud sync, Yahoo Finance forex/stocks, native push). The desktop
// app/index.html stays untouched.
const idxPath = path.join(dst, 'index.html');
if (fs.existsSync(idxPath)) {
  let html = fs.readFileSync(idxPath, 'utf8');
  const BANNER_SNIPPET = `
<script id="__webdemo_banner__">
(function(){
  // Only show on web (browser without Electron preload)
  if (typeof window.electronAPI !== 'undefined' || typeof window.iCloud !== 'undefined') return;

  function isEn(){ try { return (localStorage.getItem('app_lang') || 'ru') === 'en'; } catch(_) { return false; } }

  // ── "← На сайт" tab — always visible at top-center ─────────────────────
  function mountBackBtn(){
    if (document.getElementById('__back_to_site__')) return;
    var en = isEn();
    var btn = document.createElement('a');
    btn.id = '__back_to_site__';
    btn.href = '../';
    btn.title = en ? 'Back to landing page' : 'Вернуться на сайт';
    btn.textContent = en ? '← Site' : '← На сайт';
    btn.style.cssText = [
      'position:fixed',
      'top:0',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:200001',
      'background:rgba(12,12,18,0.80)',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'color:#c4b5fd',
      'text-decoration:none',
      'padding:4px 18px 6px',
      'border-radius:0 0 12px 12px',
      'font-size:12px',
      'font-weight:600',
      'font-family:Inter,system-ui,sans-serif',
      'border:1px solid rgba(124,58,237,0.35)',
      'border-top:none',
      'white-space:nowrap',
      'letter-spacing:.03em',
      'transition:background .15s,color .15s',
    ].join(';');
    btn.addEventListener('mouseover', function(){ btn.style.background='rgba(124,58,237,0.30)'; btn.style.color='#fff'; });
    btn.addEventListener('mouseout',  function(){ btn.style.background='rgba(12,12,18,0.80)';   btn.style.color='#c4b5fd'; });
    document.body.appendChild(btn);
  }

  // ── Web-demo info chip — bottom-right, dismissable ───────────────────────
  function dismiss(){
    try { sessionStorage.setItem('webdemo_banner_dismissed', '1'); } catch(_){}
    var b = document.getElementById('__webdemo_banner_el__');
    if (b) b.remove();
  }
  function mountChip(){
    if (document.getElementById('__webdemo_banner_el__')) return;
    try { if (sessionStorage.getItem('webdemo_banner_dismissed') === '1') return; } catch(_){}
    var en = isEn();
    var bar = document.createElement('div');
    bar.id = '__webdemo_banner_el__';
    bar.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:100000;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;padding:11px 14px 11px 16px;font-family:Inter,system-ui,sans-serif;font-size:12.5px;font-weight:500;display:flex;align-items:center;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,0.35);border-radius:14px;max-width:380px;line-height:1.4;';
    bar.innerHTML =
      '<span style="flex:1;min-width:0;">'
      + (en
          ? '🌐 <b>Web demo</b> — 90% works in browser. Install desktop for full (iCloud, push, forex).'
          : '🌐 <b>Веб-демо</b> — 90% работает в браузере. Для полного функционала (iCloud, push, forex) скачай десктоп.')
      + '</span>'
      + '<a href="/landing/download.html" style="background:rgba(255,255,255,0.24);color:#fff;text-decoration:none;padding:6px 12px;border-radius:9px;font-weight:600;font-size:12px;white-space:nowrap;flex-shrink:0;">'
      + (en ? '↓ Get' : '↓ Скачать')
      + '</a>'
      + '<button style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:0 2px 0 4px;opacity:0.85;flex-shrink:0;" title="' + (en ? 'Dismiss' : 'Скрыть') + '">×</button>';
    bar.querySelector('button').addEventListener('click', dismiss);
    document.body.appendChild(bar);
  }

  function mount(){
    mountBackBtn();
    mountChip();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else { mount(); }
})();
</script>
`;
  if (html.indexOf('__webdemo_banner__') === -1) {
    html = html.replace(/<\/body>\s*<\/html>\s*$/, BANNER_SNIPPET + '\n</body>\n</html>\n');
    fs.writeFileSync(idxPath, html, 'utf8');
    console.log('  ✓ injected web-demo banner into landing/app/index.html');
  }
}

console.log('  ✓ landing/app/ refreshed (' + copied + ' files)');

// ─── Auto-sync version across all landing HTML + downloads ────────
// Replaces any `2.1.NNN` pattern in landing HTML with the current version.
// Renames DMG/ZIP files in landing/downloads/ so all filename references
// in HTML stay valid.
const landingDir = path.join(root, 'landing');
const downloadsDir = path.join(landingDir, 'downloads');

let htmlFilesUpdated = 0;
let versionRefsRewritten = 0;

function walkHtml(dir){
  if(!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if(stat.isDirectory()){
      if(name === 'app' || name === 'downloads' || name === 'screenshots' || name === 'assets' || name === 'node_modules') return;
      walkHtml(full);
      return;
    }
    if(!name.endsWith('.html')) return;
    let html = fs.readFileSync(full, 'utf8');
    let count = 0;
    // Match every old 2.1.XXX version reference and replace with APP_VERSION
    html = html.replace(/2\.1\.\d{2,3}/g, function(){ count++; return APP_VERSION; });
    // v2.1.165 — cache-bust query string on assets/site.css (and site.js if added later)
    // ensures every visitor sees latest CSS even if their browser cached the old one.
    html = html.replace(/(site\.(?:css|js))(\?v=[^"'>\s]+)?/g, function(_, file, q){
      var newRef = file + '?v=' + APP_VERSION;
      if(_ !== newRef) count++;
      return newRef;
    });
    if(count > 0){
      fs.writeFileSync(full, html, 'utf8');
      htmlFilesUpdated++;
      versionRefsRewritten += count;
      console.log('  · ' + path.relative(landingDir, full) + ' (' + count + ' refs)');
    }
  });
}
walkHtml(landingDir);
if(htmlFilesUpdated > 0){
  console.log('  ✓ ' + versionRefsRewritten + ' version refs synced → v' + APP_VERSION + ' across ' + htmlFilesUpdated + ' file(s)');
}

// Rename binaries in landing/downloads/ to current version. If a binary
// matching the current version already exists (from a recent dist build),
// drop any stale ones with a different version.
if(fs.existsSync(downloadsDir)){
  let renamed = 0, dropped = 0;
  const need = {
    'arm64.dmg': 'Trading-Suite-' + APP_VERSION + '-arm64.dmg',
    'x64.zip':   'Trading-Suite-' + APP_VERSION + '-x64.zip'
  };
  fs.readdirSync(downloadsDir).forEach(name => {
    const full = path.join(downloadsDir, name);
    if(name === need['arm64.dmg'] || name === need['x64.zip']) return; // already correct
    // Detect type and rename to current version
    if(/arm64\.dmg$/.test(name)){
      fs.renameSync(full, path.join(downloadsDir, need['arm64.dmg']));
      renamed++;
      console.log('  · downloads/' + name + ' → ' + need['arm64.dmg']);
    } else if(/x64\.zip$/.test(name)){
      fs.renameSync(full, path.join(downloadsDir, need['x64.zip']));
      renamed++;
      console.log('  · downloads/' + name + ' → ' + need['x64.zip']);
    } else if(name === '.DS_Store'){
      // skip
    } else {
      fs.unlinkSync(full);
      dropped++;
    }
  });
  if(renamed || dropped) console.log('  ✓ landing/downloads/ synced — ' + renamed + ' renamed, ' + dropped + ' dropped');
}

console.log('  ✓ landing build complete (v' + APP_VERSION + ')');
