// js/main.js
// Dit is het hoofd-entrypoint van de applicatie.
// Het importeert de benodigde modules en initialiseert de applicatie
// nadat de DOM volledig is geladen.

import { initMap } from './map.js';
import { initUI, log } from './ui.js';
import { testOverheidApi } from './openkvk.js';

log('Starting WebGIS initialization...');

// Wacht tot de DOM volledig geladen en geparseerd is voordat scripts worden uitgevoerd.
// Dit voorkomt fouten waarbij scripts proberen elementen te benaderen die nog niet bestaan.
document.addEventListener('DOMContentLoaded', () => {
    log('DOM fully loaded and parsed.');
    
    // Initialiseer de kaartfunctionaliteit
    initMap();

    // Initialiseer de gebruikersinterface-elementen en hun event listeners
    initUI();

    // Test de verbinding met de Overheid.io API
    testOverheidApi();

    log('WebGIS initialization complete.');
});
