// js/ui.js
// Deze module beheert alle gebruikersinterface-gerelateerde interacties en DOM-manipulatie.
// Het bevat functies voor het tonen van statusmeldingen, het beheren van panelen,
// en het afhandelen van zoekfunctionaliteit en laagbediening.

import { addMarker, highlightPolygon, removeHighlight, toggleLayer, toggleMeasurement, clearMeasurements } from './map.js';
import { searchKvkViaSuggest, getKvkCompanyDetails } from './openkvk.js';

// ========================================
// DEBUG & UTILITY FUNCTIONS
// ========================================

/**
 * Logt een bericht naar de console met een prefix.
 * @param {string} message - Het te loggen bericht.
 */
export function log(message) {
    console.log('WebGIS Debug:', message);
}

/**
 * Toont een statusmelding aan de gebruiker.
 * @param {string} message - Het bericht dat moet worden weergegeven.
 * @param {'info'|'success'|'error'} [type='info'] - Het type melding (bepaalt de styling).
 */
export function showStatus(message, type = 'info') {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    // Stel de CSS-klasse in op basis van het type melding
    indicator.className = `status-indicator ${type}`;
    text.textContent = message;
    indicator.style.display = 'block'; // Toon de indicator
    
    // Verberg de indicator na 3 seconden
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 3000);
}

/**
 * Toont het informatiepaneel.
 */
export function showInfoPanel() {
    document.getElementById('infoPanel').style.display = 'block';
}

/**
 * Verbergt het informatiepaneel en reset de inhoud.
 * Verwijdert ook de huidige highlight van de kaart.
 */
export function hideInfoPanel() {
    document.getElementById('infoPanel').style.display = 'none';
    document.getElementById('infoContent').innerHTML = '<p>Klik op een pand om informatie te bekijken</p>';
    document.getElementById('kvkContent').innerHTML = '';
    document.getElementById('kvkSection').style.display = 'none';
    removeHighlight(); // Verwijder de highlight als het info-paneel wordt gesloten
}

// ========================================
// UI INITIALIZATION & EVENT LISTENERS
// ========================================

/**
 * Initialiseert alle UI-elementen en voegt event listeners toe.
 */
