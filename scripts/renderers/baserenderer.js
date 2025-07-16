class BaseRenderer {
    constructor() {
        this.isActive = true;
        this.eventListenersAttached = false;
        this.initializeElements();
        this.attachEventListeners();
    }

    initializeElements() {
        this.searchButton = document.getElementById('search-button');
        this.searchInput = document.getElementById('search-query');
        this.resultsList = document.getElementById('results-list');
        this.detailsPanel = document.getElementById('details-panel');
        this.copyButton = document.getElementById('copy-button');
        this.openButton = document.getElementById('open-button');
        this.closeDetailsButton = document.getElementById('close-details');
        this.emptyState = document.querySelector('.empty-state');
        this.resultsCount = document.querySelector('.results-count');
        this.statusText = document.querySelector('.status-text');
        this.sourceTabsContainer = document.getElementById('source-tabs');
    }

    attachEventListeners() {
        if (this.eventListenersAttached) {
            return;
        }

        // Rimuovi tutti gli event listener esistenti
        this.removeEventListeners();

        // Event listener per ricerca
        this.searchHandler = () => {
            if (this.isActive) this.handleSearch();
        };

        this.keypressHandler = (e) => {
            if (e.key === 'Enter' && this.isActive) {
                e.preventDefault();
                this.handleSearch();
            }
        };

        this.copyHandler = () => {
            if (this.isActive) this.copyToClipboard();
        };

        this.openHandler = () => {
            if (this.isActive) this.openContent();
        };

        this.closeHandler = () => {
            if (this.isActive) this.hideDetails();
        };

        this.searchButton.addEventListener('click', this.searchHandler);
        this.searchInput.addEventListener('keypress', this.keypressHandler);
        this.copyButton.addEventListener('click', this.copyHandler);
        this.openButton.addEventListener('click', this.openHandler);
        this.closeDetailsButton.addEventListener('click', this.closeHandler);
        
        this.eventListenersAttached = true;
    }

    removeEventListeners() {
        if (this.searchButton && this.searchHandler) {
            this.searchButton.removeEventListener('click', this.searchHandler);
        }
        if (this.searchInput && this.keypressHandler) {
            this.searchInput.removeEventListener('keypress', this.keypressHandler);
        }
        if (this.copyButton && this.copyHandler) {
            this.copyButton.removeEventListener('click', this.copyHandler);
        }
        if (this.openButton && this.openHandler) {
            this.openButton.removeEventListener('click', this.openHandler);
        }
        if (this.closeDetailsButton && this.closeHandler) {
            this.closeDetailsButton.removeEventListener('click', this.closeHandler);
        }
        this.eventListenersAttached = false;
    }

    destroy() {
        this.isActive = false;
        this.removeEventListeners();
        console.log(`DEBUG: Renderer ${this.constructor.name} distrutto`);
    }

    updateStatus(message) {
        if (this.statusText) {
            this.statusText.textContent = message;
        }
    }

    clearResults() {
        if (this.resultsList) {
            this.resultsList.innerHTML = '';
        }
        if (this.emptyState) {
            this.emptyState.style.display = 'flex';
        }
        if (this.resultsCount) {
            this.resultsCount.textContent = '0 risultati';
        }
        this.hideDetails();
    }

    setLoadingState(loading) {
        if (this.searchButton) {
            this.searchButton.classList.toggle('loading', loading);
            this.searchButton.disabled = loading;
        }
        if (this.searchInput) {
            this.searchInput.disabled = loading;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '1000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            backgroundColor: type === 'success' ? '#ff6f91' : 
                           type === 'warning' ? '#f59e0b' : 
                           type === 'error' ? '#ef4444' : '#d6336c'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    copyToClipboard() {
        if (this.selectedResult) {
            const link = this.selectedResult.magnet || this.selectedResult.url || this.selectedResult.link;
            if (link) {
                // Usa l'API sicura invece di clipboard diretto
                window.electronAPI.writeText(link)
                    .then(() => {
                        this.showNotification('Link copiato negli appunti!', 'success');
                    })
                    .catch(err => {
                        console.error('Errore copia negli appunti:', err);
                        this.showNotification('Errore nel copiare il link', 'error');
                    });
            }
        }
    }

    hideDetails() {
        if (this.detailsPanel) {
            this.detailsPanel.classList.remove('show');
        }
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedResult = null;
    }

    selectResult(index, element) {
        document.querySelectorAll('.result-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        element.classList.add('selected');
        this.selectedResult = this.searchResults[index];
        this.showDetails(this.selectedResult);
    }

    // metodi astratti per classi figlie
    handleSearch() {
        throw new Error('handleSearch deve essere implementato dalla classe figlia');
    }

    getMetaInfo(result) {
        throw new Error('getMetaInfo deve essere implementato dalla classe figlia');
    }

    showDetails(result) {
        throw new Error('showDetails deve essere implementato dalla classe figlia');
    }

    openContent() {
        throw new Error('openContent deve essere implementato dalla classe figlia');
    }
}
