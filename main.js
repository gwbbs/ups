const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

// === FUNZIONI PER PERCORSI PYTHON ===

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

// === SISTEMA CONTROLLO TUTTI I FILE ===

// Funzione per calcolare hash dei file
function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fileContent = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileContent).digest('hex');
}

// Funzione per ottenere ricorsivamente tutti i file da GitHub
async function getAllFilesFromGitHub(repo, branch, directory = '') {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${directory}?ref=${branch}`;
  
  try {
    const response = await fetch(apiUrl);
    const items = await response.json();
    
    if (!Array.isArray(items)) {
      console.error('Errore nel recupero file da GitHub:', items.message);
      return [];
    }
    
    let allFiles = [];
    
    for (const item of items) {
      if (item.type === 'file') {
        allFiles.push(item.path);
      } else if (item.type === 'dir') {
        const subFiles = await getAllFilesFromGitHub(repo, branch, item.path);
        allFiles = allFiles.concat(subFiles);
      }
    }
    
    return allFiles;
  } catch (error) {
    console.error(`Errore nel recupero file da ${directory}:`, error);
    return [];
  }
}

// Funzione principale che controlla TUTTI i file
async function checkAndUpdateAllFiles() {
  try {
    console.log('Controllo TUTTI i file su GitHub...');
    
    const repo = 'gwbbs/ups';
    
    // Ottieni info repository
    const repoUrl = `https://api.github.com/repos/${repo}`;
    const repoResponse = await fetch(repoUrl);
    
    if (!repoResponse.ok) {
      return { success: false, error: 'Repository non accessibile' };
    }
    
    const repoInfo = await repoResponse.json();
    const branch = repoInfo.default_branch;
    
    console.log('Branch utilizzata:', branch);
    
    // Ottieni TUTTI i file dalla repository
    console.log('Recupero lista completa file...');
    const allFiles = await getAllFilesFromGitHub(repo, branch);
    
    if (allFiles.length === 0) {
      console.log('Nessun file trovato nella repository');
      return { success: false, error: 'Nessun file trovato' };
    }
    
    console.log(`Trovati ${allFiles.length} file nella repository`);
    const relevantFiles = allFiles.filter(file => {
      const excludePatterns = [
        /\.git/,
        /node_modules/,
        /downloads\//,
        /dist\//,
        /build\//
      ];
      
      return !excludePatterns.some(pattern => pattern.test(file));
    });
    
    console.log(`File da controllare: ${relevantFiles.length}`);
    
    let updatedFiles = [];
    let changedFiles = [];
    
    // Controlla OGNI SINGOLO FILE
    for (const file of relevantFiles) {
      const localPath = app.isPackaged 
        ? path.join(process.resourcesPath, file)
        : path.join(__dirname, file);
      
      console.log(`Controllo file: ${file}`);
      
      try {
        // Scarica il file da GitHub
        const fileUrl = `https://api.github.com/repos/${repo}/contents/${file}?ref=${branch}`;
        const fileResponse = await fetch(fileUrl);
        const fileData = await fileResponse.json();
        
        if (fileData.message === 'Not Found') {
          console.log(`File ${file} non trovato su GitHub`);
          continue;
        }
        
        if (fileData.content) {
          const remoteContent = Buffer.from(fileData.content, 'base64').toString('utf8');
          const remoteHash = crypto.createHash('sha256').update(remoteContent).digest('hex');
          
          // Calcola hash locale
          const localHash = calculateFileHash(localPath);
          
          // Confronta hash
          if (localHash !== remoteHash) {
            console.log(`DIFFERENZA RILEVATA: ${file}`);
            changedFiles.push(file);
          }
        }
        
      } catch (error) {
        console.error(`Errore controllo ${file}:`, error.message);
      }
    }
    
    console.log(`Controllo completato. File modificati: ${changedFiles.length}`);
    
    // Se ci sono file modificati, chiedi aggiornamento
    if (changedFiles.length > 0) {
      console.log('File modificati trovati:', changedFiles);
      
      // Mostra dialog di aggiornamento
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Aggiornamenti Disponibili',
        message: `Trovati ${changedFiles.length} file modificati. Vuoi aggiornarli?`,
        detail: `File modificati:\n${changedFiles.join('\n')}`,
        buttons: ['Aggiorna', 'Annulla'],
        defaultId: 0
      });
      
      if (result.response === 0) {
        // Utente ha scelto di aggiornare
        console.log('Inizio aggiornamento file...');
        
        for (const file of changedFiles) {
          const localPath = app.isPackaged 
            ? path.join(process.resourcesPath, file)
            : path.join(__dirname, file);
          
          try {
            const fileUrl = `https://api.github.com/repos/${repo}/contents/${file}?ref=${branch}`;
            const fileResponse = await fetch(fileUrl);
            const fileData = await fileResponse.json();
            
            if (fileData.content) {
              const fileContent = Buffer.from(fileData.content, 'base64').toString('utf8');
              
              // Crea directory se non esiste
              fs.mkdirSync(path.dirname(localPath), { recursive: true });
              
              // Scrivi il file aggiornato
              fs.writeFileSync(localPath, fileContent);
              updatedFiles.push(file);
              
              console.log(`Aggiornato: ${file}`);
            }
            
          } catch (error) {
            console.error(`Errore aggiornamento ${file}:`, error.message);
          }
        }
        
        // Se requirements.txt è stato aggiornato, reinstalla moduli
        if (updatedFiles.some(file => file.includes('requirements.txt'))) {
          console.log('Requirements.txt aggiornato, reinstallo moduli Python...');
          await installPythonRequirements();
        }
        
        // Mostra risultato
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Aggiornamento Completato',
          message: `Aggiornati ${updatedFiles.length} file con successo!`,
          detail: `File aggiornati:\n${updatedFiles.join('\n')}`,
          buttons: ['OK']
        });
        
        return {
          success: true,
          updatedFiles: updatedFiles,
          message: `Aggiornati ${updatedFiles.length} file`
        };
      } else {
        return {
          success: true,
          updatedFiles: [],
          message: 'Aggiornamento annullato dall\'utente'
        };
      }
    } else {
      console.log('Nessun file modificato');
      return {
        success: true,
        updatedFiles: [],
        message: 'Tutti i file sono già aggiornati'
      };
    }
    
  } catch (error) {
    console.error('Errore controllo file:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// === RESTO DEL CODICE ===

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
    const cmd = `"${pythonExe}" -m pip install -r "${requirementsPath}"`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore installazione requirements:', err);
        resolve();
      } else {
        console.log('Moduli Python installati con successo');
        resolve();
      }
    });
  });
}

