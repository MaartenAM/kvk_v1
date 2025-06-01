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
 * Toont een statusmelding aan de gebruiker.
 * Gebruikt de desktop statusIndicator of de mobiele infoBar afhankelijk van schermbreedte.
 * @param {string} message - Het bericht dat moet worden weergegeven.
 * @param {'info'|'success'|'error'} [type='info'] - Het type melding (bepaalt de styling).
 */
export function showStatus(message, type = 'info') {
    const isMobile = window.innerWidth <= 768; // Definieer mobiel breakpoint

    if (isMobile) {
        const infoBar = document.getElementById('infoBar');
        const infoBarText = document.getElementById('infoBarText');
        
        infoBar.className = `info-bar ${type}`; // Reset classes en voeg nieuwe toe
        infoBarText.textContent = message;
        infoBar.style.display = 'block';
        
        setTimeout(() => {
            infoBar.style.display = 'none';
        }, 3000);
    } else {
        const indicator = document.getElementById('statusIndicator');
        const text = document.getElementById('statusText');
        
        indicator.className = `status-indicator ${type}`;
        text.textContent = message;
        indicator.style.display = 'block';
        
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 3000);
    }
    console.log(`WebGIS Debug: Status: ${message} (${type})`);
}

/**
 * Toont het informatiepaneel.
 */
export function showInfoPanel() {
    document.getElementById('infoPanel').style.display = 'block';
    console.log('WebGIS Debug: Info panel shown.');
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
    console.log('WebGIS Debug: Info panel hidden and highlight removed.');
}

// ========================================
// UI INITIALIZATION & EVENT LISTENERS
// ========================================

/**
 * Initialiseert alle UI-elementen en voegt event listeners toe.
 */
