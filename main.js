const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

const updateJsonUrl = 'https://api.jsonsilo.com/public/2196f25f-d69e-4739-ac9d-41162b634b97';

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

function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContent = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
  return hash;
}

// Funzione di debug per verificare i percorsi
function debugPaths() {
  console.log('=== DEBUG PERCORSI ===');
  console.log('app.isPackaged:', app.isPackaged);
  console.log('__dirname:', __dirname);
  
  if (app.isPackaged) {
    console.log('process.resourcesPath:', process.resourcesPath);
  }
  
  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'index.html')
    : path.join(__dirname, 'index.html');
  
  console.log('Percorso index.html:', indexPath);
  console.log('index.html esiste:', fs.existsSync(indexPath));
  
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    console.log('Versione attuale:', content.includes('v1.1') ? 'v1.1' : 'v1.0');
  }
}

// Controllo aggiornamenti con dialog
async function checkForUpdates() {
  try {
    console.log('=== CONTROLLO AGGIORNAMENTI ===');
    console.log('Timestamp:', new Date().toISOString());
    
    // Mostra dialog di controllo aggiornamenti
    const checkingDialog = dialog.showMessageBox(null, {
      type: 'info',
      title: 'Controllo Aggiornamenti',
      message: 'Controllo aggiornamenti in corso...',
      buttons: ['Attendere...'],
      defaultId: 0
    });
    
    console.log(`Scaricamento informazioni da: ${updateJsonUrl}`);
    const response = await fetch(updateJsonUrl);
    
    if (!response.ok) {
      console.error(`Errore scaricamento: ${response.status}`);
      
      dialog.showMessageBox(null, {
        type: 'error',
        title: 'Errore Aggiornamenti',
        message: 'Servizio aggiornamenti non disponibile',
        buttons: ['OK']
      });
      
      return { success: false, error: 'Servizio aggiornamenti non disponibile' };
    }
    
    const updateData = await response.json();
    console.log(`Versione disponibile: ${updateData.version}`);
    console.log(`File da controllare: ${updateData.files.length}`);
    
    let changedFiles = [];
    
    for (const fileInfo of updateData.files) {
      const localPath = app.isPackaged 
        ? path.join(process.resourcesPath, fileInfo.path)
        : path.join(__dirname, fileInfo.path);
      
      const localHash = calculateFileHash(localPath);
      
      if (localHash === null) {
        console.log(`FILE MANCANTE DA SCARICARE: ${fileInfo.path}`);
        changedFiles.push(fileInfo);
      } else if (localHash !== fileInfo.hash) {
        console.log(`AGGIORNAMENTO NECESSARIO: ${fileInfo.path}`);
        changedFiles.push(fileInfo);
      }
    }
    
    console.log(`File che necessitano aggiornamento: ${changedFiles.length}`);
    
    if (changedFiles.length > 0) {
      // Mostra dialog con lista aggiornamenti
      const fileList = changedFiles.map(file => `• ${file.path}`).join('\n');
      const message = `Nuova versione disponibile: ${updateData.version}\n\nFile da aggiornare:\n${fileList}`;
      
      const result = await dialog.showMessageBox(null, {
        type: 'question',
        title: 'Aggiornamento Disponibile',
        message: message,
        buttons: ['Aggiorna Ora', 'Salta', 'Annulla'],
        defaultId: 0,
        cancelId: 2
      });
      
      if (result.response === 0) {
        // Utente ha scelto di aggiornare
        return await performUpdate(changedFiles, updateData.version);
      } else if (result.response === 1) {
        // Utente ha scelto di saltare
        console.log('Aggiornamento saltato dall\'utente');
        return { success: true, skipped: true };
      } else {
        // Utente ha annullato
        console.log('Aggiornamento annullato dall\'utente');
        return { success: false, cancelled: true };
      }
      
    } else {
      dialog.showMessageBox(null, {
        type: 'info',
        title: 'Aggiornamenti',
        message: 'Tutti i file sono già aggiornati!',
        buttons: ['OK']
      });
      
      console.log('Tutti i file sono già aggiornati');
      return { success: true, updatedFiles: [], message: 'Tutto aggiornato' };
    }
    
  } catch (error) {
    console.error('Errore durante controllo aggiornamenti:', error);
    
    dialog.showMessageBox(null, {
      type: 'error',
      title: 'Errore',
      message: `Errore durante il controllo aggiornamenti: ${error.message}`,
      buttons: ['OK']
    });
    
    return { success: false, error: error.message };
  }
}

