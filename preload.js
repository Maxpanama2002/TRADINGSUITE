const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iCloud', {
  save: (data) => ipcRenderer.invoke('icloud:save', data),
  load: () => ipcRenderer.invoke('icloud:load'),
  status: () => ipcRenderer.invoke('icloud:status')
});

contextBridge.exposeInMainWorld('AI', {
  chat: (messages, model, context) => ipcRenderer.invoke('ai:chat', { messages, model, context }),
  listModels: () => ipcRenderer.invoke('ai:listModels')
});

contextBridge.exposeInMainWorld('Markets', {
  yahooChart: (symbol, range, interval) => ipcRenderer.invoke('markets:yahooChart', { symbol, range, interval })
});

contextBridge.exposeInMainWorld('AppLang', {
  setLang: (lang) => ipcRenderer.invoke('app:setLang', lang)
});

// Внимание-зов: алерты вызывают bounce dock-иконки / flash окна
contextBridge.exposeInMainWorld('AppShell', {
  bounce: () => ipcRenderer.invoke('shell:bounce')
});
