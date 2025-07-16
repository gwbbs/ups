// books-renderer.js
class BooksRenderer extends BaseRenderer {
    constructor() {
        super();
        this.currentSource = '';
        this.sourceConfigs = [
            { name: "Anna's Archive", icon: 'fas fa-book-open', script: 'anna.py', enabled: false },
            { name: 'Z-Library', icon: 'fas fa-university', script: 'zlib.py', enabled: false }
        ];
        this.initialize();
    }

    initialize() {
        this.searchInput.placeholder = 'Titolo del libro o ISBN';
        this.updateSourceTabs();
        this.updateStatus('Categoria: Libri');
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
                });
            }

            this.sourceTabsContainer.appendChild(sourceTab);
        });

        const firstEnabled = this.sourceConfigs.find(s => s.enabled);
        if (firstEnabled) {
            this.currentSource = firstEnabled.name;
            this.sourceTabsContainer.querySelector(`[data-source="${firstEnabled.name}"]`).classList.add('active');
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

        const scriptPath = path.join(__dirname, 'sources', sourceConfig.script);
        const scriptArgs = `"${query}" "${source}"`;

        exec(`python "${scriptPath}" ${scriptArgs}`, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error: ${err}`);
                this.showNotification(`Ricerca fallita: ${err.message}`, 'error');
                this.setLoadingState(false);
                this.updateStatus('Errore nella ricerca.');
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

                this.searchResults = results.map(result => ({
                    ...result,
                    source: source,
                    category: 'Books'
                }));

                this.displayResults();
                this.setLoadingState(false);
                this.updateStatus(`Trovati ${this.searchResults.length} risultati da ${source}`);
                
            } catch (parseError) {
                console.error('Errore parsing risultati:', parseError);
                this.showNotification('Errore nel processare i risultati', 'error');
                this.setLoadingState(false);
                this.updateStatus('Errore di parsing');
            }
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
        return `${result.author || 'Autore sconosciuto'} | ${result.size || 'N/A'} | ${result.format || 'N/A'}`;
    }

    showDetails(result) {
        document.getElementById('detail-title').textContent = result.title;
        document.getElementById('detail-info').textContent = this.getMetaInfo(result);
        document.getElementById('detail-link').textContent = result.link || 'Link non disponibile';
        
        this.detailsPanel.classList.add('show');
        this.copyButton.disabled = !result.link;
        this.openButton.disabled = !result.link;
    }

    openContent() {
        if (this.selectedResult && this.selectedResult.link) {
            exec(`start "" "${this.selectedResult.link}"`, (err) => {
                if (err) {
                    this.showNotification('Errore nell\'aprire il link', 'error');
                } else {
                    this.showNotification('Link aperto!', 'success');
                }
            });
        }
    }
}