export function initUI() {
    log('Initializing UI...');

    // Haal DOM-elementen op
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResultsDiv = document.getElementById('searchResults');
    const kvkSearchInput = document.getElementById('kvkSearchInput');
    const kvkSearchBtn = document.getElementById('kvkSearchBtn');

    const searchTabAddress = document.getElementById('searchTabAddress');
    const searchTabKvk = document.getElementById('searchTabKvk');
    const addressSearchDiv = document.getElementById('addressSearch');
    const kvkSearchDiv = document.getElementById('kvkSearch');

    // Event listeners voor zoektabs
    searchTabAddress.addEventListener('click', () => {
        // Activeer de adres-tab en deactiveer de KVK-tab
        searchTabKvk.classList.remove('active');
        searchTabKvk.style.borderBottomColor = 'transparent';
        searchTabKvk.style.color = '#666';
        searchTabAddress.classList.add('active');
        searchTabAddress.style.borderBottomColor = '#76bc94';
        searchTabAddress.style.color = '#76bc94';

        // Toon de adres zoekvelden en verberg KVK zoekvelden
        addressSearchDiv.style.display = 'block';
        kvkSearchDiv.style.display = 'none';
        searchResultsDiv.innerHTML = ''; // Wis resultaten bij wisselen tab
        searchInput.value = ''; // Wis inputveld
    });

    searchTabKvk.addEventListener('click', () => {
        // Activeer de KVK-tab en deactiveer de adres-tab
        searchTabAddress.classList.remove('active');
        searchTabAddress.style.borderBottomColor = 'transparent';
        searchTabAddress.style.color = '#666';
        searchTabKvk.classList.add('active');
        searchTabKvk.style.borderBottomColor = '#76bc94';
        searchTabKvk.style.color = '#76bc94';

        // Toon de KVK zoekvelden en verberg adres zoekvelden
        kvkSearchDiv.style.display = 'block';
        addressSearchDiv.style.display = 'none';
        searchResultsDiv.innerHTML = ''; // Wis resultaten bij wisselen tab
        kvkSearchInput.value = ''; // Wis inputveld
    });

    // Event listeners voor adres zoeken
    searchBtn.addEventListener('click', () => performAddressSearch(searchInput.value));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performAddressSearch(searchInput.value);
        }
    });

    /**
     * Voert een adreszoekopdracht uit via de PDOK LocatieServer.
     * @param {string} query - De zoekterm voor het adres.
     */
    async function performAddressSearch(query) {
        showStatus('Adres zoeken...', 'info');
        searchResultsDiv.innerHTML = ''; // Wis eerdere resultaten
        hideInfoPanel(); // Verberg info paneel

        if (!query) {
            showStatus('Voer een zoekterm in voor adres.', 'error');
            return;
        }

        const PDOK_LOCATIESERVER_SUGGEST_URL = `https://geodata.nationaalgeoregister.nl/locatieserver/v3/suggest?wt=json&q=${encodeURIComponent(query)}`;
        const PDOK_LOCATIESERVER_LOOKUP_URL = `https://geodata.nationaalgeoregister.nl/locatieserver/v3/lookup?wt=json&id=`;

        try {
            const suggestResponse = await fetch(PDOK_LOCATIESERVER_SUGGEST_URL);
            if (!suggestResponse.ok) throw new Error(`HTTP error! status: ${suggestResponse.status}`);
            const suggestData = await suggestResponse.json();

            if (suggestData.response && suggestData.response.docs && suggestData.response.docs.length > 0) {
                showStatus(`${suggestData.response.docs.length} adres suggesties gevonden.`, 'success');
                for (const doc of suggestData.response.docs) {
                    // Voor elk suggestie-resultaat, voer een lookup uit voor gedetailleerde info
                    const lookupResponse = await fetch(PDOK_LOCATIESERVER_LOOKUP_URL + doc.id);
                    if (!lookupResponse.ok) throw new Error(`HTTP error! status: ${lookupResponse.status}`);
                    const lookupData = await lookupResponse.json();
                    
                    if (lookupData.response && lookupData.response.docs && lookupData.response.docs.length > 0) {
                        const result = lookupData.response.docs[0];
                        const resultDiv = document.createElement('div');
                        resultDiv.className = 'search-result';
                        resultDiv.innerHTML = `<strong>${result.weergavenaam}</strong><br>${result.postcode || ''} ${result.woonplaatsnaam || ''}`;
                        
                        // Voeg klik-event toe om naar het adres te zoomen
                        resultDiv.addEventListener('click', () => {
                            if (result.geometrie_ll) {
                                try {
                                    const geojson = JSON.parse(result.geometrie_ll);
                                    highlightPolygon(geojson, `<strong>${result.weergavenaam}</strong>`);
                                } catch (parseError) {
                                    console.error('Error parsing GeoJSON for address:', parseError);
                                    addMarker(result.y, result.x, `<strong>${result.weergavenaam}</strong>`);
                                }
                            } else if (result.x && result.y) {
                                addMarker(result.y, result.x, `<strong>${result.weergavenaam}</strong>`);
                            } else {
                                showStatus('Geen coördinaten of geometrie gevonden voor dit adres.', 'error');
                            }
                            searchResultsDiv.innerHTML = ''; // Wis resultaten na selectie
                            searchInput.value = result.weergavenaam; // Vul het inputveld
                        });
                        searchResultsDiv.appendChild(resultDiv);
                    }
                }
            } else {
                searchResultsDiv.innerHTML = '<p>Geen adres gevonden.</p>';
                showStatus('Geen adres gevonden.', 'info');
            }
        } catch (error) {
            console.error('Error fetching address data:', error);
            searchResultsDiv.innerHTML = `<p class="kvk-error">Fout bij zoeken naar adres: ${error.message}</p>`;
            showStatus('Fout bij zoeken naar adres.', 'error');
        }
    }

    // Event listeners voor KVK zoeken
    kvkSearchBtn.addEventListener('click', () => performKvkSearch(kvkSearchInput.value));
    kvkSearchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            performKvkSearch(kvkSearchInput.value);
        }
    });

    /**
     * Voert een KVK-zoekopdracht uit via de Overheid.io suggest API.
     * @param {string} query - De zoekterm voor KVK (nummer of bedrijfsnaam).
     */
    async function performKvkSearch(query) {
        showStatus('KVK zoeken...', 'info');
        searchResultsDiv.innerHTML = ''; // Wis eerdere resultaten
        hideInfoPanel(); // Verberg info paneel

        if (!query) {
            showStatus('Voer een zoekterm in voor KVK.', 'error');
            return;
        }

        const companies = await searchKvkViaSuggest(query);
        if (companies.length > 0) {
            showStatus(`${companies.length} KVK bedrijven gevonden.`, 'success');
            companies.forEach(company => {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'kvk-search-result';
                resultDiv.innerHTML = `
                    <div class="kvk-result-name">${company.naam}</div>
                    <div class="kvk-result-details">KVK: ${company.kvkNummer} | Postcode: ${company.postcode || 'Onbekend'}</div>
                `;
                resultDiv.addEventListener('click', async () => {
                    showStatus(`Details laden voor ${company.naam}...`, 'info');
                    const detailedCompany = await getKvkCompanyDetails(company.link);
                    if (detailedCompany && detailedCompany.adres && detailedCompany.adres.straatnaam && detailedCompany.adres.huisnummer) {
                        const addressString = `${detailedCompany.adres.straatnaam} ${detailedCompany.adres.huisnummer}, ${detailedCompany.adres.postcode} ${detailedCompany.adres.plaats}`;
                        // Probeer via LocatieServer de coördinaten op te halen voor het adres van het bedrijf
                        const PDOK_LOCATIESERVER_FREE_URL = `https://geodata.nationaalgeoregister.nl/locatieserver/v3/free?q=${encodeURIComponent(addressString)}&wt=json&rows=1`;
                        
                        try {
                            const response = await fetch(PDOK_LOCATIESERVER_FREE_URL);
                            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                            const data = await response.json();

                            if (data.response && data.response.docs && data.response.docs.length > 0) {
                                const geoResult = data.response.docs[0];
                                if (geoResult.x && geoResult.y) {
                                    addMarker(geoResult.y, geoResult.x, `<strong>${detailedCompany.naam}</strong><br>${addressString}`);
                                    showStatus(`Locatie van ${detailedCompany.naam} gevonden.`, 'success');
                                } else {
                                    showStatus('Geen precieze locatie gevonden voor dit KVK bedrijf.', 'info');
                                    log(`No precise location for KVK company: ${addressString}`);
                                }
                            } else {
                                showStatus('Geen precieze locatie gevonden voor dit KVK bedrijf.', 'info');
                                log(`No location server results for KVK company: ${addressString}`);
                            }
                        } catch (geoError) {
                            console.error('Error fetching geo data for KVK company:', geoError);
                            showStatus('Fout bij ophalen van locatie voor KVK bedrijf.', 'error');
                        }
                    } else {
                        showStatus('Geen adresinformatie beschikbaar om te lokaliseren.', 'info');
                    }
                    searchResultsDiv.innerHTML = ''; // Wis resultaten na selectie
                    kvkSearchInput.value = detailedCompany ? detailedCompany.naam : query; // Vul het inputveld
                });
                searchResultsDiv.appendChild(resultDiv);
            });
        } else {
            searchResultsDiv.innerHTML = '<p>Geen KVK bedrijven gevonden.</p>';
            showStatus('Geen KVK bedrijven gevonden.', 'info');
        }
    }

    // Event listeners voor kaartlagen controls
    document.getElementById('bagLayer').addEventListener('change', (e) => toggleLayer('bagLayer', e.target.checked));
    document.getElementById('osmLayer').addEventListener('change', (e) => toggleLayer('osmLayer', e.target.checked));
    document.getElementById('topoLayer').addEventListener('change', (e) => toggleLayer('topoLayer', e.target.checked));
    document.getElementById('luchtfotoLayer').addEventListener('change', (e) => toggleLayer('luchtfotoLayer', e.target.checked));

    // Event listeners voor meettools
    document.getElementById('measureDistance').addEventListener('click', () => toggleMeasurement('distance'));
    document.getElementById('measureArea').addEventListener('click', () => toggleMeasurement('area'));
    document.getElementById('clearMeasurements').addEventListener('click', clearMeasurements);

    // Event listener voor het sluiten van het info paneel
    document.getElementById('closeInfo').addEventListener('click', hideInfoPanel);

    log('UI initialized.');
}
