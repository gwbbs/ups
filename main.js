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

// Controllo e aggiornamento AUTOMATICO E SILENZIOSO
async function checkAndUpdateAutomatically() {
  try {
    console.log('=== CONTROLLO AGGIORNAMENTI AUTOMATICO ===');
    console.log('Timestamp:', new Date().toISOString());
    
    console.log(`Scaricamento informazioni da: ${updateJsonUrl}`);
    const response = await fetch(updateJsonUrl);
    
    if (!response.ok) {
      console.error(`Errore scaricamento: ${response.status}`);
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
      console.log('Inizio aggiornamento automatico...');
      
      let updatedFiles = [];
      
      for (const fileInfo of changedFiles) {
        console.log(`Aggiornamento: ${fileInfo.path}`);
        
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
        console.log('*** AGGIORNAMENTO APPLICATO - RIAVVIO AUTOMATICO ***');
        
        // Riavvia l'applicazione automaticamente
        app.relaunch();
        app.exit(0);
      }
      
      return {
        success: true,
        updatedFiles: updatedFiles,
        version: updateData.version
      };
      
    } else {
      console.log('Tutti i file sono già aggiornati');
      return { success: true, updatedFiles: [], message: 'Tutto aggiornato' };
    }
    
  } catch (error) {
    console.error('Errore durante controllo aggiornamenti automatico:', error);
    return { success: false, error: error.message };
  }
}

// Controllo aggiornamenti per controlli periodici (senza dialog)
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
      console.log(`Trovati ${changedFiles.length} file da aggiornare - Applicazione aggiornamenti...`);
      
      let updatedFiles = [];
      
      for (const fileInfo of changedFiles) {
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
          if (localHash !== null) {
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
      
      if (updatedFiles.some(file => file.includes('requirements.txt'))) {
        await installPythonRequirements();
      }
      
      if (updatedFiles.length > 0) {
        console.log('*** AGGIORNAMENTO PERIODICO APPLICATO ***');
        console.log(`File aggiornati: ${updatedFiles.join(', ')}`);
      }
      
      return {
        success: true,
        updatedFiles: updatedFiles,
        version: updateData.version
      };
      
    } else {
      console.log('Controllo periodico: tutto aggiornato');
      return { success: true, updatedFiles: [], message: 'Tutto aggiornato' };
    }
    
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
  mainWindow.loadFile('index.html');
  
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

function startPeriodicUpdates() {
  setInterval(async () => {
    console.log('Controllo periodico aggiornamenti...');
    await checkPeriodicUpdates();
  }, 5 * 60 * 1000);
}

// FLUSSO: Controllo automatico → Setup Python → Avvio app → Controlli periodici
app.whenReady().then(async () => {
  console.log('Applicazione avviata');
  
  // PRIMA: Controllo aggiornamenti automatico (può riavviare l'app)
  console.log('Controllo aggiornamenti automatico...');
  await checkAndUpdateAutomatically();
  
  // DOPO: Setup Python e avvio app (solo se non c'è stato riavvio)
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema durante configurazione Python');
  }
  
  createWindow();
  
  // Avvia controlli periodici automatici
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
