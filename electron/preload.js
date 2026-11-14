// Pont sécurisé exposé à l'interface (window.jsm).
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('jsm', {
  version: ipcRenderer.sendSync('app:version'),
  getConfig: call('config:get'),
  chooseFolder: call('config:chooseFolder'),
  setProfil: call('config:setProfil'),
  setConfig: call('config:set'),
  load: call('data:load'),
  append: call('data:append'),
  others: call('data:others'),
  backup: call('data:backup'),
  writeBase: call('data:writeBase'),
  replaceAll: call('data:replaceAll'),
  newYear: call('data:newYear'),
  pickExcel: call('import:pick'),
  printToPDF: call('print:pdf'),
  print: call('print:print'),
  choosePdfFolder: call('print:chooseFolder'),
  openExternal: call('shell:open'),
  copy: call('clipboard:write'),
  saveText: call('file:saveText'),
  onRemote: (cb) => {
    const h = (e, ops, info) => cb(ops, info);
    ipcRenderer.on('data:remote', h);
    return () => ipcRenderer.removeListener('data:remote', h);
  },
});
