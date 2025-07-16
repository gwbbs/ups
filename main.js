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

// === SISTEMA TRACKING COMMIT ===

// Percorso per salvare l'ultimo commit SHA
function getLastCommitFilePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'last_commit.txt')
    : path.join(__dirname, 'last_commit.txt');
}

// Legge l'ultimo commit SHA salvato
function getLastCommitSHA() {
  const filePath = getLastCommitFilePath();
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return null;
}

// Salva l'ultimo commit SHA
function saveLastCommitSHA(sha) {
  const filePath = getLastCommitFilePath();
  fs.writeFileSync(filePath, sha);
}

// === SISTEMA AGGIORNAMENTO INCREMENTALE INTELLIGENTE ===

// Ottiene i file modificati tra due commit
async function getChangedFilesBetweenCommits(repo, branch, oldCommitSHA, newCommitSHA) {
  try {
    const apiUrl = `https://api.github.com/repos/${repo}/compare/${oldCommitSHA}...${newCommitSHA}`;
    
    const response = await fetch(apiUrl);
    const compareData = await response.json();
    
    if (compareData.status === 'identical') {
      console.log('Nessun cambiamento rilevato');
      return [];
    }
    
    // Estrae i file modificati
    const changedFiles = compareData.files.map(file => ({
      filename: file.filename,
      status: file.status, // 'added', 'modified', 'removed'
      patch: file.patch
    }));
    
    console.log(`Trovati ${changedFiles.length} file modificati`);
    return changedFiles;
    
  } catch (error) {
    console.error('Errore nel recupero file modificati:', error);
    return [];
  }
}

