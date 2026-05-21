// Render build/icon.svg to a single 1024x1024 PNG via Electron's offscreen renderer.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SVG_PATH = path.join(__dirname, 'icon.svg');
const OUT_PATH = path.join(__dirname, 'icon_1024.png');
const HTML_PATH = path.join(__dirname, '_render.html');

app.commandLine.appendSwitch('disable-gpu-compositing');

app.whenReady().then(async () => {
  try {
    const size = 1024;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
      img{display:block;width:${size}px;height:${size}px;}
    </style></head><body><img src="file://${SVG_PATH}"/></body></html>`;
    fs.writeFileSync(HTML_PATH, html);
    const win = new BrowserWindow({
      width: size, height: size, show: false, frame: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { offscreen: true, nodeIntegration: false }
    });
    await win.loadFile(HTML_PATH);
    await new Promise(r => setTimeout(r, 800));
    const img = await win.webContents.capturePage();
    const buf = img.toPNG();
    fs.writeFileSync(OUT_PATH, buf);
    console.log('Wrote', OUT_PATH, '-', buf.length, 'bytes');
    win.destroy();
    try { fs.unlinkSync(HTML_PATH); } catch(_) {}
  } catch(e) {
    console.error('ERROR', e);
  }
  app.quit();
});
