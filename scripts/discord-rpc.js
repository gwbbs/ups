const RPC = require('discord-rpc');

class DiscordRPCManager {
    constructor() {
        this.client = new RPC.Client({ transport: 'ipc' });
        this.clientId = '1394758591784812646';
        this.connected = false;
        this.startTime = Date.now();
        this.currentActivity = null;
        
        this.categoryIcons = {
            'Games': 'games_icon',
            'Music': 'music_icon',
            'Books': 'books_icon'
        };
        
        this.connect();
    }

    async connect() {
        try {
            await this.client.login({ clientId: this.clientId });
            this.connected = true;
            console.log('✓ Discord RPC connesso con successo');
            
            // Imposta attività di default
            this.setIdleActivity();
            
            // Gestisci disconnessione
            this.client.on('disconnected', () => {
                this.connected = false;
                console.log('Discord RPC disconnesso');
            });
            
        } catch (error) {
            console.error('✗ Errore connessione Discord RPC:', error);
            this.connected = false;
        }
    }

    isConnected() {
        return this.connected;
    }

    getCurrentTime() {
        return new Date().toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    safeUpdate(activity) {
        if (!this.connected) return;
        
        try {

            if (JSON.stringify(this.currentActivity) === JSON.stringify(activity)) {
                return;
            }
            
            this.client.setActivity(activity);
            this.currentActivity = activity;
            console.log(`DEBUG: Discord RPC aggiornato - ${activity.details}`);
            
        } catch (error) {
            console.error('Errore aggiornamento Discord RPC:', error);
        }
    }

    setIdleActivity() {
        const activity = {
            details: 'UPS - Ultimate Piracy Scraper',
            state: `Categoria: In attesa`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: 'idle_icon',
            smallImageText: 'Idle',
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraoer'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    setCategoryActivity(category) {
        const activity = {
            details: 'Ultimate Piracy Scraper',
            state: `Categoria: ${category}`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: this.categoryIcons[category] || 'idle_icon',
            smallImageText: `Categoria ${category}`,
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraper'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    setSearchingActivity(category, source, query) {
        const activity = {
            details: 'Ultimate Piracy Scraper',
            state: `Categoria: ${category} - Ricerca in corso`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: 'search_icon',
            smallImageText: `Sorgente: ${source}`,
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraper'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    setDownloadingActivity(title, source) {
        const activity = {
            details: 'UPS - Ultimate Piracy Scraper',
            state: `Time: ${this.getCurrentTime()} | Categoria: Download in corso`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: 'download_icon',
            smallImageText: `Da ${source}: ${title.length > 20 ? title.substring(0, 20) + '...' : title}`,
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraper'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    setResultsActivity(category, source, count) {
        const activity = {
            details: 'UPS - Ultimate Piracy Scraper',
            state: `Time: ${this.getCurrentTime()} | Categoria: ${category} - ${count} risultati`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: 'search_icon',
            smallImageText: `Sorgente: ${source}`,
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraper'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    setErrorActivity(errorMsg) {
        const activity = {
            details: 'UPS - Ultimate Piracy Scraper',
            state: `Time: ${this.getCurrentTime()} | Categoria: Errore - ${errorMsg.length > 30 ? errorMsg.substring(0, 30) + '...' : errorMsg}`,
            startTimestamp: this.startTime,
            largeImageKey: 'app_icon',
            largeImageText: 'UPS - Ultimate Piracy Scraper',
            smallImageKey: 'error_icon',
            smallImageText: 'Errore',
            buttons: [
                {
                    label: 'Scarica UPS!',
                    url: 'https://github.com/gwbbs/upsscraper'
                }
            ],
            instance: false
        };
        
        this.safeUpdate(activity);
    }

    disconnect() {
        if (this.connected) {
            this.client.destroy();
            this.connected = false;
            console.log('Discord RPC disconnesso');
        }
    }
}

module.exports = DiscordRPCManager;
