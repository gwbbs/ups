document.addEventListener('DOMContentLoaded', () => {
    let currentRenderer = null;
    let currentCategory = 'Games';

    initializeRenderer(currentCategory);

    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const newCategory = tab.dataset.category;
            
            // Evita re-inizializzazione inutile
            if (newCategory === currentCategory) {
                return;
            }
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            currentCategory = newCategory;
            initializeRenderer(currentCategory);
        });
    });

    function initializeRenderer(category) {
        console.log(`DEBUG: Inizializzazione renderer per categoria: ${category}`);
        
        if (currentRenderer) {
            console.log(`DEBUG: Pulizia renderer precedente`);
            currentRenderer.destroy();
            currentRenderer = null;
        }

        clearInterface();
        
        switch (category) {
            case 'Games':
                console.log('DEBUG: Caricamento GamesRenderer');
                currentRenderer = new GamesRenderer();
                break;
                
            case 'Books':
                console.log('DEBUG: Caricamento BooksRenderer');
                currentRenderer = new BooksRenderer();
                break;
                
            case 'Music':
                console.log('DEBUG: Caricamento MusicRenderer');
                currentRenderer = new MusicRenderer();
                break;
                
            default:
                console.error('Categoria non supportata:', category);
                return;
        }

        console.log(`DEBUG: Renderer ${category} caricato con successo`);
    }

    function clearInterface() {
        const resultsList = document.getElementById('results-list');
        const emptyState = document.querySelector('.empty-state');
        const detailsPanel = document.getElementById('details-panel');
        const resultsCount = document.querySelector('.results-count');

        if (resultsList) {
            resultsList.innerHTML = '';
            resultsList.classList.remove('show');
        }

        if (emptyState) {
            emptyState.style.display = 'flex';
        }

        if (detailsPanel) {
            detailsPanel.classList.remove('show');
        }

        if (resultsCount) {
            resultsCount.textContent = '0 risultati';
        }
    }

    // Espone currentRenderer per debug
    window.getCurrentRenderer = () => currentRenderer;
    window.getCurrentCategory = () => currentCategory;

    console.log('Renderer attivo:', window.getCurrentRenderer());
    console.log('Categoria attiva:', window.getCurrentCategory());
});