// Esegui l'aggiornamento
async function performUpdate(changedFiles, version) {
  try {
    // Mostra dialog di progresso
    console.log('Inizio aggiornamento...');
    
    let updatedFiles = [];
    let totalFiles = changedFiles.length;
    let currentFile = 0;
    
    for (const fileInfo of changedFiles) {
      currentFile++;
      console.log(`Aggiornamento (${currentFile}/${totalFiles}): ${fileInfo.path}`);
      
      const localPath = app.isPackaged 
        ? path.join(process.resourcesPath, fileInfo.path)
        : path.join(__dirname, fileInfo.path);
      
      try {
        const fileResponse = await fetch(fileInfo.url);
        
        if (!fileResponse.ok) {
          console.error(`Errore scaricamento ${fileInfo.path}: ${fileResponse.status}`);
          continue;
        }
        
        const fileContent = await fileResponse.text();
        
        const localHash = calculateFileHash(localPath);
        if (localHash === null) {
          console.log(`Salvataggio file mancante: ${fileInfo.path}`);
        } else {
          const downloadedHash = crypto.createHash('sha256').update(fileContent).digest('hex');
          
          if (downloadedHash !== fileInfo.hash) {
            console.error(`Errore integrità file ${fileInfo.path}`);
            continue;
          }
        }
        
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, fileContent);
        updatedFiles.push(fileInfo.path);
        
        console.log(`File aggiornato: ${fileInfo.path}`);
        
      } catch (error) {
        console.error(`Errore aggiornamento ${fileInfo.path}:`, error);
      }
    }
    
    console.log(`Aggiornamento completato: ${updatedFiles.length} file aggiornati`);
    
    if (updatedFiles.some(file => file.includes('requirements.txt'))) {
      console.log('Reinstallazione moduli Python...');
      await installPythonRequirements();
    }
    
    if (updatedFiles.length > 0) {
      // Gestisci aggiornamenti UI
      const uiFiles = ['index.html', 'styles.css', 'scripts/'];
      const hasUIUpdate = updatedFiles.some(file => 
        uiFiles.some(uiFile => file.includes(uiFile))
      );
      
      if (hasUIUpdate) {
        dialog.showMessageBox(null, {
          type: 'info',
          title: 'Aggiornamento Completato',
          message: `Aggiornamento alla versione ${version} completato!\n\nL'interfaccia verrà ricaricata.`,
          buttons: ['OK']
        });
        
        console.log('*** AGGIORNAMENTO UI COMPLETATO ***');
      } else {
        const result = await dialog.showMessageBox(null, {
          type: 'info',
          title: 'Aggiornamento Completato',
          message: `Aggiornamento alla versione ${version} completato!\n\nÈ necessario riavviare l'applicazione.`,
          buttons: ['Riavvia Ora', 'Riavvia Dopo'],
          defaultId: 0
        });
        
        if (result.response === 0) {
          console.log('*** RIAVVIO APPLICAZIONE ***');
          app.relaunch();
          app.exit(0);
        }
      }
    }
    
    return {
      success: true,
      updatedFiles: updatedFiles,
      version: version
    };
    
  } catch (error) {
    console.error('Errore durante aggiornamento:', error);
    
    dialog.showMessageBox(null, {
      type: 'error',
      title: 'Errore Aggiornamento',
      message: `Errore durante l'aggiornamento: ${error.message}`,
      buttons: ['OK']
    });
    
    return { success: false, error: error.message };
  }
}

// Controllo aggiornamenti periodico (silenzioso)
async function checkPeriodicUpdates() {
  try {
    console.log('=== CONTROLLO PERIODICO AGGIORNAMENTI ===');
    
    const response = await fetch(updateJsonUrl);
    
    if (!response.ok) {
      console.error(`Errore scaricamento: ${response.status}`);
      return { success: false, error: 'Servizio aggiornamenti non disponibile' };
    }
    
    const updateData = await response.json();
    console.log(`Versione disponibile: ${updateData.version}`);
    
    let changedFiles = [];
    
    for (const fileInfo of updateData.files) {
      const localPath = app.isPackaged 
        ? path.join(process.resourcesPath, fileInfo.path)
        : path.join(__dirname, fileInfo.path);
      
      const localHash = calculateFileHash(localPath);
      
      if (localHash === null || localHash !== fileInfo.hash) {
        changedFiles.push(fileInfo);
      }
    }
    
    if (changedFiles.length > 0) {
      console.log(`Controllo periodico: trovati ${changedFiles.length} file da aggiornare`);
      
      // Mostra notifica discreta
      if (mainWindow) {
        const fileList = changedFiles.map(file => `• ${file.path}`).join('\n');
        const message = `Nuova versione disponibile: ${updateData.version}\n\nFile da aggiornare:\n${fileList}`;
        
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          title: 'Aggiornamento Disponibile',
          message: message,
          buttons: ['Aggiorna Ora', 'Ricorda Dopo'],
          defaultId: 1
        });
        
        if (result.response === 0) {
          return await performUpdate(changedFiles, updateData.version);
        }
      }
    } else {
      console.log('Controllo periodico: tutto aggiornato');
    }
    
    return { success: true, updatedFiles: [], message: 'Tutto aggiornato' };
    
  } catch (error) {
    console.error('Errore durante controllo periodico:', error);
    return { success: false, error: error.message };
  }
}

