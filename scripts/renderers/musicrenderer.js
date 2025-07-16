class MusicRenderer extends BaseRenderer {
    constructor() {
        super();
        this.currentSource = '';
        this.sourceConfigs = [
            { name: 'Spotify', icon: 'fa-brands fa-spotify', script: 'spotify.py', enabled: true },
            { name: 'Youtube', icon: 'fa-brands fa-youtube', script: 'youtube.py', enabled: true }
        ];
        this.initialize();
    }

    initialize() {
        this.updateSourceTabs();
        this.updateStatus('Categoria: Musica');
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
                    this.updatePlaceholder(source.name);
                    this.clearResults();
                });
            }

            this.sourceTabsContainer.appendChild(sourceTab);
        });

        const firstEnabled = this.sourceConfigs.find(s => s.enabled);
        if (firstEnabled) {
            this.currentSource = firstEnabled.name;
            this.sourceTabsContainer.querySelector(`[data-source="${firstEnabled.name}"]`).classList.add('active');
            this.updatePlaceholder(firstEnabled.name);
        }
    }

    handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) {
            this.showNotification('Inserisci una query di ricerca prima.', 'warning');
            return;
        }

        if (!this.currentSource) {
            this.showNotification('Seleziona una sorgente!', 'warning');
            return;
        }

        this.setLoadingState(true);
        this.updateStatus('Ricerca in corso...');
        this.fetchSearchResults(this.currentSource, query);
    }

    fetchSearchResults(source, query) {
        const sourceConfig = this.sourceConfigs.find(s => s.name === source);
        
        if (!sourceConfig || !sourceConfig.enabled) {
            this.showNotification('Sorgente non disponibile', 'error');
            this.setLoadingState(false);
            return;
        }

        const argsArr = [query, "search"];

        console.log(`DEBUG: Esecuzione script: ${sourceConfig.script} con args:`, argsArr);

        window.pyBridge.runPython(sourceConfig.script, argsArr)
            .then(stdout => {
                console.log('=== DEBUG INFO ===');
                console.log('Script:', sourceConfig.script);
                console.log('Args:', argsArr);
                console.log('Stdout length:', stdout ? stdout.length : 0);
                console.log('==================');

                if (!stdout || stdout.trim() === '') {
                    this.showNotification('Nessun output dallo script', 'warning');
                    this.setLoadingState(false);
                    this.updateStatus('Nessun output ricevuto.');
                    return;
                }

                try {
                    const results = JSON.parse(stdout);
                    
                    if (results.error) {
                        this.showNotification(`Errore: ${results.error}`, 'error');
                        this.setLoadingState(false);
                        this.updateStatus('Errore nella ricerca.');
                        return;
                    }

                    if (!Array.isArray(results)) {
                        this.showNotification('Formato risultati non valido', 'error');
                        this.setLoadingState(false);
                        this.updateStatus('Formato risultati errato.');
                        return;
                    }

                    if (results.length === 0) {
                        this.showNotification('Nessun risultato trovato per questa query', 'warning');
                        this.setLoadingState(false);
                        this.updateStatus('Nessun risultato trovato.');
                        this.clearResults();
                        return;
                    }

                    this.searchResults = results.map(result => ({
                        ...result,
                        source: source,
                        category: 'Music'
                    }));

                    this.displayResults();
                    this.setLoadingState(false);
                    this.updateStatus(`Trovati ${this.searchResults.length} risultati da ${source}`);
                    
                } catch (parseError) {
                    console.error('Errore parsing risultati:', parseError);
                    console.error('Raw stdout:', stdout);
                    this.showNotification('Errore nel processare i risultati', 'error');
                    this.setLoadingState(false);
                    this.updateStatus('Errore di parsing');
                }
            })
            .catch(err => {
                console.error(`Error: ${err}`);
                this.showNotification(`Ricerca fallita: ${err}`, 'error');
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

    updatePlaceholder(sourceName) {
        switch(sourceName) {
            case 'Spotify':
                this.searchInput.placeholder = 'Inserisci nome della canzone o link Spotify';
                break;
            case 'Youtube':
                this.searchInput.placeholder = 'Inserisci nome della canzone o link YouTube';
                break;
            default:
                this.searchInput.placeholder = 'Inserisci nome della canzone qui';
        }
    }

    getMetaInfo(result) {
        const artist = result.artist || 'Artista sconosciuto';
        const duration = result.duration || 'N/A';
        const source = result.source || 'Unknown';
        
        return `${artist} | ${duration} | ${source}`;
    }

    showDetails(result) {
        document.getElementById('detail-title').textContent = result.title;
        document.getElementById('detail-info').textContent = this.getMetaInfo(result);
        document.getElementById('detail-link').textContent = result.url || result.download_url || 'Link non disponibile';
        
        this.detailsPanel.classList.add('show');
        this.copyButton.disabled = !(result.url || result.download_url);
        this.openButton.disabled = !(result.url || result.download_url);
    }

    openContent() {
        if (this.selectedResult) {
            this.setLoadingState(true);
            this.updateStatus('Download in corso...');
            this.showNotification(`Avvio download: ${this.selectedResult.title}`, 'info');
            
            // Usa l'URL se disponibile, altrimenti il titolo
            const downloadQuery = this.selectedResult.url || this.selectedResult.title;
            this.downloadDirectly(this.currentSource, downloadQuery);
        }
    }

    downloadDirectly(source, query) {
        const sourceConfig = this.sourceConfigs.find(s => s.name === source);
        
        if (!sourceConfig || !sourceConfig.enabled) {
            this.showNotification('Sorgente non disponibile', 'error');
            this.setLoadingState(false);
            return;
        }

        const argsArr = [query, "download"];

        console.log(`DEBUG: Download script: ${sourceConfig.script} con args:`, argsArr);

        window.pyBridge.runPython(sourceConfig.script, argsArr)
            .then(stdout => {
                this.setLoadingState(false);
                
                console.log('Download stdout:', stdout);

                try {
                    const result = JSON.parse(stdout);
                    
                    if (result.success) {
                        this.showNotification(`Download completato: ${this.selectedResult.title}`, 'success');
                        this.updateStatus('Download completato!');
                    } else {
                        this.showNotification(`Errore download: ${result.error || 'Errore sconosciuto'}`, 'error');
                        this.updateStatus('Errore nel download.');
                    }
                    
                } catch (parseError) {
                    // Se non riesce a parsare, considera il download completato
                    this.showNotification(`Download completato: ${this.selectedResult.title}`, 'success');
                    this.updateStatus('Download completato!');
                }
            })
            .catch(err => {
                this.setLoadingState(false);
                console.error(`Download Error: ${err}`);
                this.showNotification(`Download fallito: ${err}`, 'error');
                this.updateStatus('Errore nel download.');
            });
    }

    copyToClipboard() {
        if (this.selectedResult) {
            const link = this.selectedResult.url || this.selectedResult.download_url;
            if (link) {
                window.electronAPI.writeText(link);
                this.showNotification('Link copiato negli appunti!', 'success');
            }
        }
    }

    // Metodi richiesti dalla classe base
    selectResult(index, element) {
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        element.classList.add('selected');
        this.selectedResult = this.searchResults[index];
        this.showDetails(this.selectedResult);
    }

    hideDetails() {
        this.detailsPanel.classList.remove('show');
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedResult = null;
    }

    clearResults() {
        this.resultsList.innerHTML = '';
        this.emptyState.style.display = 'flex';
        this.resultsCount.textContent = '0 risultati';
        this.hideDetails();
    }
}