export function initUI() {
    console.log('WebGIS Debug: Initializing UI...');

    // Haal DOM-elementen op voor desktop panelen
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResultsDiv = document.getElementById('searchResults');
    const kvkSearchInput = document.getElementById('kvkSearchInput');
    const kvkSearchBtn = document.getElementById('kvkSearchBtn');

    const searchTabAddress = document.getElementById('searchTabAddress');
    const searchTabKvk = document.getElementById('searchTabKvk');
    const addressSearchDiv = document.getElementById('addressSearch');
    const kvkSearchDiv = document.getElementById('kvkSearch');

    // Haal DOM-elementen op voor mobiele menu panelen
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    const mobileSearchTabAddress = document.getElementById('mobileSearchTabAddress');
    const mobileSearchTabKvk = document.getElementById('mobileSearchTabKvk');
    const mobileAddressSearchDiv = document.getElementById('mobileAddressSearch');
    const mobileKvkSearchDiv = document.getElementById('mobileKvkSearch');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');
    const mobileKvkSearchInput = document.getElementById('mobileKvkSearchInput');
    const mobileKvkSearchBtn = document.getElementById('mobileKvkSearchBtn');
    const mobileSearchResultsDiv = document.getElementById('mobileSearchResults');

    const mobileBagLayer = document.getElementById('mobileBagLayer');
    const mobileOsmLayer = document.getElementById('mobileOsmLayer');
    const mobileTopoLayer = document.getElementById('mobileTopoLayer');
    const mobileLuchtfotoLayer = document.getElementById('mobileLuchtfotoLayer');

    const mobileMeasureDistanceBtn = document.getElementById('mobileMeasureDistance');
    const mobileMeasureAreaBtn = document.getElementById('mobileMeasureArea');
    const mobileClearMeasurementsBtn = document.getElementById('mobileClearMeasurements');


    // Functie om zoektabs te wisselen (voor zowel desktop als mobiel)
    function switchSearchTab(activeTabId, inactiveTabId, activeContentId, inactiveContentId, searchInputToClear, searchResultsToClear) {
        document.getElementById(inactiveTabId).classList.remove('active');
        document.getElementById(inactiveTabId).style.borderBottomColor = 'transparent';
        document.getElementById(inactiveTabId).style.color = '#666';
        document.getElementById(activeTabId).classList.add('active');
        document.getElementById(activeTabId).style.borderBottomColor = '#76bc94';
        document.getElementById(activeTabId).style.color = '#76bc94';

        document.getElementById(activeContentId).style.display = 'block';
        document.getElementById(inactiveContentId).style.display = 'none';
        document.getElementById(searchResultsToClear).innerHTML = ''; // Wis resultaten bij wisselen tab
        document.getElementById(searchInputToClear).value = ''; // Wis inputveld
        console.log(`WebGIS Debug: Switched search tab to: ${activeTabId}`);
    }

    // Event listeners voor desktop zoektabs
    searchTabAddress.addEventListener('click', () => switchSearchTab(
        'searchTabAddress', 'searchTabKvk', 'addressSearch', 'kvkSearch', 'searchInput', 'searchResults'
    ));
    searchTabKvk.addEventListener('click', () => switchSearchTab(
        'searchTabKvk', 'searchTabAddress', 'kvkSearch', 'addressSearch', 'kvkSearchInput', 'searchResults'
    ));

    // Event listeners voor mobiele zoektabs
    if (mobileSearchTabAddress && mobileSearchTabKvk) {
        mobileSearchTabAddress.addEventListener('click', () => switchSearchTab(
            'mobileSearchTabAddress', 'mobileSearchTabKvk', 'mobileAddressSearch', 'mobileKvkSearch', 'mobileSearchInput', 'mobileSearchResults'
        ));
        mobileSearchTabKvk.addEventListener('click', () => switchSearchTab(
            'mobileSearchTabKvk', 'mobileSearchTabAddress', 'mobileKvkSearch', 'mobileAddressSearch', 'mobileKvkSearchInput', 'mobileSearchResults'
        ));
    }


    // Functie om adreszoekopdracht uit te voeren
    async function performAddressSearch(query, resultsDivId, inputId) {
        showStatus('Adres zoeken...', 'info');
        document.getElementById(resultsDivId).innerHTML = ''; // Wis eerdere resultaten
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
                    const lookupResponse = await fetch(PDOK_LOCATIESERVER_LOOKUP_URL + doc.id);
                    if (!lookupResponse.ok) throw new Error(`HTTP error! status: ${lookupResponse.status}`);
                    const lookupData = await lookupResponse.json();
                    
                    if (lookupData.response && lookupData.response.docs && lookupData.response.docs.length > 0) {
                        const result = lookupData.response.docs[0];
                        const resultDiv = document.createElement('div');
                        resultDiv.className = 'search-result';
                        resultDiv.innerHTML = `<strong>${result.weergavenaam}</strong><br>${result.postcode || ''} ${result.woonplaatsnaam || ''}`;
                        
                        resultDiv.addEventListener('click', () => {
                            if (result.geometrie_ll) {
                                try {
                                    const geojson = JSON.parse(result.geometrie_ll);
                                    highlightPolygon(geojson, `<strong>${result.weergavenaam}</strong>`);
                                } catch (parseError) {
                                    console.error('WebGIS Debug: Error parsing GeoJSON for address:', parseError);
                                    addMarker(result.y, result.x, `<strong>${result.weergavenaam}</strong>`);
                                }
                            } else if (result.x && result.y) {
                                addMarker(result.y, result.x, `<strong>${result.weergavenaam}</strong>`);
                            } else {
                                showStatus('Geen coördinaten of geometrie gevonden voor dit adres.', 'error');
                            }
                            document.getElementById(resultsDivId).innerHTML = ''; // Wis resultaten na selectie
                            document.getElementById(inputId).value = result.weergavenaam; // Vul het inputveld
                            // Sluit mobiel menu na selectie als het open is
                            if (mobileMenu && mobileMenu.classList.contains('active')) {
                                mobileMenu.classList.remove('active');
                                mobileOverlay.style.display = 'none';
                            }
                        });
                        document.getElementById(resultsDivId).appendChild(resultDiv);
                    }
                }
            } else {
                document.getElementById(resultsDivId).innerHTML = '<p>Geen adres gevonden.</p>';
                showStatus('Geen adres gevonden.', 'info');
            }
        } catch (error) {
            console.error('WebGIS Debug: Error fetching address data:', error);
            document.getElementById(resultsDivId).innerHTML = `<p class="kvk-error">Fout bij zoeken naar adres: ${error.message}</p>`;
            showStatus('Fout bij zoeken naar adres.', 'error');
        }
    }

    // Event listeners voor desktop adres zoeken
    searchBtn.addEventListener('click', () => performAddressSearch(searchInput.value, 'searchResults', 'searchInput'));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performAddressSearch(searchInput.value, 'searchResults', 'searchInput');
        }
    });

    // Event listeners voor mobiel adres zoeken
    if (mobileSearchBtn && mobileSearchInput) {
        mobileSearchBtn.addEventListener('click', () => performAddressSearch(mobileSearchInput.value, 'mobileSearchResults', 'mobileSearchInput'));
        mobileSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performAddressSearch(mobileSearchInput.value, 'mobileSearchResults', 'mobileSearchInput');
            }
        });
    }

    // Functie om KVK zoekopdracht uit te voeren
    async function performKvkSearch(query, resultsDivId, inputId) {
        showStatus('KVK zoeken...', 'info');
        document.getElementById(resultsDivId).innerHTML = ''; // Wis eerdere resultaten
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
                                    console.log(`WebGIS Debug: No precise location for KVK company: ${addressString}`);
                                }
                            } else {
                                showStatus('Geen precieze locatie gevonden voor dit KVK bedrijf.', 'info');
                                console.log(`WebGIS Debug: No location server results for KVK company: ${addressString}`);
                            }
                        } catch (geoError) {
                            console.error('WebGIS Debug: Error fetching geo data for KVK company:', geoError);
                            showStatus('Fout bij ophalen van locatie voor KVK bedrijf.', 'error');
                        }
                    } else {
                        showStatus('Geen adresinformatie beschikbaar om te lokaliseren.', 'info');
                    }
                    document.getElementById(resultsDivId).innerHTML = ''; // Wis resultaten na selectie
                    document.getElementById(inputId).value = detailedCompany ? detailedCompany.naam : query; // Vul het inputveld
                    // Sluit mobiel menu na selectie als het open is
                    if (mobileMenu && mobileMenu.classList.contains('active')) {
                        mobileMenu.classList.remove('active');
                        mobileOverlay.style.display = 'none';
                    }
                });
                document.getElementById(resultsDivId).appendChild(resultDiv);
            });
        } else {
            document.getElementById(resultsDivId).innerHTML = '<p>Geen KVK bedrijven gevonden.</p>';
            showStatus('Geen KVK bedrijven gevonden.', 'info');
        }
    }

    // Event listeners voor desktop KVK zoeken
    kvkSearchBtn.addEventListener('click', () => performKvkSearch(kvkSearchInput.value, 'searchResults', 'kvkSearchInput'));
    kvkSearchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            performKvkSearch(kvkSearchInput.value, 'searchResults', 'kvkSearchInput');
        }
    });

    // Event listeners voor mobiel KVK zoeken
    if (mobileKvkSearchBtn && mobileKvkSearchInput) {
        mobileKvkSearchBtn.addEventListener('click', () => performKvkSearch(mobileKvkSearchInput.value, 'mobileSearchResults', 'mobileKvkSearchInput'));
        mobileKvkSearchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                performKvkSearch(mobileKvkSearchInput.value, 'mobileSearchResults', 'mobileKvkSearchInput');
            }
        });
    }

    // Functie om kaartlagen te togglen (voor zowel desktop als mobiel)
    function handleLayerToggle(layerId, checked) {
        toggleLayer(layerId.replace('mobile', '').replace('Layer', 'Layer'), checked);
    }

    // Event listeners voor desktop kaartlagen controls
    document.getElementById('bagLayer').addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
    document.getElementById('osmLayer').addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
    document.getElementById('topoLayer').addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
    document.getElementById('luchtfotoLayer').addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));

    // Event listeners voor mobiele kaartlagen controls
    if (mobileBagLayer && mobileOsmLayer && mobileTopoLayer && mobileLuchtfotoLayer) {
        mobileBagLayer.addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
        mobileOsmLayer.addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
        mobileTopoLayer.addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
        mobileLuchtfotoLayer.addEventListener('change', (e) => handleLayerToggle(e.target.id, e.target.checked));
    }

    // Event listeners voor desktop meettools
    document.getElementById('measureDistance').addEventListener('click', () => toggleMeasurement('distance'));
    document.getElementById('measureArea').addEventListener('click', () => toggleMeasurement('area'));
    document.getElementById('clearMeasurements').addEventListener('click', clearMeasurements);

    // Event listeners voor mobiele meettools
    if (mobileMeasureDistanceBtn && mobileMeasureAreaBtn && mobileClearMeasurementsBtn) {
        mobileMeasureDistanceBtn.addEventListener('click', () => toggleMeasurement('distance'));
        mobileMeasureAreaBtn.addEventListener('click', () => toggleMeasurement('area'));
        mobileClearMeasurementsBtn.addEventListener('click', clearMeasurements);
    }

    // Event listener voor het sluiten van het info paneel
    document.getElementById('closeInfo').addEventListener('click', hideInfoPanel);

    // Mobiele menu functionaliteit
    if (mobileMenuBtn && mobileOverlay && mobileMenu && mobileMenuClose) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            mobileOverlay.style.display = 'block';
            console.log('WebGIS Debug: Mobile menu opened.');
        });

        mobileMenuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            mobileOverlay.style.display = 'none';
            console.log('WebGIS Debug: Mobile menu closed.');
        });

        mobileOverlay.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            mobileOverlay.style.display = 'none';
            console.log('WebGIS Debug: Mobile menu closed via overlay.');
        });
    }

    console.log('WebGIS Debug: UI initialized.');
}
