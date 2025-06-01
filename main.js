// js/main.js

// Importeer functies uit andere modules
import { initMap, map } from './map.js';
import { initUI, showStatus, log } from './ui.js';
import { testOverheidApi } from './openkvk.js';

log('Starting WebGIS initialization...');

// Initialiseer de kaart
initMap();

// Initialiseer de UI-elementen
initUI();

// Test de OpenKVK API connectie
testOverheidApi();

log('WebGIS initialization complete.');