function updateRequirements() {
  return new Promise((resolve, reject) => {
    const sourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sources')
      : path.join(__dirname, 'sources');
    
    const cmd = `pipreqs "${sourcesPath}" --force`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Errore aggiornamento requirements:', err);
        resolve();
      } else {
        console.log('Requirements.txt aggiornato con successo');
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
    
    await installPythonRequirements();
    
    console.log('=== SETUP DIPENDENZE COMPLETATO ===');
    return true;
  } catch (error) {
    console.error('Errore nel setup dipendenze Python:', error);
    return false;
  }
}

// === HANDLERS IPC ===

ipcMain.handle('run-python', async (event, scriptName, argsArray = []) => {
  const pythonExe = getEmbedPyPath();
  const pythonScript = getScriptPath(scriptName);
  const argString = argsArray.map(a => `"${a}"`).join(' ');
  const cmd = `"${pythonExe}" "${pythonScript}" ${argString}`;
  
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

// Handler per controllo file
ipcMain.handle('check-file-updates', async () => {
  return await checkAndUpdateAllFiles();
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

// Controllo periodico ogni 5 minuti
function startPeriodicUpdates() {
  setInterval(async () => {
    console.log('Controllo periodico file...');
    await checkAndUpdateAllFiles();
  }, 5 * 60 * 1000); // 5 minuti
}

// === APP LIFECYCLE ===

app.whenReady().then(async () => {
  console.log('App pronta, inizializzo...');
  
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema nel setup Python, continuo comunque...');
  }
  
  createWindow();
  
  // Controlla aggiornamenti dopo 3 secondi dall'avvio
  setTimeout(async () => {
    console.log('Controllo aggiornamenti iniziale...');
    await checkAndUpdateAllFiles();
  }, 3000);
  
  // Avvia controllo periodico
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
