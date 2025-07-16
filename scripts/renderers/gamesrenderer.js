class GamesRenderer extends BaseRenderer {
    constructor() {
        super();
        this.currentSource = 'TPB';
        this.isSearching = false;
        this.searchTimeout = null;
        this.lastSearchParams = null;
        this.sourceConfigs = [
            { name: 'TPB', icon: 'fas fa-ship', script: 'tpb.py', enabled: true }, 
            { name: 'FitGirl', icon: 'fas fa-download', script: 'fitgirl.py', enabled: true },
            { name: 'OnlineFix', icon: 'fas fa-gamepad', script: 'onlinefix.py', enabled: false },
            { name: 'SteamGG', icon: 'fab fa-steam', script: 'steamgg.py', enabled: false }
        ];
        
        this.onlineFixCredentials = {
            username: '',
            password: ''
        };
        
        this.initialize();
    }

    initialize() {
        this.searchInput.placeholder = 'Inserisci qui il titolo del gioco';
        this.updateSourceTabs();
        this.updateStatus('Categoria: Giochi');
    }

    updateSourceTabs() {
        this.sourceTabsContainer.innerHTML = '';

        this.sourceConfigs.forEach(source => {
            const sourceTab = document.createElement('button');
            sourceTab.className = `source-tab ${source.enabled ? '' : 'disabled'}`;
            sourceTab.dataset.source = source.name;
            sourceTab.innerHTML = `
                <i class="${source.icon}"></i>
                <span>${source.name}</span>
            `;

            if (source.enabled) {
                sourceTab.addEventListener('click', () => {
                    document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
                    sourceTab.classList.add('active');
                    this.currentSource = source.name;
                    this.updateStatus(`Sorgente: ${this.currentSource}`);
                    this.clearResults();
                    console.log(`DEBUG: Sorgente selezionata: ${this.currentSource}`);
                });
            }

            this.sourceTabsContainer.appendChild(sourceTab);
        });
        this.currentSource = 'TPB';
        const onlineFixTab = this.sourceTabsContainer.querySelector(`[data-source="TPB"]`);
        if (onlineFixTab) {
            onlineFixTab.classList.add('active');
        }
    }

    handleSearch() {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }

        const query = this.searchInput.value.trim();
        if (!query) {
            this.showNotification('Inserisci una query di ricerca prima.', 'warning');
            return;
        }
        if (this.isSearching) {
            console.log('DEBUG: Ricerca già in corso, ignorata');
            return;
        }

        if (!this.currentSource) {
            this.currentSource = 'OnlineFix';
            const onlineFixTab = this.sourceTabsContainer.querySelector(`[data-source="OnlineFix"]`);
            if (onlineFixTab) {
                document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
                onlineFixTab.classList.add('active');
            }
        }

        // Previeni ricerche duplicate
        const currentParams = `${this.currentSource}:${query}`;
        if (this.lastSearchParams === currentParams) {
            console.log('DEBUG: Ricerca duplicata rilevata, ignorata');
            return;
        }

        this.lastSearchParams = currentParams;
        this.searchTimeout = setTimeout(() => {
            this.executeSearch(query);
        }, 300);
    }

    executeSearch(query) {
        console.log(`DEBUG: Ricerca confermata con sorgente: ${this.currentSource}`);
        this.isSearching = true;
        this.setLoadingState(true);
        this.updateStatus('Ricerca in corso...');
        this.fetchSearchResults(this.currentSource, query);
    }

    fetchSearchResults(source, query) {
        console.log(`DEBUG: fetchSearchResults chiamato con source: ${source}, query: ${query}`);
        
        // Verifica che la sorgente sia quella corretta
        if (source !== this.currentSource) {
            console.log(`DEBUG: Sorgente non corrispondente: ${source} !== ${this.currentSource}`);
            this.isSearching = false;
            return;
        }

        const sourceConfig = this.sourceConfigs.find(s => s.name === source);
        
        if (!sourceConfig || !sourceConfig.enabled) {
            this.showNotification(`Sorgente ${source} non disponibile`, 'error');
            this.setLoadingState(false);
            this.isSearching = false;
            return;
        }

        // Prepara gli argomenti come array
        let argsArr = [];
        if (source === 'OnlineFix') {
            argsArr = [query, "search", this.onlineFixCredentials.username, this.onlineFixCredentials.password];
        } else if (source === 'TPB') {
            argsArr = [query, "TPB"];
        } else if (source === 'FitGirl') {
            argsArr = [query, "FitGirl"];
        } else {
            argsArr = [query, source];
        }

        console.log(`DEBUG: ${source} - Esecuzione script: ${sourceConfig.script} con args:`, argsArr.map(arg => 
            arg === this.onlineFixCredentials.password ? '***' : arg
        ));

        const timeout = setTimeout(() => {
            this.showNotification('Timeout della ricerca', 'error');
            this.setLoadingState(false);
            this.isSearching = false;
            this.updateStatus('Timeout raggiunto');
        }, 60000);

        // Usa il bridge Python invece di exec
        window.pyBridge.runPython(sourceConfig.script, argsArr)
            .then(stdout => {
                clearTimeout(timeout);
                this.isSearching = false;
                
                // Verifica ancora che la sorgente sia corretta
                if (source !== this.currentSource) {
                    console.log(`DEBUG: Risultato ignorato - sorgente cambiata: ${source} !== ${this.currentSource}`);
                    return;
                }

                console.log(`DEBUG: Comando completato per ${source}`);
                
                if (!stdout || stdout.trim() === '') {
                    this.showNotification(`Nessun output dallo script ${source}`, 'warning');
                    this.setLoadingState(false);
                    this.updateStatus('Nessun output ricevuto.');
                    return;
                }

                try {
                    const results = JSON.parse(stdout);
                    
                    if (results.error) {
                        this.showNotification(`Errore da ${source}: ${results.error}`, 'error');
                        this.setLoadingState(false);
                        this.updateStatus('Errore nella ricerca.');
                        return;
                    }

                    if (!Array.isArray(results)) {
                        this.showNotification(`Formato risultati non valido da ${source}`, 'error');
                        this.setLoadingState(false);
                        this.updateStatus('Errore formato risultati');
                        return;
                    }

                    if (results.length === 0) {
                        this.showNotification(`Nessun risultato trovato su ${source}`, 'warning');
                        this.setLoadingState(false);
                        this.updateStatus('Nessun risultato trovato.');
                        this.clearResults();
                        return;
                    }

                    this.searchResults = results.map(result => ({
                        ...result,
                        source: source,
                        category: 'Games'
                    }));

                    this.displayResults();
                    this.setLoadingState(false);
                    this.updateStatus(`Trovati ${this.searchResults.length} risultati da ${source}`);
                    
                } catch (parseError) {
                    console.error('Errore parsing risultati:', parseError);
                    console.error('Raw stdout:', stdout);
                    this.showNotification(`Errore nel processare i risultati da ${source}`, 'error');
                    this.setLoadingState(false);
                    this.updateStatus('Errore di parsing');
                }
            })
            .catch(err => {
                clearTimeout(timeout);
                this.isSearching = false;
                console.error(`Error: ${err}`);
                this.showNotification(`Ricerca fallita su ${source}: ${err}`, 'error');
                this.setLoadingState(false);
                this.updateStatus('Errore nella ricerca.');
            });
    }

    displayResults() {
        this.emptyState.style.display = 'none';
        this.resultsList.innerHTML = '';
        this.resultsList.classList.add('show');
        
        this.resultsCount.textContent = `${this.searchResults.length} risultati`;

        this.searchResults.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            
            let metaInfo = this.getMetaInfo(result);
            
            resultItem.innerHTML = `
                <div class="result-title">${result.title}</div>
                <div class="result-meta">${metaInfo}</div>
            `;
            
            resultItem.addEventListener('click', () => this.selectResult(index, resultItem));
            this.resultsList.appendChild(resultItem);
        });
    }

    getMetaInfo(result) {
        if (result.source === 'TPB') {
            return `${result.size || 'N/A'} | S: ${result.seeders || '0'} | L: ${result.leechers || '0'}`;
        } else if (result.source === 'FitGirl') {
            return result.repacksize ? `Repack: ${result.repacksize}` : `Size: ${result.size || 'N/A'}`;
        } else if (result.source === 'OnlineFix') {
            return `${result.description ? result.description.substring(0, 100) + '...' : 'Gioco da Online-Fix'}`;
        }
        return result.size || 'N/A';
    }

    showDetails(result) {
        document.getElementById('detail-title').textContent = result.title;
        document.getElementById('detail-info').textContent = this.getMetaInfo(result);
        
        let linkText = 'Link non disponibile';
        if (result.magnet) {
            linkText = result.magnet;
        } else if (result.url) {
            linkText = result.url;
        } else if (result.link) {
            linkText = result.link;
        }
        
        document.getElementById('detail-link').textContent = linkText;
        
        this.detailsPanel.classList.add('show');
        this.copyButton.disabled = !(result.magnet || result.url || result.link);
        this.openButton.disabled = !(result.magnet || result.url || result.link);
    }

    openContent() {
    if (this.selectedResult) {
        const link = this.selectedResult.magnet || this.selectedResult.url || this.selectedResult.link;
        
        if (this.selectedResult.source === 'OnlineFix') {
            this.downloadOnlineFixTorrent(this.selectedResult.url);
        } else if (link && link.startsWith('magnet:')) {
            console.log('Aprendo magnet link:', link);
            window.electronAPI.openExternal(link)
                .then(result => {
                    if (result.success) {
                        this.showNotification('Magnet link aperto!', 'success');
                    } else {
                        this.showNotification('Errore nell\'aprire il magnet link', 'error');
                    }
                });
        } else if (link && link.endsWith('.torrent')) {
            // .torrent diretti
            console.log('Aprendo file torrent:', link);
            window.electronAPI.openExternal(link)
                .then(result => {
                    if (result.success) {
                        this.showNotification('File torrent aperto!', 'success');
                    } else {
                        this.showNotification('Errore nell\'aprire il file torrent', 'error');
                    }
                });
        } else if (link) {
            console.log('Aprendo link:', link);
            window.electronAPI.openExternal(link)
                .then(result => {
                    if (result.success) {
                        this.showNotification('Link aperto!', 'success');
                    } else {
                        this.showNotification('Errore nell\'aprire il link', 'error');
                    }
                });
        }
    }
}

    downloadOnlineFixTorrent(gameUrl) {
        this.setLoadingState(true);
        this.updateStatus('Scaricando torrent...');
        this.showNotification('Scaricando torrent da Online-Fix...', 'info');

        const argsArr = [gameUrl, "download", this.onlineFixCredentials.username, this.onlineFixCredentials.password];

        console.log(`DEBUG: Download OnlineFix - Script: onlinefix.py con args:`, argsArr.map(arg => 
            arg === this.onlineFixCredentials.password ? '***' : arg
        ));

        window.pyBridge.runPython('onlinefix.py', argsArr)
            .then(stdout => {
                this.setLoadingState(false);
                
                try {
                    const result = JSON.parse(stdout);
                    
                    if (result.success) {
                        this.showNotification('Torrent scaricato con successo!', 'success');
                        this.updateStatus('Torrent scaricato!');
                        
                        if (result.file_path) {
                            // Apri il torrent con qBittorrent
                            window.electronAPI.openExternal(`C:\\Program Files\\qBittorrent\\qbittorrent.exe "${result.file_path}"`)
                                .then(openResult => {
                                    if (openResult.success) {
                                        this.showNotification('Torrent aperto in qBittorrent!', 'success');
                                    } else {
                                        // Fallback: mostra file nel folder
                                        window.electronAPI.showItemInFolder(result.file_path);
                                    }
                                });
                        }
                    } else {
                        this.showNotification(`Errore download: ${result.error || 'Errore sconosciuto'}`, 'error');
                        this.updateStatus('Errore nel download.');
                    }
                    
                } catch (parseError) {
                    console.error('Errore parsing download result:', parseError);
                    console.error('Raw stdout:', stdout);
                    this.showNotification('Errore nel processare il download', 'error');
                    this.updateStatus('Errore parsing download');
                }
            })
            .catch(err => {
                this.setLoadingState(false);
                console.error(`Download Error: ${err}`);
                this.showNotification(`Download fallito: ${err}`, 'error');
                this.updateStatus('Errore nel download.');
            });
    }

    destroy() {
        super.destroy();
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }
        if (this.isSearching) {
            this.isSearching = false;
        }
    }
}