// Funzione principale di aggiornamento intelligente
async function checkAndUpdateChangedFiles() {
  try {
    console.log('Controllo file modificati su GitHub...');
    
    const repo = 'gwbbs/ups';
    
    // Ottieni info repository
    const repoUrl = `https://api.github.com/repos/${repo}`;
    const repoResponse = await fetch(repoUrl);
    
    if (!repoResponse.ok) {
      return { success: false, error: 'Repository non accessibile' };
    }
    
    const repoInfo = await repoResponse.json();
    const branch = repoInfo.default_branch;
    
    // Ottieni l'ultimo commit SHA del branch
    const branchUrl = `https://api.github.com/repos/${repo}/branches/${branch}`;
    const branchResponse = await fetch(branchUrl);
    const branchData = await branchResponse.json();
    const latestCommitSHA = branchData.commit.sha;
    
    console.log('Ultimo commit GitHub:', latestCommitSHA.substring(0, 7));
    
    // Leggi l'ultimo commit SHA salvato localmente
    const lastKnownSHA = getLastCommitSHA();
    
    if (!lastKnownSHA) {
      console.log('Prima esecuzione, salvo commit corrente senza aggiornare file');
      saveLastCommitSHA(latestCommitSHA);
      return {
        success: true,
        updatedFiles: [],
        message: 'Prima esecuzione - commit SHA salvato'
      };
    }
    
    if (lastKnownSHA === latestCommitSHA) {
      console.log('Nessun nuovo commit, tutto aggiornato');
      return {
        success: true,
        updatedFiles: [],
        message: 'Nessun nuovo commit rilevato'
      };
    }
    
    console.log('Nuovo commit rilevato, controllo file modificati...');
    console.log(`Confronto: ${lastKnownSHA.substring(0, 7)} → ${latestCommitSHA.substring(0, 7)}`);
    
    // Ottieni solo i file modificati
    const changedFiles = await getChangedFilesBetweenCommits(repo, branch, lastKnownSHA, latestCommitSHA);
    
    if (changedFiles.length === 0) {
      console.log('Nessun file da aggiornare');
      saveLastCommitSHA(latestCommitSHA);
      return {
        success: true,
        updatedFiles: [],
        message: 'Nessun file modificato'
      };
    }
    
    let updatedFiles = [];
    
    // Processa solo i file modificati
    for (const file of changedFiles) {
      const filename = file.filename;
      
      // Filtra file non necessari
      const excludePatterns = [
        /\.git/,
        /node_modules/,
        /\.md$/,
        /package\.json$/,
        /package-lock\.json$/,
        /\.exe$/,
        /\.dll$/,
        /dist\//,
        /build\//,
        /media\/embedpy/,
        /downloads\//
      ];
      
      if (excludePatterns.some(pattern => pattern.test(filename))) {
        console.log(`Saltato file escluso: ${filename}`);
        continue;
      }
      
      const localPath = app.isPackaged 
        ? path.join(process.resourcesPath, filename)
        : path.join(__dirname, filename);
      
      try {
        if (file.status === 'removed') {
          // File cancellato
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
            console.log(`Rimosso: ${filename}`);
            updatedFiles.push(filename);
          }
        } else {
          // File aggiunto o modificato
          const fileUrl = `https://api.github.com/repos/${repo}/contents/${filename}?ref=${latestCommitSHA}`;
          const fileResponse = await fetch(fileUrl);
          const fileData = await fileResponse.json();
          
          if (fileData.content) {
            const fileContent = Buffer.from(fileData.content, 'base64').toString('utf8');
            
            // Assicurati che la directory esista
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            
            // Scrivi il file
            fs.writeFileSync(localPath, fileContent);
            
            const status = file.status === 'added' ? 'Aggiunto' : 'Modificato';
            console.log(`${status}: ${filename}`);
            updatedFiles.push(filename);
          }
        }
      } catch (error) {
        console.error(`Errore aggiornamento ${filename}:`, error.message);
      }
    }
    
    // Salva il nuovo commit SHA
    saveLastCommitSHA(latestCommitSHA);
    
    // Se sono stati aggiornati dei requirements, reinstalla i moduli
    if (updatedFiles.some(file => file.includes('requirements.txt'))) {
      console.log('Requirements.txt aggiornato, reinstallo moduli Python...');
      await installPythonRequirements();
    }
    
    return {
      success: true,
      updatedFiles: updatedFiles,
      message: updatedFiles.length > 0 
        ? `Aggiornati ${updatedFiles.length} file dal nuovo commit`
        : 'Nessun file rilevante modificato'
    };
    
  } catch (error) {
    console.error('Errore controllo commit:', error);
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

// Handler per aggiornamento intelligente
ipcMain.handle('check-file-updates', async () => {
  return await checkAndUpdateChangedFiles();
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

// Aggiornamenti periodici intelligenti
function startPeriodicSmartUpdates() {
  setInterval(async () => {
    console.log('Controllo periodico commit...');
    const result = await checkAndUpdateChangedFiles();
    
    if (result.success && result.updatedFiles.length > 0) {
      console.log('File aggiornati automaticamente:', result.updatedFiles);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('files-updated', {
          files: result.updatedFiles,
          message: result.message
        });
      }
    }
  }, 10 * 60 * 1000); // 10 minuti
}

// === AUTO-UPDATER (per setup completo) ===

autoUpdater.on('checking-for-update', () => {
  console.log('Controllo aggiornamenti setup...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Aggiornamento setup disponibile');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento App Disponibile',
    message: 'È disponibile una nuova versione dell\'app. Vuoi scaricarla?',
    buttons: ['Sì', 'No']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Nessun aggiornamento setup disponibile');
});

autoUpdater.on('error', (err) => {
  console.error('Errore nell\'aggiornamento setup:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Velocità download: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Scaricato ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', async (info) => {
  console.log('Aggiornamento setup scaricato, setup dipendenze...');
  
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema nel setup Python post-aggiornamento');
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Aggiornamento Pronto',
    message: 'Aggiornamento dell\'app scaricato e dipendenze aggiornate. Verrà installato al riavvio.',
    buttons: ['Riavvia ora', 'Dopo']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// === APP LIFECYCLE ===

app.whenReady().then(async () => {
  console.log('App pronta, inizializzo...');
  
  const pythonSetupOk = await setupPythonDependencies();
  
  if (!pythonSetupOk) {
    console.warn('Problema nel setup Python, continuo comunque...');
  }
  
  // Controlla aggiornamenti intelligenti
  console.log('Controllo commit modificati...');
  const updateResult = await checkAndUpdateChangedFiles();
  
  if (updateResult.success && updateResult.updatedFiles.length > 0) {
    console.log('File aggiornati dai nuovi commit:', updateResult.updatedFiles);
  }
  
  createWindow();
  startPeriodicSmartUpdates();
  
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 15000);
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
