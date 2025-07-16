const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

// funcs per percorsi di python
function getEmbedPyPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'media', 'embedpy', 'python.exe')
    : path.join(__dirname, 'media', 'embedpy', 'python.exe');
}

function getScriptPath(scriptName) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'sources', scriptName)
    : path.join(__dirname, 'sources', scriptName);
}

function installPythonRequirements() {
  return new Promise((resolve, reject) => {
    const pythonExe = getEmbedPyPath();
    const requirementsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sources', 'requirements.txt')
      : path.join(__dirname, 'sources', 'requirements.txt');
    
    if (!fs.existsSync(requirementsPath)) {
      console.log('File requirements.txt non trovato, skip installazione');
      resolve();
      return;
    }
    
    console.log('Installazione/aggiornamento moduli Python...');
    console.log('Python exe:', pythonExe);
    console.log('Requirements path:', requirementsPath);
    
    const cmd = `"${pythonExe}" -m pip install -r "${requirementsPath}"`;
    console.log('Comando pip:', cmd);
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore installazione requirements:', err);
        console.error('Stderr:', stderr);
        resolve();
      } else {
        console.log('Moduli Python installati con successo');
        console.log('Stdout:', stdout);
        resolve();
      }
    });
  });
}

// aggiorna i requirements con pipreqs!
function updateRequirements() {
  return new Promise((resolve, reject) => {
    const sourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sources')
      : path.join(__dirname, 'sources');
    
    const cmd = `pipreqs "${sourcesPath}" --force`;
    
    console.log('Aggiornamento requirements.txt...');
    console.log('Comando pipreqs:', cmd);
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore aggiornamento requirements:', err);
        console.error('Stderr:', stderr);
        resolve();
      } else {
        console.log('Requirements.txt aggiornato con successo');
        console.log('Stdout:', stdout);
        resolve();
      }
    });
  });
}

async function setupPythonDependencies() {
  try {
    console.log('=== SETUP DIPENDENZE PYTHON ===');
    
    if (!app.isPackaged) {
      await updateRequirements();
    }
    
    // installa/aggiorna i moduli
    await installPythonRequirements();
    
    console.log('=== SETUP DIPENDENZE COMPLETATO ===');
    return true;
  } catch (error) {
    console.error('Errore nel setup dipendenze Python:', error);
    return false;
  }
}

// handler per python :3
ipcMain.handle('run-python', async (event, scriptName, argsArray = []) => {
  const pythonExe = getEmbedPyPath();
  const pythonScript = getScriptPath(scriptName);
  const argString = argsArray.map(a => `"${a}"`).join(' ');
  const cmd = `"${pythonExe}" "${pythonScript}" ${argString}`;
  
  console.log(`DEBUG: Esecuzione comando Python: ${cmd}`);
  
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore Python:', err);
        reject(stderr || err.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

// link esterni handler
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// clipboard handler
ipcMain.handle('write-clipboard', (event, text) => {
  clipboard.writeText(text);
  return { success: true };
});

// dialogs handler
ipcMain.handle('show-dialog', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

// mostra file nel folder
ipcMain.handle('show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'scripts', 'preload.js')
    },
    icon: path.join(__dirname, 'media', 'icon.ico')
  });
  
  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
  
  // Apri DevTools solo in sviluppo
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// Auto-updater gestione eventi
autoUpdater.on('checking-for-update', () => {
  console.log('Controllo aggiornamenti...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Aggiornamento disponibile');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento disponibile',
    message: 'È disponibile una nuova versione. Vuoi scaricarla?',
    buttons: ['Sì', 'No']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Nessun aggiornamento disponibile');
});

autoUpdater.on('error', (err) => {
  console.error('Errore nell\'aggiornamento:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Velocità download: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Scaricato ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', async (info) => {
  console.log('Aggiornamento scaricato, setup dipendenze...');
  
  // Setup dipendenze Python dopo l'aggiornamento
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema nel setup Python post-aggiornamento');
  }
  
  // Mostra dialog di completamento
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento pronto',
    message: 'Aggiornamento scaricato e dipendenze aggiornate. Verrà installato al riavvio.',
    buttons: ['Riavvia ora', 'Dopo']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});



app.whenReady().then(async () => {
  console.log('App pronta, inizializzo...');
  
  // Setup dipendenze Python prima di creare la finestra
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema nel setup Python, continuo comunque...');
  }
  
  // Crea la finestra
  createWindow();
  
  // Controlla aggiornamenti dopo 5 secondi dall'avvio
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