function installPythonRequirements() {
  return new Promise((resolve) => {
    const pythonExe = getEmbedPyPath();
    const requirementsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sources', 'requirements.txt')
      : path.join(__dirname, 'sources', 'requirements.txt');
    
    if (!fs.existsSync(requirementsPath)) {
      console.log('File requirements.txt non trovato, skip installazione');
      resolve();
      return;
    }
    
    console.log('Installazione moduli Python in corso...');
    const cmd = `"${pythonExe}" -m pip install -r "${requirementsPath}"`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore installazione requirements:', err);
      } else {
        console.log('Moduli Python installati correttamente');
      }
      resolve();
    });
  });
}

function updateRequirements() {
  return new Promise((resolve) => {
    const sourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sources')
      : path.join(__dirname, 'sources');
    
    const cmd = `pipreqs "${sourcesPath}" --force`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore aggiornamento requirements:', err);
      } else {
        console.log('File requirements.txt aggiornato');
      }
      resolve();
    });
  });
}

async function setupPythonDependencies() {
  try {
    console.log('=== CONFIGURAZIONE PYTHON ===');
    
    if (!app.isPackaged) {
      await updateRequirements();
    }
    
    await installPythonRequirements();
    
    console.log('=== CONFIGURAZIONE COMPLETATA ===');
    return true;
  } catch (error) {
    console.error('Errore configurazione Python:', error);
    return false;
  }
}

ipcMain.handle('run-python', async (event, scriptName, argsArray = []) => {
  const pythonExe = getEmbedPyPath();
  const pythonScript = getScriptPath(scriptName);
  const argString = argsArray.map(a => `"${a}"`).join(' ');
  const cmd = `"${pythonExe}" "${pythonScript}" ${argString}`;
  
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore esecuzione Python:', err);
        reject(stderr || err.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-clipboard', (event, text) => {
  clipboard.writeText(text);
  return { success: true };
});

ipcMain.handle('show-dialog', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

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
  
  // Carica index.html dal percorso corretto
  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, 'index.html')
    : path.join(__dirname, 'index.html');
  
  console.log('Caricando index.html da:', indexPath);
  mainWindow.loadFile(indexPath);
  
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  
  // Ricarica UI se necessario dopo aggiornamento
  if (global.uiUpdatePending) {
    setTimeout(() => {
      mainWindow.webContents.session.clearCache();
      mainWindow.loadFile(indexPath);
      global.uiUpdatePending = false;
    }, 2000);
  }
}

function startPeriodicUpdates() {
  setInterval(async () => {
    console.log('Controllo periodico aggiornamenti...');
    await checkPeriodicUpdates();
  }, 10 * 60 * 1000); // Ogni 10 minuti
}

app.whenReady().then(async () => {
  console.log('Applicazione avviata');
  debugPaths();
  
  // PRIMA: Controllo aggiornamenti con dialog
  console.log('Controllo aggiornamenti...');
  const updateResult = await checkForUpdates();
  
  // Se l'aggiornamento è stato annullato, chiudi l'app
  if (updateResult.cancelled) {
    console.log('Applicazione chiusa per annullamento aggiornamento');
    app.quit();
    return;
  }
  
  // Se c'è stato un aggiornamento UI, segnalalo
  if (updateResult.success && updateResult.updatedFiles) {
    const uiFiles = ['index.html', 'styles.css', 'scripts/'];
    const hasUIUpdate = updateResult.updatedFiles.some(file => 
      uiFiles.some(uiFile => file.includes(uiFile))
    );
    
    if (hasUIUpdate) {
      global.uiUpdatePending = true;
    }
  }
  
  // DOPO: Setup Python e avvio app
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema durante configurazione Python');
  }
  
  createWindow();
  startPeriodicUpdates();
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
