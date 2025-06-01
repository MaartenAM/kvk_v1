// ========================================
// DEBUG & UTILITY FUNCTIONS
// ========================================
function log(message) {
    console.log('WebGIS Debug:', message);
}

function showStatus(message, type = 'info') {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');

    indicator.className = `status-indicator ${type}`;
    text.textContent = message;
    indicator.style.display = 'block';

    setTimeout(() => {
        indicator.style.display = 'none';
    }, 3000);
}

log('Starting WebGIS initialization...');

// ========================================
// KVK‐API REQUEST COUNTER
// ========================================
let kvkRequestCount = 0;

// ========================================
// FLAG OM DUBBELE BAG/KVK CALLS TE VOORKOMEN
// ========================================
let bagLookupInProgress = false;

// ========================================
// OVERHEID.IO OPENKVK API INTEGRATION
// ========================================
const OPENKVK_CONFIG = {
    baseUrl: 'https://api.overheid.io/v3/openkvk',
    suggestUrl: 'https://api.overheid.io/v3/suggest/openkvk',
    apiKey: 'af0f54b3b1a1718d8003866dd8fcae6d7d3eff2e726c72b99bbc60756870d455',
    maxSearchResults: 5,
    minSearchLength: 3
};

async function getKvkCompaniesByPandId(pandId) {
    console.log('OpenKVK API lookup for pand_id:', pandId);

    try {
        // Één Overheid.io-request om alle bedrijven in dat pand op te halen
        kvkRequestCount++;
        console.log('🔢 KVK calls so far:', kvkRequestCount);

        const fields = [
            'rechtsvormCode',
            'vestigingsnummer',
            'kvkNummer',
            'activiteiten.omschrijving',
            'activiteiten.code',
            'activiteiten.hoofdactiviteit',
            'vestiging',
            'kvknummer',
            'pand_id',
            'updated_at',
            'actief',
            'rechtsvormOmschrijving',
            'activiteitomschrijving',
            'website',
            'vbo_id',
            'locatie.lon',
            'locatie.lat',
            'huidigeHandelsNamen',
            'naam',
            'bezoeklocatie.plaats',
            'bezoeklocatie.straat',
            'bezoeklocatie.huisnummer',
            'bezoeklocatie.postcode',
            'bezoeklocatie.land',
            'non_mailing_indicatie',
            'subdossiernummer',
            'postlocatie',
            'sbi',
            'inschrijvingstype',
            '_links.self.href'
        ];
        const params = fields.map((f, i) => `fields[${i}]=${encodeURIComponent(f)}`).join('&');

        const url = `${OPENKVK_CONFIG.baseUrl}?filters[pand_id]=${pandId}&${params}&ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('OpenKVK API URL:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey
            }
        });
        console.log('OpenKVK API response status:', response.status);

        if (!response.ok) {
            throw new Error(`OpenKVK API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('OpenKVK API data received:', data);

        let companies = [];
        if (data._embedded && data._embedded.bedrijf) {
            companies = data._embedded.bedrijf.map((bedrijf) => parseOverheidApiCompany(bedrijf));
            console.log(`Found ${companies.length} companies in pand ${pandId}`);
        } else {
            console.log(`No companies found in pand ${pandId}`);
        }

        return companies;
    } catch (error) {
        console.error('OpenKVK API error:', error);
        return [];
    }
}

async function searchKvkViaSuggest(query) {
    console.log('=== SEARCHING KVK VIA OVERHEID.IO SUGGEST ===');
    console.log('Input query:', query);

    if (!query || query.length < OPENKVK_CONFIG.minSearchLength) {
        console.log('❌ Query too short:', query?.length, 'min required:', OPENKVK_CONFIG.minSearchLength);
        return [];
    }

    try {
        // Tel deze één Overheid.io-suggest-call
        kvkRequestCount++;
        console.log('🔢 KVK calls so far:', kvkRequestCount);

        console.log('🔍 Making API request with max results:', OPENKVK_CONFIG.maxSearchResults);
        const url = `${OPENKVK_CONFIG.suggestUrl}/${encodeURIComponent(query)}?ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('🔍 Suggest API URL:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey
            }
        });
        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            throw new Error(`Suggest API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📊 Suggest response data length:', data?.length || 0);

        if (Array.isArray(data) && data.length > 0) {
            const limitedResults = data.slice(0, OPENKVK_CONFIG.maxSearchResults);
            console.log(
                `✅ Found ${data.length} suggestions, returning ${limitedResults.length} (max: ${OPENKVK_CONFIG.maxSearchResults})`
            );
            return limitedResults.map((item) => parseOverheidSuggestItem(item));
        } else {
            console.log('❌ No suggestions found');
            return [];
        }
    } catch (error) {
        console.log('❌ Suggest API call failed:', error);
        showStatus('Fout bij zoeken in KVK database', 'error');
        return [];
    }
}

async function getKvkCompanyDetails(link) {
    console.log('Getting company details via link:', link);

    try {
        // Tel deze één Overheid.io-detail-call
        kvkRequestCount++;
        console.log('🔢 KVK calls so far:', kvkRequestCount);

        const url = `https://api.overheid.io${link}?ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('Company details URL:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Company details API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Company details received:', data);
        return parseOverheidApiCompany(data);
    } catch (error) {
        console.error('Company details error:', error);
        return null;
    }
}

function parseOverheidApiCompany(bedrijf) {
    return {
        naam: bedrijf.naam || (bedrijf.huidigeHandelsNamen && bedrijf.huidigeHandelsNamen[0]) || 'Onbekend',
        kvknummer: bedrijf.kvknummer || 'Onbekend',
        vestigingsnummer: bedrijf.vestigingsnummer || 'Onbekend',
        activiteitomschrijving: bedrijf.activiteitomschrijving || 'Onbekend',
        actief: bedrijf.actief !== false,
        inschrijvingstype: bedrijf.inschrijvingstype || 'Onbekend',
        rechtsvormCode: bedrijf.rechtsvormCode || 'Onbekend',
        rechtsvormOmschrijving: bedrijf.rechtsvormOmschrijving || 'Onbekend',
        pand_id: bedrijf.pand_id || 'Onbekend',
        updated_at: bedrijf.updated_at || '',
        vbo_id: bedrijf.vbo_id || '',
        vestiging: bedrijf.vestiging || false,
        website: bedrijf.website || '',
        slug: bedrijf.slug || '',
        sbi: bedrijf.sbi || [],
        huidigeHandelsNamen: bedrijf.huidigeHandelsNamen || [],
        activiteiten: bedrijf.activiteiten || [],
        bezoeklocatie: bedrijf.bezoeklocatie || null,
        postlocatie: bedrijf.postlocatie || [],
        locatie: bedrijf.locatie || null,
        _source: 'OVERHEID_API'
    };
}

function parseOverheidSuggestItem(item) {
    return {
        kvkNummer: item.kvknummer,
        naam: item.naam,
        postcode: item.postcode,
        vestigingsnummer: item.vestigingsnummer,
        link: item.link,
        _source: 'OVERHEID_SUGGEST'
    };
}

// ========================================
// MAP INITIALIZATION
// ========================================
if (typeof L === 'undefined') {
    alert('Leaflet library niet geladen!');
} else {
    log('Leaflet loaded successfully');
}

let map;
try {
    map = L.map('map').setView([52.3676, 4.9041], 8);
    log('Map container initialized');
    showStatus('Kaart geladen', 'success');
} catch (error) {
    log('Error initializing map: ' + error.message);
    alert('Fout bij initialiseren kaart: ' + error.message);
}

// Kaartlagen
let osmLayer;
try {
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
    });

    osmLayer.on('loading', function () {
        log('OSM tiles are loading...');
    });

    osmLayer.on('load', function () {
        log('OSM tiles loaded successfully');
    });

    osmLayer.on('tileerror', function (e) {
        log('OSM tile error: ' + e.error);
    });

    osmLayer.addTo(map);
    log('OSM layer added to map');
} catch (error) {
    log('Error loading OSM layer: ' + error.message);
}

const topoLayer = L.tileLayer(
    'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
    {
        attribution: '© PDOK',
        maxZoom: 19
    }
);

const luchtfotoLayer = L.tileLayer(
    'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    {
        attribution: '© PDOK Luchtfoto',
        maxZoom: 19
    }
);

const bagLayer = L.tileLayer.wms('https://service.pdok.nl/lv/bag/wms/v2_0', {
    layers: 'pand',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    attribution: '© BAG',
    zIndex: 1000
});

// Nieuwe Kadastrale perceellaag (WMS)
const perceelLayer = L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
    layers: 'Perceel',
    format: 'image/png',
    transparent: true,
    attribution: '© Kadaster',
    zIndex: 900
});

const layers = {
    osm: osmLayer,
    topo: topoLayer,
    luchtfoto: luchtfotoLayer,
    bag: bagLayer,
    perceel: perceelLayer
};

function updateInfoBar(message, icon = 'fas fa-info-circle') {
    // Voeg het aantal KVK-calls toe als dat > 0 is
    let fullMessage = message;
    if (kvkRequestCount > 0) {
        fullMessage = `${message} (KVK calls: ${kvkRequestCount})`;
    }

    const infoBar = document.getElementById('infoBar');
    const infoText = document.getElementById('infoBarText');

    if (!infoBar) {
        console.error('❌ Info bar element not found during update!');
        return;
    }
    if (!infoText) {
        console.error('❌ Info bar text element not found during update!');
        return;
    }

    infoBar.style.display = 'block';
    infoBar.style.visibility = 'visible';
    infoBar.style.position = 'fixed';
    infoBar.style.top = '10px';
    infoBar.style.zIndex = '999';
    infoBar.style.background = '#76bc94';
    infoBar.style.color = 'white';

    const iconElement = infoBar.querySelector('i');
    if (iconElement) {
        iconElement.className = icon;
    }

    infoText.textContent = fullMessage;
    console.log('✅ Info bar successfully updated with message:', fullMessage);
}

// ========================================
// MOBILE MENU FUNCTIONALITY
// ========================================
function initMobileMenu() {
    console.log('🔍 Initializing mobile menu...');

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    if (!mobileMenuBtn) {
        console.error('❌ Mobile menu button not found in DOM');
        return;
    }
    if (!mobileMenu) {
        console.error('❌ Mobile menu not found in DOM');
        return;
    }
    if (!mobileOverlay) {
        console.error('❌ Mobile overlay not found in DOM');
        return;
    }
    if (!mobileMenuClose) {
        console.error('❌ Mobile menu close button not found in DOM');
        return;
    }

    console.log('✅ All mobile menu elements found');

    function openMobileMenu() {
        console.log('📱 Opening mobile menu');
        mobileMenu.style.display = 'block';
        mobileOverlay.style.display = 'block';
        setTimeout(() => {
            mobileMenu.classList.add('active');
        }, 10);
    }

    function closeMobileMenu() {
        console.log('📱 Closing mobile menu');
        mobileMenu.classList.remove('active');
        setTimeout(() => {
            mobileMenu.style.display = 'none';
            mobileOverlay.style.display = 'none';
        }, 300);
    }

    mobileMenuBtn.addEventListener('click', openMobileMenu);
    mobileMenuClose.addEventListener('click', closeMobileMenu);
    mobileOverlay.addEventListener('click', closeMobileMenu);

    console.log('✅ Mobile menu event listeners added');

    syncMobileControls();
    setupMobileEventListeners();
}

function syncMobileControls() {
    console.log('🔄 Syncing mobile controls...');

    const mobileBagLayer = document.getElementById('mobileBagLayer');
    const mobileOsmLayer = document.getElementById('mobileOsmLayer');
    const mobileTopoLayer = document.getElementById('mobileTopoLayer');
    const mobileLuchtfotoLayer = document.getElementById('mobileLuchtfotoLayer');
    const mobilePerceelLayer = document.getElementById('mobilePerceelLayer');

    if (
        !mobileBagLayer ||
        !mobileOsmLayer ||
        !mobileTopoLayer ||
        !mobileLuchtfotoLayer ||
        !mobilePerceelLayer
    ) {
        console.error('❌ Some mobile layer controls not found');
        return;
    }

    mobileBagLayer.checked = document.getElementById('bagLayer').checked;
    mobileOsmLayer.checked = document.getElementById('osmLayer').checked;
    mobileTopoLayer.checked = document.getElementById('topoLayer').checked;
    mobileLuchtfotoLayer.checked = document.getElementById('luchtfotoLayer').checked;
    mobilePerceelLayer.checked = document.getElementById('perceelLayer').checked;

    console.log('✅ Mobile controls synced');
}

function setupMobileEventListeners() {
    console.log('🔄 Setting up mobile event listeners...');

    const mobileElements = [
        'mobileSearchTabAddress',
        'mobileSearchTabKvk',
        'mobileAddressSearch',
        'mobileKvkSearch',
        'mobileSearchResults',
        'mobileBagLayer',
        'mobileOsmLayer',
        'mobileTopoLayer',
        'mobileLuchtfotoLayer',
        'mobilePerceelLayer',
        'mobileMeasureDistance',
        'mobileMeasureArea',
        'mobileClearMeasurements',
        'mobileSearchBtn',
        'mobileKvkSearchBtn',
        'mobileSearchInput',
        'mobileKvkSearchInput',
        'mobileMeasureResults'
    ];

    for (const elementId of mobileElements) {
        if (!document.getElementById(elementId)) {
            console.error(`❌ Mobile element not found: ${elementId}`);
            return;
        }
    }

    console.log('✅ All mobile elements found, setting up listeners...');

    document.getElementById('mobileSearchTabAddress').addEventListener('click', function () {
        document.getElementById('mobileSearchTabAddress').classList.add('active');
        document.getElementById('mobileSearchTabKvk').classList.remove('active');
        document.getElementById('mobileSearchTabAddress').style.borderBottomColor = '#76bc94';
        document.getElementById('mobileSearchTabAddress').style.color = '#76bc94';
        document.getElementById('mobileSearchTabKvk').style.borderBottomColor = 'transparent';
        document.getElementById('mobileSearchTabKvk').style.color = '#666';
        document.getElementById('mobileAddressSearch').style.display = 'block';
        document.getElementById('mobileKvkSearch').style.display = 'none';
        document.getElementById('mobileSearchResults').innerHTML = '';
    });

    document.getElementById('mobileSearchTabKvk').addEventListener('click', function () {
        document.getElementById('mobileSearchTabKvk').classList.add('active');
        document.getElementById('mobileSearchTabAddress').classList.remove('active');
        document.getElementById('mobileSearchTabKvk').style.borderBottomColor = '#76bc94';
        document.getElementById('mobileSearchTabKvk').style.color = '#76bc94';
        document.getElementById('mobileSearchTabAddress').style.borderBottomColor = 'transparent';
        document.getElementById('mobileSearchTabAddress').style.color = '#666';
        document.getElementById('mobileKvkSearch').style.display = 'block';
        document.getElementById('mobileAddressSearch').style.display = 'none';
        document.getElementById('mobileSearchResults').innerHTML = '';
    });

    const mobileBagLayer = document.getElementById('mobileBagLayer');
    const mobileOsmLayer = document.getElementById('mobileOsmLayer');
    const mobileTopoLayer = document.getElementById('mobileTopoLayer');
    const mobileLuchtfotoLayer = document.getElementById('mobileLuchtfotoLayer');
    const mobilePerceelLayer = document.getElementById('mobilePerceelLayer');

    if (mobileBagLayer) {
        mobileBagLayer.addEventListener('change', function () {
            document.getElementById('bagLayer').checked = this.checked;
            document.getElementById('bagLayer').dispatchEvent(new Event('change'));
        });
    }
    if (mobileOsmLayer) {
        mobileOsmLayer.addEventListener('change', function () {
            document.getElementById('osmLayer').checked = this.checked;
            document.getElementById('osmLayer').dispatchEvent(new Event('change'));
        });
    }
    if (mobileTopoLayer) {
        mobileTopoLayer.addEventListener('change', function () {
            document.getElementById('topoLayer').checked = this.checked;
            document.getElementById('topoLayer').dispatchEvent(new Event('change'));
        });
    }
    if (mobileLuchtfotoLayer) {
        mobileLuchtfotoLayer.addEventListener('change', function () {
            document.getElementById('luchtfotoLayer').checked = this.checked;
            document.getElementById('luchtfotoLayer').dispatchEvent(new Event('change'));
        });
    }
    if (mobilePerceelLayer) {
        mobilePerceelLayer.addEventListener('change', function () {
            document.getElementById('perceelLayer').checked = this.checked;
            document.getElementById('perceelLayer').dispatchEvent(new Event('change'));
        });
    }

    document.getElementById('mobileMeasureDistance').addEventListener('click', () => {
        startMeasuring('distance');
        document.getElementById('mobileMeasureResults').innerHTML = document.getElementById('measureResults').innerHTML;
    });

    document.getElementById('mobileMeasureArea').addEventListener('click', () => {
        startMeasuring('area');
        document.getElementById('mobileMeasureResults').innerHTML = document.getElementById('measureResults').innerHTML;
    });

    document.getElementById('mobileClearMeasurements').addEventListener('click', () => {
        clearMeasurements();
        document.getElementById('mobileMeasureResults').innerHTML = '';
    });

    document.getElementById('mobileSearchBtn').addEventListener('click', () => {
        const query = document.getElementById('mobileSearchInput').value.trim();
        if (query && query.length >= 3) {
            document.getElementById('searchInput').value = query;
            searchAddress();
            setTimeout(() => {
                document.getElementById('mobileSearchResults').innerHTML = document.getElementById('searchResults').innerHTML;
                setupMobileSearchResultListeners();
            }, 500);
        } else {
            showStatus('Voer minimaal 3 karakters in', 'error');
        }
    });

    document.getElementById('mobileKvkSearchBtn').addEventListener('click', async () => {
        const query = document.getElementById('mobileKvkSearchInput').value.trim();
        if (query && query.length >= OPENKVK_CONFIG.minSearchLength) {
            document.getElementById('kvkSearchInput').value = query;
            document.getElementById('kvkSearchBtn').click();
            setTimeout(() => {
                document.getElementById('mobileSearchResults').innerHTML = document.getElementById('searchResults').innerHTML;
                setupMobileSearchResultListeners();
            }, 500);
        } else {
            showStatus(`Voer minimaal ${OPENKVK_CONFIG.minSearchLength} karakters in`, 'error');
        }
    });

    document.getElementById('mobileSearchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('mobileSearchBtn').click();
        }
    });
    document.getElementById('mobileKvkSearchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('mobileKvkSearchBtn').click();
        }
    });

    console.log('✅ Mobile event listeners setup complete');
}

function setupMobileSearchResultListeners() {
    const mobileResults = document.getElementById('mobileSearchResults');
    const results = mobileResults.querySelectorAll('.search-result, .kvk-search-result');

    results.forEach((result) => {
        result.addEventListener('click', () => {
            setTimeout(() => {
                document.getElementById('mobileMenuClose').click();
            }, 100);
        });
    });
}

function updateMobileeMeasureResult() {
    const mobileResults = document.getElementById('mobileMeasureResults');
    const desktopResults = document.getElementById('measureResults');
    if (mobileResults && desktopResults) {
        mobileResults.innerHTML = desktopResults.innerHTML;
    }
}

// ========================================
// SEARCH FUNCTIONALITY
// ========================================
let searchTimeout;
let searchMarker;

function searchAddress() {
    const query = document.getElementById('searchInput').value.trim();
    console.log('Search function called with query:', query);

    if (!query || query.length < 2) {
        console.log('Query te kort, resultaten verwijderen');
        document.getElementById('searchResults').innerHTML = '';
        return;
    }

    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(
        query
    )}&fq=type:adres&rows=10`;
    console.log('Search URL:', url);

    fetch(url)
        .then((response) => {
            console.log('Search response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then((data) => {
            console.log('Search data ontvangen:', data);
            if (data.response && data.response.docs) {
                console.log('Gevonden', data.response.docs.length, 'resultaten');
                displaySearchResults(data.response.docs);
            } else {
                console.log('Geen docs in response');
                displaySearchResults([]);
            }
        })
        .catch((error) => {
            console.error('Zoekfout:', error);
            const container = document.getElementById('searchResults');
            container.innerHTML = `<div class="search-result" style="color: #e74c3c;">Fout bij zoeken: ${error.message}</div>`;
        });
}

function displaySearchResults(results) {
    console.log('Displaying search results:', results);
    const container = document.getElementById('searchResults');

    if (!container) {
        console.error('Search results container not found!');
        return;
    }

    container.innerHTML = '';

    if (!results || results.length === 0) {
        container.innerHTML = '<div class="search-result">Geen resultaten gevonden</div>';
        return;
    }

    results.slice(0, 8).forEach((result, index) => {
        console.log(`Creating result ${index}:`, result);

        const div = document.createElement('div');
        div.className = 'search-result';

        const mainText = document.createElement('div');
        mainText.style.fontWeight = '600';
        mainText.style.color = '#333';
        mainText.textContent = result.weergavenaam || result.display_name || 'Onbekend adres';

        const subText = document.createElement('div');
        subText.style.fontSize = '12px';
        subText.style.color = '#666';
        subText.style.marginTop = '4px';

        const details = [];
        if (result.gemeentenaam) details.push(result.gemeentenaam);
        if (result.provincienaam) details.push(result.provincienaam);
        if (result.type) details.push(`(${result.type})`);
        subText.textContent = details.join(', ');

        div.appendChild(mainText);
        if (subText.textContent) div.appendChild(subText);

        div.addEventListener('click', () => {
            console.log('Search result clicked:', result);
            selectSearchResult(result.id);
        });

        container.appendChild(div);
    });
}

function selectSearchResult(id) {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${id}`;

    fetch(url)
        .then((response) => response.json())
        .then((data) => {
            if (data.response.docs.length > 0) {
                const doc = data.response.docs[0];
                console.log('Search result doc:', doc);

                let lat, lng;

                if (doc.centroide_ll) {
                    console.log('Raw centroide_ll:', doc.centroide_ll);

                    if (doc.centroide_ll.startsWith('POINT(')) {
                        const coordString = doc.centroide_ll.replace('POINT(', '').replace(')', '');
                        const coords = coordString.split(' ');
                        lng = parseFloat(coords[0]);
                        lat = parseFloat(coords[1]);
                    } else {
                        const coords = doc.centroide_ll.split(' ');
                        lng = parseFloat(coords[0]);
                        lat = parseFloat(coords[1]);
                    }
                }

                console.log('Parsed coordinates:', { lat, lng });

                if (isNaN(lat) || isNaN(lng)) {
                    console.error('Ongeldige coördinaten na parsing. Raw data:', doc.centroide_ll);
                    return;
                }

                if (searchMarker) {
                    map.removeLayer(searchMarker);
                }

                searchMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'custom-search-marker',
                        html: `<div style="
                                background-color: #76bc94;
                                border: 3px solid white;
                                border-radius: 50%;
                                width: 20px;
                                height: 20px;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                                position: relative;
                            "></div>
                            <div style="
                                position: absolute;
                                top: 20px;
                                left: 50%;
                                transform: translateX(-50%);
                                width: 0;
                                height: 0;
                                border-left: 6px solid transparent;
                                border-right: 6px solid transparent;
                                border-top: 8px solid #76bc94;
                                filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
                            "></div>`,
                        iconSize: [20, 28],
                        iconAnchor: [10, 28],
                        popupAnchor: [0, -28]
                    })
                }).addTo(map);

                const popupContent = `
                            <div style="font-family: 'Segoe UI', sans-serif;">
                                <strong style="color: #76bc94;">${doc.weergavenaam}</strong><br>
                                ${doc.gemeentenaam ? `<small>${doc.gemeentenaam}</small>` : ''}
                            </div>
                        `;

                searchMarker.bindPopup(popupContent).openPopup();

                map.flyTo([lat, lng], 18, {
                    animate: true,
                    duration: 1.5
                });

                document.getElementById('searchResults').innerHTML = '';
                document.getElementById('searchInput').value = doc.weergavenaam;

                console.log('Zoom completed to:', lat, lng);
            }
        })
        .catch((error) => {
            console.error('Locatie ophalen fout:', error);
        });
}

async function geocodeAddress(address) {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(
        address
    )}&fq=type:adres&rows=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.response && data.response.docs && data.response.docs.length > 0) {
            const doc = data.response.docs[0];

            const lookupUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${doc.id}`;
            const lookupResponse = await fetch(lookupUrl);
            const lookupData = await lookupResponse.json();

            if (lookupData.response.docs.length > 0) {
                const coordDoc = lookupData.response.docs[0];

                if (coordDoc.centroide_ll.startsWith('POINT(')) {
                    const coordString = coordDoc.centroide_ll.replace('POINT(', '').replace(')', '');
                    const coords = coordString.split(' ');
                    const lng = parseFloat(coords[0]);
                    const lat = parseFloat(coords[1]);

                    return { lat, lng, address: coordDoc.weergavenaam };
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// ========================================
// ZOOM-TO-COMPANY-FROM-SUGGEST FUNCTION
// ========================================
async function zoomToCompanyFromSuggest(suggestItem) {
    console.log('Zooming to company from suggest:', suggestItem);

    try {
        const companyDetails = await getKvkCompanyDetails(suggestItem.link);

        if (companyDetails && companyDetails.locatie) {
            const { lat, lon } = companyDetails.locatie;
            const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };

            if (!isNaN(coords.lat) && !isNaN(coords.lng)) {
                zoomToCompany(coords, companyDetails);
                return;
            }
        }

        if (companyDetails && companyDetails.bezoeklocatie) {
            let adresStr = companyDetails.bezoeklocatie.straat;
            if (companyDetails.bezoeklocatie.huisnummer) {
                adresStr += ' ' + companyDetails.bezoeklocatie.huisnummer;
            }
            if (companyDetails.bezoeklocatie.plaats) {
                adresStr += ', ' + companyDetails.bezoeklocatie.plaats;
            }

            const coords = await geocodeAddress(adresStr);
            if (coords) {
                zoomToCompany(coords, companyDetails);
                return;
            }
        }

        showStatus('Locatie van bedrijf niet gevonden', 'error');
    } catch (error) {
        console.error('Error zooming to company:', error);
        showStatus('Fout bij ophalen bedrijfslocatie', 'error');
    }
}

function zoomToCompany(coords, company) {
    if (searchMarker) {
        map.removeLayer(searchMarker);
    }

    searchMarker = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
            className: 'custom-company-marker',
            html: `<div style="
                        background-color: #76bc94;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 24px;
                        height: 24px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 12px;
                    ">B</div>
                    <div style="
                        position: absolute;
                        top: 24px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 0;
                        height: 0;
                        border-left: 6px solid transparent;
                        border-right: 6px solid transparent;
                        border-top: 8px solid #76bc94;
                        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
                    "></div>`,
            iconSize: [24, 32],
            iconAnchor: [12, 32],
            popupAnchor: [0, -32]
        })
    }).addTo(map);

    const popupContent = `
        <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px; text-align: center;">
            <strong style="color: #76bc94; font-size: 14px;">${company.naam}</strong><br>
            <small style="color: #666;">KVK: ${company.kvknummer}</small><br>
            ${company.rechtsvormOmschrijving ? `<small style="color: #666;">${company.rechtsvormOmschrijving}</small><br>` : ''}
        </div>
    `;

    searchMarker.bindPopup(popupContent).openPopup();

    map.flyTo([coords.lat, coords.lng], 18, {
        animate: true,
        duration: 1.5
    });
}

// ========================================
// KVK SEARCH DISPLAY FUNCTIONS
// ========================================
function displayKvkSearchResults(suggestions) {
    console.log('Displaying KVK search results:', suggestions);
    const container = document.getElementById('searchResults');

    if (!container) {
        console.error('Search results container not found!');
        return;
    }

    container.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = '<div class="search-result">Geen bedrijven gevonden</div>';
        return;
    }

    suggestions.forEach((suggestion, index) => {
        console.log(`Creating KVK result ${index}:`, suggestion);

        const div = document.createElement('div');
        div.className = 'kvk-search-result';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'kvk-result-name';
        nameDiv.innerHTML = `
            <i class="fas fa-building" style="color: #76bc94; margin-right: 6px;"></i>
            ${suggestion.naam}
        `;

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'kvk-result-details';
        let detailsHtml = `<div><strong>KVK:</strong> ${suggestion.kvkNummer}</div>`;

        if (suggestion.vestigingsnummer) {
            detailsHtml += `<div><strong>Vestiging:</strong> ${suggestion.vestigingsnummer}</div>`;
        }

        if (suggestion.postcode) {
            detailsHtml += `<div><strong>Postcode:</strong> ${suggestion.postcode}</div>`;
        }

        detailsDiv.innerHTML = detailsHtml;

        div.appendChild(nameDiv);
        div.appendChild(detailsDiv);

        div.addEventListener('click', async () => {
            console.log('KVK search result clicked:', suggestion);
            await zoomToCompanyFromSuggest(suggestion);
            container.innerHTML = '';
        });

        container.appendChild(div);
    });

    const sourceDiv = document.createElement('div');
    sourceDiv.style.cssText =
        'margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 6px; font-size: 11px; text-align: center; color: #666;';
    sourceDiv.innerHTML =
        '<i class="fas fa-info-circle"></i> Gegevens via Overheid.io OpenKVK API';
    container.appendChild(sourceDiv);
}

function displayKvkResults(companies, pandInfo) {
    const kvkContent = document.getElementById('kvkContent');

    if (!companies || companies.length === 0) {
        kvkContent.innerHTML = `
            <div style="padding: 12px; text-align: center; color: #666; font-size: 13px;">
                <i class="fas fa-building" style="color: #ccc; font-size: 24px; margin-bottom: 8px; display: block;"></i>
                Geen bedrijven gevonden in dit pand
                ${pandInfo ? `<br><small>Pand ID: ${pandInfo.identificatie}</small>` : ''}
            </div>
        `;
        return;
    }

    let html = '';
    if (pandInfo) {
        html += `<div style="margin-bottom: 12px; padding: 8px; background: #e9f7f0; border-radius: 6px; font-size: 12px; color: #333;">
                    <i class="fas fa-building" style="color: #76bc94;"></i> Pand ID: ${pandInfo.identificatie || 'Onbekend'}
                </div>`;
    }

    companies.forEach((company, index) => {
        const isHoofdvestiging = company.inschrijvingstype === 'Hoofdvestiging';
        const typeIcon = isHoofdvestiging ? 'fas fa-building' : 'fas fa-store';
        const typeColor = isHoofdvestiging ? '#76bc94' : '#ffa500';
        const typeLabel = company.inschrijvingstype || 'Vestiging';

        let hoofdactiviteitText = company.activiteitomschrijving;
        if (company.activiteiten && company.activiteiten.length > 0) {
            const hoofdAct = company.activiteiten.find((act) => act.hoofdactiviteit === true);
            if (hoofdAct && hoofdAct.omschrijving) {
                hoofdactiviteitText = hoofdAct.omschrijving;
            }
        }

        html += `
            <div class="kvk-company">
                <div class="kvk-company-name">
                    <i class="${typeIcon}" style="color: ${typeColor}; margin-right: 6px;"></i>
                    ${company.naam}
                    <span style="font-size: 10px; background: ${typeColor}; color: white; padding: 2px 6px; border-radius: 10px; margin-left: 8px;">${typeLabel}</span>
                </div>
                <div class="kvk-company-details">
                    <div><strong>KVK:</strong> ${company.kvknummer}</div>
                    <div><strong>Vestigingsnr.:</strong> ${company.vestigingsnummer}</div>
                    <div><strong>Rechtsvorm:</strong> ${company.rechtsvormOmschrijving}</div>
                    <div><strong>Status:</strong> <span style="color: ${company.actief ? '#28a745' : '#dc3545'};">${company.actief ? 'Actief' : 'Inactief'}</span></div>

                    ${company.bezoeklocatie ? `<div style="margin-top: 8px;"><strong>Bezoekadres:</strong><br>${formatAddress(company.bezoeklocatie)}</div>` : ''}

                    <div style="margin-top: 8px;"><strong>Activiteit:</strong><br>${hoofdactiviteitText}</div>

                    ${company.activiteiten && company.activiteiten.length > 0 ? `
                        <div style="margin-top: 6px;"><strong>Activiteiten (SBI):</strong><br>
                            ${company.activiteiten
                                .map(act =>
                                    `<span style="font-size: 11px; background: #f1f3f4; padding: 2px 4px; border-radius: 3px; margin: 1px; display: inline-block;">
                                        ${act.code || ''} ${act.omschrijving || ''}${act.hoofdactiviteit ? ' (hoofd)' : ''}
                                    </span>`
                                ).join('')}
                        </div>
                    ` : ''}

                    ${company.sbi && company.sbi.length > 0 ? `
                        <div style="margin-top: 6px;"><strong>SBI-codes:</strong><br>${company.sbi.join(', ')}</div>
                    ` : ''}

                    ${company.huidigeHandelsNamen && company.huidigeHandelsNamen.length > 0 ? `
                        <div style="margin-top: 6px;"><strong>Handelsnamen:</strong><br>${company.huidigeHandelsNamen.join(', ')}</div>
                    ` : ''}

                    ${company.postlocatie && company.postlocatie.length > 0 ? `<div style="margin-top: 6px;"><strong>Postadres:</strong><br>${formatPostAddress(company.postlocatie[0])}</div>` : ''}

                    ${company.updated_at ? `<div style="margin-top: 6px; font-size: 11px; color: #888;"><strong>Laatst bijgewerkt:</strong> ${formatDate(company.updated_at)}</div>` : ''}

                    ${company.vbo_id ? `<div style="margin-top: 6px;"><strong>VBO ID:</strong> ${company.vbo_id}</div>` : ''}

                    ${company.locatie ? `
                        <div style="margin-top: 6px; font-size: 11px; color: #888;">
                            <strong>Coördinaten:</strong> ${parseFloat(company.locatie.lat).toFixed(5)}, ${parseFloat(company.locatie.lon).toFixed(5)}
                            <button onclick="zoomToCompanyLocation(${company.locatie.lat}, ${company.locatie.lon}, '${company.naam.replace(/'/g, "\\'")}')" 
                                    style="margin-left: 6px; padding: 2px 6px; font-size: 10px; background: #76bc94; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                <i class="fas fa-crosshairs"></i> Zoom
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += `<div style="margin-top: 12px; padding: 8px; background: #f8f9fa; border-radius: 6px; font-size: 11px; color: #666; text-align: center;">
                <i class="fas fa-info-circle"></i> 
                Gegevens via Overheid.io OpenKVK API
                <br><small>Laatste update: ${new Date().toLocaleDateString('nl-NL')}</small>
            </div>`;

    kvkContent.innerHTML = html;
}

function formatPostAddress(postAdres) {
    if (!postAdres) return 'Onbekend';

    let formatted = '';
    if (postAdres.straat) {
        formatted += postAdres.straat;
        if (postAdres.huisnummer) {
            formatted += ' ' + postAdres.huisnummer;
        }
    }
    if (postAdres.postcode) {
        formatted += ', ' + postAdres.postcode;
    }
    if (postAdres.plaats) {
        formatted += ' ' + postAdres.plaats;
    }

    return formatted || 'Onbekend';
}

function formatDate(dateString) {
    if (!dateString) return 'Onbekend';
    try {
        return new Date(dateString).toLocaleDateString('nl-NL');
    } catch (e) {
        return dateString;
    }
}

function formatAddress(adres) {
    if (!adres) return 'Onbekend';

    let formatted = '';
    if (adres.straat) {
        formatted += adres.straat;
        if (adres.huisnummer) {
            formatted += ' ' + adres.huisnummer;
        }
    }
    if (adres.postcode) {
        formatted += ', ' + adres.postcode;
    }
    if (adres.plaats) {
        formatted += ' ' + adres.plaats;
    }

    return formatted || 'Onbekend';
}

// ========================================
// BUILDING HIGHLIGHT FUNCTIONALITY
// ========================================
let highlightedBuilding = null;

function highlightBuilding(latlng, pandInfo) {
    console.log('🏢 Creating simple marker highlight at:', latlng);

    clearBuildingHighlight();

    highlightedBuilding = L.marker(latlng, {
        icon: L.divIcon({
            className: 'building-highlight-marker',
            html: `
                <div style="
                    background: linear-gradient(45deg, #ff4444, #ff6666);
                    border: 4px solid white;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    box-shadow: 0 4px 15px rgba(255, 68, 68, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 18px;
                    animation: pulse 2s infinite;
                    position: relative;
                    z-index: 9999;
                ">
                    🏢
                </div>
                <div style="
                    position: absolute;
                    top: 40px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #ff4444;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                ">
                    Geselecteerd Pand
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        }),
        zIndexOffset: 9999
    }).addTo(map);

    highlightedBuilding.bindPopup(`
        <div style="font-family: 'Segoe UI', sans-serif; text-align: center; min-width: 150px;">
            <div style="color: #ff4444; font-weight: 600; margin-bottom: 5px;">
                <i class="fas fa-map-marker-alt"></i> Geselecteerd Pand
            </div>
            <div style="font-size: 12px; color: #666;">
                ${pandInfo.identificatie || 'Onbekend'}
            </div>
        </div>
    `);

    console.log('✅ Building marker highlight created and visible');
    updateInfoBar(`Gebouw ${pandInfo.identificatie} geselecteerd`, 'fas fa-building');
}

function clearBuildingHighlight() {
    if (highlightedBuilding) {
        map.removeLayer(highlightedBuilding);
        highlightedBuilding = null;
        console.log('🧹 Building highlight marker cleared');
    }
}

// ========================================
// BAG INFORMATION & KVK LOOKUP
// ========================================
async function getBagAndKvkInfo(latlng) {
    // Kortsluiting: als er al een lookup loopt, doe niets.
    if (bagLookupInProgress) return;
    bagLookupInProgress = true;

    console.log('=== getBagAndKvkInfo called ===');
    console.log('Getting BAG and KVK info for:', latlng);

    getBagInfo(latlng);

    const kvkSection = document.getElementById('kvkSection');
    const kvkContent = document.getElementById('kvkContent');

    console.log('KVK section element:', kvkSection);
    console.log('KVK content element:', kvkContent);

    if (!kvkSection || !kvkContent) {
        console.error('KVK elements not found!');
        bagLookupInProgress = false;
        return;
    }

    kvkSection.style.display = 'block';
    kvkContent.innerHTML = '<div class="kvk-loading"><i class="fas fa-spinner fa-spin"></i> KVK gegevens ophalen...</div>';

    try {
        console.log('Starting BAG pand lookup for KVK...');
        const pandInfo = await getBagPandInfo(latlng);
        console.log('BAG pand info:', pandInfo);

        if (pandInfo && pandInfo.identificatie) {
            console.log('Pand ID found, looking up KVK met:', pandInfo.identificatie);
            updateInfoBar('Bedrijfsinformatie ophalen...', 'fas fa-spinner fa-spin');
            const companies = await getKvkCompaniesByPandId(pandInfo.identificatie);
            console.log('KVK companies found:', companies);
            displayKvkResults(companies, pandInfo);

            if (companies && companies.length > 0) {
                updateInfoBar(`${companies.length} bedrijf${companies.length > 1 ? 'ven' : ''} gevonden in dit pand`, 'fas fa-building');
            } else {
                updateInfoBar('Geen bedrijven gevonden in dit pand', 'fas fa-info-circle');
            }
        } else {
            console.log('No pand ID found for KVK lookup');
            kvkContent.innerHTML = '<div class="kvk-error">Geen pand identificatie gevonden voor KVK lookup</div>';
            updateInfoBar('Geen pand identificatie gevonden', 'fas fa-exclamation-triangle');
        }
    } catch (error) {
        console.error('KVK lookup error:', error);
        kvkContent.innerHTML = '<div class="kvk-error">Fout bij ophalen KVK gegevens: ' + error.message + '</div>';
        updateInfoBar('Fout bij ophalen bedrijfsinformatie', 'fas fa-exclamation-triangle');
    } finally {
        bagLookupInProgress = false;
    }
}

function getBagInfo(latlng) {
    console.log('BAG info gevraagd voor:', latlng);

    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    console.log('WGS84 BBOX:', bbox);

    const wmsUrl =
        `https://service.pdok.nl/lv/bag/wms/v2_0?` +
        `QUERY_LAYERS=pand&` +
        `INFO_FORMAT=application%2Fjson&` +
        `REQUEST=GetFeatureInfo&` +
        `SERVICE=WMS&` +
        `VERSION=1.3.0&` +
        `FORMAT=image%2Fpng&` +
        `STYLES=&` +
        `TRANSPARENT=true&` +
        `LAYERS=pand&` +
        `FEATURE_COUNT=5&` +
        `I=${Math.round(point.x)}&` +
        `J=${Math.round(point.y)}&` +
        `WIDTH=${size.x}&` +
        `HEIGHT=${size.y}&` +
        `CRS=EPSG%3A4326&` +
        `BBOX=${bbox}`;

    console.log('BAG WMS URL:', wmsUrl);

    fetch(wmsUrl)
        .then((response) => {
            console.log('BAG Response status:', response.status);
            console.log('BAG Response content-type:', response.headers.get('content-type'));
            return response.text();
        })
        .then((text) => {
            console.log('BAG Raw response (first 200 chars):', text.substring(0, 200));

            if (text.trim().startsWith('<')) {
                console.error('Server returned HTML (error page):', text);
                throw new Error('Server returned HTML error page instead of JSON');
            }

            try {
                const data = JSON.parse(text);
                console.log('BAG Parsed data:', data);

                if (data.features && data.features.length > 0) {
                    console.log('Found', data.features.length, 'pand(en)');
                    const pandInfo = data.features[0].properties;
                    showBagInfo(data.features[0]);
                    highlightBuilding(latlng, pandInfo);
                } else {
                    console.log('No pand found at clicked locatie');
                    showBagInfo(null, 'Geen pand gevonden op deze locatie - probeer preciezer te klikken');
                    clearBuildingHighlight();
                }
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.error('Response text:', text);
                showBagInfo(null, `JSON parse fout: ${parseError.message}`);
                clearBuildingHighlight();
            }
        })
        .catch((error) => {
            console.error('BAG WMS fout:', error);
            showBagInfo(null, `Fout bij ophalen BAG gegevens: ${error.message}`);
            clearBuildingHighlight();
        });
}

function showBagInfo(featureData, errorMessage = null) {
    const panel = document.getElementById('infoPanel');
    const content = document.getElementById('infoContent');

    if (errorMessage) {
        content.innerHTML = `<p style="color: #e74c3c; padding: 10px;">${errorMessage}</p>`;
    } else if (!featureData) {
        content.innerHTML = '<p style="padding: 10px;">Geen pand gevonden op deze locatie.</p>';
    } else {
        const props = featureData.properties || {};
        console.log('BAG Properties:', props);

        let infoHTML = '';
        const fieldMapping = {
            aantal_verblijfsobjecten: 'Aantal verblijfsobjecten',
            bouwjaar: 'Bouwjaar',
            oorspronkelijkbouwjaar: 'Oorspronkelijk bouwjaar',
            gebruiksdoel: 'Gebruiksdoel',
            identificatie: 'Identificatie',
            pandidentificatie: 'Pand ID',
            oppervlakte_max: 'Oppervlakte max (m²)',
            oppervlakte_min: 'Oppervlakte min (m²)',
            oppervlakte: 'Oppervlakte (m²)',
            rdf_seealso: 'BAG Link',
            status: 'Status',
            pandstatus: 'Pand status',
            voorkomenidentificatie: 'Voorkomen ID',
            documentdatum: 'Document datum',
            functie: 'Functie'
        };

        for (const [key, label] of Object.entries(fieldMapping)) {
            if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
                let value = props[key];

                if (key === 'rdf_seealso' && typeof value === 'string') {
                    const shortUrl = value.length > 50 ? value.substring(0, 47) + '...' : value;
                    value = `<a href="${value}" target="_blank" style="color: #76bc94; text-decoration: none;">${shortUrl}</a>`;
                } else if (key === 'documentdatum' && value) {
                    value = new Date(value).toLocaleDateString('nl-NL');
                } else if (typeof value === 'object') {
                    value = JSON.stringify(value);
                }

                infoHTML += `
                    <div class="info-item">
                        <div class="info-label">${label}</div>
                        <div class="info-value">${value}</div>
                    </div>
                `;
            }
        }

        for (const [key, value] of Object.entries(props)) {
            if (!fieldMapping[key] && value !== undefined && value !== null && value !== '') {
                let displayValue = value;
                if (typeof value === 'object') {
                    displayValue = JSON.stringify(value);
                }

                infoHTML += `
                    <div class="info-item">
                        <div class="info-label">${key}</div>
                        <div class="info-value">${displayValue}</div>
                    </div>
                `;
            }
        }

        if (infoHTML === '') {
            infoHTML = `
                <div class="info-item">
                    <div class="info-label">Ruwe data</div>
                    <div class="info-value"><pre style="white-space: pre-wrap; font-size: 11px;">${JSON.stringify(
                        featureData,
                        null,
                        2
                    )}</pre></div>
                </div>
            `;
        }

        content.innerHTML = infoHTML;
    }

    panel.style.display = 'block';
}

async function getBagPandInfo(latlng) {
    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    const wmsUrl =
        `https://service.pdok.nl/lv/bag/wms/v2_0?` +
        `QUERY_LAYERS=pand&` +
        `INFO_FORMAT=application%2Fjson&` +
        `REQUEST=GetFeatureInfo&` +
        `SERVICE=WMS&` +
        `VERSION=1.3.0&` +
        `FORMAT=image%2Fpng&` +
        `STYLES=&` +
        `TRANSPARENT=true&` +
        `LAYERS=pand&` +
        `FEATURE_COUNT=1&` +
        `I=${Math.round(point.x)}&` +
        `J=${Math.round(point.y)}&` +
        `WIDTH=${size.x}&` +
        `HEIGHT=${size.y}&` +
        `CRS=EPSG%3A4326&` +
        `BBOX=${bbox}`;

    try {
        const response = await fetch(wmsUrl);
        const text = await response.text();

        if (text.trim().startsWith('<')) {
            throw new Error('Server returned HTML error page');
        }

        const data = JSON.parse(text);

        if (data.features && data.features.length > 0) {
            return data.features[0].properties;
        }

        return null;
    } catch (error) {
        console.error('BAG pand info error:', error);
        return null;
    }
}

// ================================
// MEET‐FUNCTIONALITEIT (AANGESCHERPTE VERSIE)
// ================================
let measureMode    = null;    // 'distance' of 'area'
let measurePoints  = [];      // opgeslagen klikpunten
let measureLine    = null;    // L.Polyline voor afstand
let measurePolygon = null;    // L.Polygon voor gebied
let measureMarkers = [];      // L.CircleMarker per klikpunt

/**
 * Start een nieuwe meetmodus (afstand of oppervlakte).
 * Roept clearMeasurements() aan om écht alles leeg te maken.
 */
function startMeasuring(mode) {
    console.log('[MEET] startMeasuring:', mode, '— resetten oude meting');
    clearMeasurements(true); // true = volledige reset zonder showStatus
    measureMode = mode;

    // Activeer de juiste knop visueel
    document.querySelectorAll('.measure-panel .btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'distance') {
        document.getElementById('measureDistance').classList.add('active');
        showStatus('Klik op de kaart om afstand te meten', 'info');
    } else if (mode === 'area') {
        document.getElementById('measureArea').classList.add('active');
        showStatus('Klik op de kaart om oppervlakte te meten', 'info');
    }

    // Cursor veranderen naar kruisje
    map.getContainer().style.cursor = 'crosshair';
}

/**
 * Wis alle meet‐lagen, meetmarkers en reset basis‐variabelen.
 * @param {boolean} silent – als true: showStatus wordt niet opnieuw aangeroepen.
 */
function clearMeasurements(silent = false) {
    console.log('[MEET] clearMeasurements() aangeroepen; silent =', silent);

    // Wis polyline en polygon
    if (measureLine) {
        map.removeLayer(measureLine);
        measureLine = null;
        console.log('[MEET] measureLine verwijderd');
    }
    if (measurePolygon) {
        map.removeLayer(measurePolygon);
        measurePolygon = null;
        console.log('[MEET] measurePolygon verwijderd');
    }

    // Wis alle meetmarkers
    measureMarkers.forEach(m => map.removeLayer(m));
    if (measureMarkers.length) {
        console.log('[MEET] measureMarkers verwijderd:', measureMarkers.length, 'markers');
    }
    measureMarkers = [];

    // Reset meetpunten en modus
    measurePoints = [];
    measureMode   = null;
    console.log('[MEET] measurePoints en measureMode gereset');

    // Wis resultaatweergave in panel
    const resultsDiv = document.getElementById('measureResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
        console.log('[MEET] meetResults HTML geleegd');
    }

    // Deactiveer alle meet‐knoppen
    document.querySelectorAll('.measure-panel .btn').forEach(btn => btn.classList.remove('active'));

    // Cursor terugzetten
    map.getContainer().style.cursor = '';

    if (!silent) {
        showStatus('Metingen gewist', 'info');
    }
}

/**
 * Bereken totale afstand (in meters) tussen opeenvolgende punten.
 */
function calculateDistance(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        total += points[i].distanceTo(points[i + 1]);
    }
    return total;
}

/**
 * Bereken oppervlakte (ongeveer in m²) met shoelace‐formule.
 */
function calculateArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].lat * points[j].lng;
        area -= points[j].lat * points[i].lng;
    }
    area = Math.abs(area) / 2;
    // Omrekenen naar m² (kleine correctie voor breedtegraad)
    return area * 111319.9 * 111319.9 * Math.cos(points[0].lat * Math.PI / 180);
}

/**
 * Toon meetresultaat netjes: meters ↔ kilometers of m² ↔ hectare.
 */
function updateMeasureResult() {
    const resultsDiv = document.getElementById('measureResults');
    if (!resultsDiv) return;
    resultsDiv.innerHTML = ''; // altijd opfrissen

    if (measureMode === 'distance' && measurePoints.length > 1) {
        const totalM = calculateDistance(measurePoints);
        let displayText;
        if (totalM >= 1000) {
            displayText = `${(totalM / 1000).toFixed(2)} km`;
        } else {
            displayText = `${totalM.toFixed(0)} m`;
        }
        resultsDiv.innerHTML = `
            <div class="measure-result" style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-ruler-horizontal" style="color: #76bc94;"></i>
                <span style="font-weight: 600;">Afstand:</span>
                <span>${displayText}</span>
            </div>
        `;
        console.log('[MEET] Afstand bijgewerkt:', displayText);
    }
    else if (measureMode === 'area' && measurePoints.length > 2) {
        const totalM2 = calculateArea(measurePoints);
        let displayText;
        if (totalM2 >= 10000) {
            displayText = `${(totalM2 / 10000).toFixed(2)} ha`;
        } else {
            displayText = `${totalM2.toFixed(0)} m²`;
        }
        resultsDiv.innerHTML = `
            <div class="measure-result" style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-draw-polygon" style="color: #76bc94;"></i>
                <span style="font-weight: 600;">Oppervlakte:</span>
                <span>${displayText}</span>
            </div>
        `;
        console.log('[MEET] Oppervlakte bijgewerkt:', displayText);
    }
}

// ========================================
// GECOMBINEERDE MAP.CLICK HANDLER
// ========================================
map.on('click', function(e) {
    // 1) Meetmodus? → verwerk meten en return
    if (measureMode) {
        console.log('[MAP CLICK] In meetmodus:', measureMode, '; punt toevoegen', e.latlng);
        measurePoints.push(e.latlng);

        // Maak een cirkelmarker voor het punt
        const marker = L.circleMarker(e.latlng, {
            color: '#76bc94',
            radius: 6,
            fillOpacity: 1
        }).addTo(map);
        measureMarkers.push(marker);

        if (measureMode === 'distance') {
            // Teken of vervang polyline vanaf minstens 2 punten
            if (measurePoints.length > 1) {
                if (measureLine) {
                    map.removeLayer(measureLine);
                }
                measureLine = L.polyline(measurePoints, {
                    color: '#76bc94',
                    weight: 3
                }).addTo(map);
            }
            updateMeasureResult();
        }
        else if (measureMode === 'area') {
            // Teken of vervang polygon vanaf minstens 3 punten
            if (measurePoints.length > 2) {
                if (measurePolygon) {
                    map.removeLayer(measurePolygon);
                }
                measurePolygon = L.polygon(measurePoints, {
                    color: '#76bc94',
                    fillColor: '#76bc94',
                    fillOpacity: 0.3,
                    weight: 2
                }).addTo(map);
                updateMeasureResult();
            }
        }

        return; // Héél belangrijk: stop hier, zodat BAG/KVK niet dubbel wordt aangeroepen
    }

    // 2) Radius-modus actief? → kies middelpunt
    if (document.getElementById('searchTabRadius').classList.contains('active')) {
        const radiusSearchCenter = e.latlng;

        // Verwijder oude centre-markering
        if (window.radiusCenterMarker) {
            map.removeLayer(window.radiusCenterMarker);
        }

        // Maak een grotere cirkelmarker (CSS-klasse “radius-center-marker”)
        window.radiusCenterMarker = L.circleMarker(radiusSearchCenter, {
            radius: 14,
            className: 'radius-center-marker'
        }).addTo(map);

        // Toon korte coördinaatinfo onder de slider
        const existingInfo = document.getElementById('radiusCenterInfo');
        if (existingInfo) {
            existingInfo.remove();
        }
        const infoDiv = document.createElement('div');
        infoDiv.id = 'radiusCenterInfo';
        infoDiv.style.cssText = 'font-size: 13px; color: #333; margin-top: 5px; text-align: center;';
        infoDiv.textContent = `Middelpunt: ${radiusSearchCenter.lat.toFixed(5)}, ${radiusSearchCenter.lng.toFixed(5)}`;
        document.getElementById('radiusSearchMode').appendChild(infoDiv);

        showStatus('Middelpunt gekozen voor straalzoektocht', 'success');
        return;
    }

    // 3) Anders: BAG-/KVK-info ophalen (als BAG-laag actief is)
    if (document.getElementById('bagLayer').checked) {
        updateInfoBar('Pand‐ en bedrijfsinformatie ophalen...', 'fas fa-spinner fa-spin');
        getBagAndKvkInfo(e.latlng);
    } else {
        updateInfoBar('Zet BAG panden aan om gebouwinformatie te bekijken', 'fas fa-exclamation-triangle');
        showStatus('BAG‐laag niet actief', 'error');
    }
});

// ========================================
// ESC = Meting stoppen en resetten
// ========================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && measureMode) {
        console.log('[KEYDOWN] Escape gedrukt — meting stoppen');
        clearMeasurements();
    }
});

// ========================================
// KNOPPEN KOPPELEN AAN FUNCTIES
// ========================================
document.getElementById('measureDistance').addEventListener('click', () => {
    startMeasuring('distance');
});
document.getElementById('measureArea').addEventListener('click', () => {
    startMeasuring('area');
});
document.getElementById('clearMeasurements').addEventListener('click', () => {
    clearMeasurements();
});

// ========================================
// EVENT LISTENERS VOOR LAGEN & ZOEKTAB
// ========================================
// Layer control
document.getElementById('osmLayer').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(layers.osm);
    } else {
        map.removeLayer(layers.osm);
    }
});

document.getElementById('topoLayer').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(layers.topo);
        if (document.getElementById('bagLayer').checked) {
            layers.bag.bringToFront();
        }
    } else {
        map.removeLayer(layers.topo);
    }
});

document.getElementById('bagLayer').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(layers.bag);
        layers.bag.bringToFront();
        updateInfoBar('BAG panden zichtbaar - klik op gebouwen voor informatie', 'fas fa-building');
    } else {
        map.removeLayer(layers.bag);
        updateInfoBar('BAG panden uitgeschakeld - zet aan voor gebouwinformatie', 'fas fa-exclamation-triangle');
    }
});

document.getElementById('luchtfotoLayer').addEventListener('change', function () {
    if (this.checked) {
        // 1) voeg luchtfoto op de kaart
        map.addLayer(layers.luchtfoto);
        // 2) voeg meteen de luchtfotolabels toe
        map.addLayer(layers.luchtfotoLabels);

        // Als BAG actief is, breng die naar voren
        if (document.getElementById('bagLayer').checked) {
            layers.bag.bringToFront();
        }
    } else {
        // bij uitvinken: verwijder luchtfoto + labels
        map.removeLayer(layers.luchtfoto);
        map.removeLayer(layers.luchtfotoLabels);
    }
});

// Handle kadastrale-perceellaag
document.getElementById('perceelLayer').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(layers.perceel);
        if (document.getElementById('bagLayer').checked) {
            layers.bag.bringToFront();
        }
    } else {
        map.removeLayer(layers.perceel);
    }
});

// Zoektabs
document.getElementById('searchTabAddress').addEventListener('click', function () {
    document.getElementById('searchTabAddress').classList.add('active');
    document.getElementById('searchTabKvk').classList.remove('active');
    document.getElementById('searchTabRadius').classList.remove('active');

    document.getElementById('searchTabAddress').style.borderBottomColor = '#76bc94';
    document.getElementById('searchTabAddress').style.color = '#76bc94';
    document.getElementById('searchTabKvk').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabKvk').style.color = '#666';
    document.getElementById('searchTabRadius').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabRadius').style.color = '#666';

    document.getElementById('addressSearch').style.display = 'block';
    document.getElementById('kvkSearch').style.display = 'none';
    document.getElementById('radiusSearchMode').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('radiusCenterInfo')?.remove();
});

document.getElementById('searchTabKvk').addEventListener('click', function () {
    document.getElementById('searchTabKvk').classList.add('active');
    document.getElementById('searchTabAddress').classList.remove('active');
    document.getElementById('searchTabRadius').classList.remove('active');

    document.getElementById('searchTabKvk').style.borderBottomColor = '#76bc94';
    document.getElementById('searchTabKvk').style.color = '#76bc94';
    document.getElementById('searchTabAddress').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabAddress').style.color = '#666';
    document.getElementById('searchTabRadius').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabRadius').style.color = '#666';

    document.getElementById('kvkSearch').style.display = 'block';
    document.getElementById('addressSearch').style.display = 'none';
    document.getElementById('radiusSearchMode').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('radiusCenterInfo')?.remove();
});

document.getElementById('searchTabRadius').addEventListener('click', function () {
    document.getElementById('searchTabRadius').classList.add('active');
    document.getElementById('searchTabAddress').classList.remove('active');
    document.getElementById('searchTabKvk').classList.remove('active');

    document.getElementById('searchTabRadius').style.borderBottomColor = '#76bc94';
    document.getElementById('searchTabRadius').style.color = '#76bc94';
    document.getElementById('searchTabAddress').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabAddress').style.color = '#666';
    document.getElementById('searchTabKvk').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabKvk').style.color = '#666';

    document.getElementById('radiusSearchMode').style.display = 'block';
    document.getElementById('addressSearch').style.display = 'none';
    document.getElementById('kvkSearch').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
});

// KVK search (op naam, via suggest + detail)
document.getElementById('kvkSearchBtn').addEventListener('click', async function () {
    console.log('=== KVK SEARCH BUTTON CLICKED ===');
    const query = document.getElementById('kvkSearchInput').value.trim();

    if (!query) {
        showStatus('Voer een KVK nummer of bedrijfsnaam in', 'error');
        return;
    }
    if (query.length < OPENKVK_CONFIG.minSearchLength) {
        showStatus(`Voer minimaal ${OPENKVK_CONFIG.minSearchLength} karakters in`, 'error');
        return;
    }

    console.log('Searching for:', query, 'met max results:', OPENKVK_CONFIG.maxSearchResults);

    const container = document.getElementById('searchResults');
    container.innerHTML = '<div class="search-result"><i class="fas fa-spinner fa-spin"></i> Overheid.io gegevens ophalen...</div>';

    try {
        const suggestions = await searchKvkViaSuggest(query);
        console.log('Search results:', suggestions.length, 'items');

        if (suggestions.length > 0) {
            showStatus(`${suggestions.length} bedrijven gevonden (max ${OPENKVK_CONFIG.maxSearchResults})`, 'success');
        } else {
            showStatus('Geen bedrijven gevonden', 'info');
        }

        displayKvkSearchResults(suggestions);
    } catch (error) {
        console.error('❌ KVK search error:', error);
        container.innerHTML = `<div class="search-result" style="color: #e74c3c;">❌ Fout: ${error.message}</div>`;
        showStatus('Fout bij zoeken', 'error');
    }
});

document.getElementById('kvkSearchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        document.getElementById('kvkSearchBtn').click();
    }
});

// Address search
document.getElementById('searchBtn').addEventListener('click', () => {
    console.log('Address search button clicked');
    searchAddress();
});

document.getElementById('searchInput').addEventListener('input', function (e) {
    console.log('Search input changed:', e.target.value);
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length >= 3) {
        searchTimeout = setTimeout(() => {
            console.log('Auto-search triggered for:', query);
            searchAddress();
        }, 500);
    } else {
        console.log('Query te kort, resultaten verwijderen');
        document.getElementById('searchResults').innerHTML = '';
    }
});

document.getElementById('searchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        console.log('Enter key pressed in address search');
        clearTimeout(searchTimeout);
        searchAddress();
    }
});

// Info panel controls
document.getElementById('closeInfo').addEventListener('click', function () {
    document.getElementById('infoPanel').style.display = 'none';
    document.getElementById('kvkSection').style.display = 'none';
    clearBuildingHighlight();
});

// ========================================
// RADIUS SEARCH FUNCTIONALITY
// ========================================
let _radiusResultsLayerGroup = null;

document.getElementById('radiusSlider').addEventListener('input', function () {
    document.getElementById('radiusValue').textContent = `${this.value} m`;
});

document.getElementById('radiusSearchBtn').addEventListener('click', async function () {
    const radius = parseInt(document.getElementById('radiusSlider').value, 10);

    if (!radius || radius < 100) {
        showStatus('Radius minimaal 100 m', 'error');
        return;
    }
    if (!window.radiusCenterMarker) {
        showStatus('Klik eerst op de kaart om een middelpunt te kiezen', 'error');
        return;
    }

    const centerLatLng = window.radiusCenterMarker.getLatLng();
    const lat = centerLatLng.lat.toFixed(6);
    const lon = centerLatLng.lng.toFixed(6);
    const apiKey = OPENKVK_CONFIG.apiKey;

    const base = `https://api.overheid.io/v3/geo/openkvk/radius/${lat}/${lon}/${radius}`;
    const fields = [
        'naam',
        'kvknummer',
        'rechtsvormCode',
        'rechtsvormOmschrijving',
        'vestigingsnummer',
        'inschrijvingstype',
        'pand_id',
        'updated_at',
        'actief',
        'vbo_id',
        'activiteitomschrijving',
        'activiteiten.omschrijving',
        'activiteiten.code',
        'activiteiten.hoofdactiviteit',
        'huidigeHandelsNamen',
        'bezoeklocatie.plaats',
        'bezoeklocatie.straat',
        'bezoeklocatie.huisnummer',
        'bezoeklocatie.postcode',
        'sbi',
        'slug',
        'locatie.lat',
        'locatie.lon',
        'postlocatie'
    ];
    const params = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const url = `${base}?${params}&ovio-api-key=${apiKey}`;

    showStatus(`Bedrijven binnen ${radius} m zoeken…`, 'info');

    try {
        // Tel deze radius‐call als KVK-call
        kvkRequestCount++;
        console.log('🔢 KVK calls so far:', kvkRequestCount);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'ovio-api-key': apiKey
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        // Verwijder oude resultaten
        if (_radiusResultsLayerGroup) {
            map.removeLayer(_radiusResultsLayerGroup);
        }
        _radiusResultsLayerGroup = L.layerGroup().addTo(map);

        if (!data.features || data.features.length === 0) {
            showStatus('Geen bedrijven gevonden in deze straal', 'info');
            return;
        }

        // Zoom naar alle gevonden bedrijven
        const latlngs = data.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds.pad(0.2));

        data.features.forEach(feat => {
            const coords = feat.geometry.coordinates;
            const props = feat.properties;

            const marker = L.marker([coords[1], coords[0]], {
                icon: L.divIcon({
                    className: 'custom-company-marker',
                    html: `<div style="
                        background-color: #76bc94;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 20px;
                        height: 20px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        position: relative;
                    "></div>
                    <div style="
                        position: absolute;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 0;
                        height: 0;
                        border-left: 6px solid transparent;
                        border-right: 6px solid transparent;
                        border-top: 8px solid #76bc94;
                        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
                    "></div>`,
                    iconSize: [20, 28],
                    iconAnchor: [10, 28],
                    popupAnchor: [0, -28]
                })
            }).addTo(_radiusResultsLayerGroup);

            marker.on('click', () => {
                formatCompanyInfo(props);
            });
        });

        showStatus(`${data.features.length} bedrijven getoond op kaart`, 'success');
    } catch (err) {
        console.error('Fout bij radius-search:', err);
        showStatus(`Fout bij zoeken: ${err.message}`, 'error');
    }
});

// Reset-knop voor radius-zoekactie
document.getElementById('radiusResetBtn').addEventListener('click', function () {
    if (window.radiusCenterMarker) {
        map.removeLayer(window.radiusCenterMarker);
        window.radiusCenterMarker = null;
    }
    if (_radiusResultsLayerGroup) {
        map.removeLayer(_radiusResultsLayerGroup);
        _radiusResultsLayerGroup = null;
    }
    document.getElementById('radiusCenterInfo')?.remove();
    showStatus('Radius zoekactie gereset', 'success');
});

// ========================================
// FORMAT COMPANY INFO (bij klik op marker)
// ========================================
function formatCompanyInfo(props) {
    const panel = document.getElementById('infoPanel');
    const content = document.getElementById('infoContent');
    const kvkSection = document.getElementById('kvkSection');
    const kvkContent = document.getElementById('kvkContent');

    panel.style.display = 'block';
    kvkSection.style.display = 'none';

    let html = '';

    // Naam / KVK
    html += `<div class="info-item"><div class="info-label">Naam</div><div class="info-value">${props.naam}</div></div>`;
    html += `<div class="info-item"><div class="info-label">KVK-nummer</div><div class="info-value">${props.kvknummer}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Rechtsvorm</div><div class="info-value">${props.rechtsvormOmschrijving || props.rechtsvormCode}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Vestigingsnr.</div><div class="info-value">${props.vestigingsnummer}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Inschrijvingstype</div><div class="info-value">${props.inschrijvingstype}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Actief</div><div class="info-value">${props.actief ? 'Ja' : 'Nee'}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Pand ID</div><div class="info-value">${props.pand_id}</div></div>`;
    html += `<div class="info-item"><div class="info-label">Laatst bijgewerkt</div><div class="info-value">${formatDate(props.updated_at)}</div></div>`;
    html += `<div class="info-item"><div class="info-label">VBO ID</div><div class="info-value">${props.vbo_id}</div></div>`;

    // Bezoekadres
    if (props.bezoeklocatie) {
        html += `<div class="info-item"><div class="info-label">Bezoekadres</div><div class="info-value">${formatAddress(props.bezoeklocatie)}</div></div>`;
    }

    // Postadres
    if (props.postlocatie && props.postlocatie.length > 0) {
        html += `<div class="info-item"><div class="info-label">Postadres</div><div class="info-value">${formatPostAddress(props.postlocatie[0])}</div></div>`;
    }

    // Activiteit / SBI
    html += `<div class="info-item"><div class="info-label">Activiteitomschrijving</div><div class="info-value">${props.activiteitomschrijving}</div></div>`;

    if (props.activiteiten && props.activiteiten.length > 0) {
        const activiteitenHtml = props.activiteiten
            .map(act => {
                const hoofd = act.hoofdactiviteit ? ' (hoofd)' : '';
                return `${act.code} - ${act.omschrijving}${hoofd}`;
            })
            .join('<br>');
        html += `<div class="info-item"><div class="info-label">Activiteiten (SBI)</div><div class="info-value">${activiteitenHtml}</div></div>`;
    }

    if (props.sbi && props.sbi.length > 0) {
        html += `<div class="info-item"><div class="info-label">SBI-codes</div><div class="info-value">${props.sbi.join(', ')}</div></div>`;
    }

    if (props.huidigeHandelsNamen && props.huidigeHandelsNamen.length > 0) {
        html += `<div class="info-item"><div class="info-label">Handelsnamen</div><div class="info-value">${props.huidigeHandelsNamen.join(', ')}</div></div>`;
    }

    // Locatie / zoom-knop
    if (props.locatie) {
        const lat = parseFloat(props.locatie.lat).toFixed(5);
        const lon = parseFloat(props.locatie.lon).toFixed(5);
        html += `<div class="info-item"><div class="info-label">Coördinaten</div><div class="info-value">${lat}, ${lon} <button onclick="zoomToCompanyLocation(${props.locatie.lat}, ${props.locatie.lon}, '${props.naam.replace(/'/g, "\\'")}')" style="margin-left: 6px; padding: 2px 6px; font-size: 10px; background: #76bc94; color: white; border: none; border-radius: 3px; cursor: pointer;"><i class="fas fa-crosshairs"></i> Zoom</button></div></div>`;
    }

    content.innerHTML = html;
    panel.style.display = 'block';
}

// ========================================
// ZOOM-TO-COMPANY-LOCATION FUNCTION
// ========================================
/**
 * Zoom naar een bedrijf op basis van lat/lng en toon een popup met de bedrijfsnaam.
 * Wordt aangeroepen door de “Zoom”-knoppen in de KVK-lijst.
 */
function zoomToCompanyLocation(lat, lon, name) {
    // Verwijder eventueel een bestaande marker
    if (searchMarker) {
        map.removeLayer(searchMarker);
    }

    // Maak een nieuw marker-icoon (zelfde stijl als in zoomToCompany)
    searchMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'custom-company-marker',
            html: `
                <div style="
                    background-color: #76bc94;
                    border: 3px solid white;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                ">B</div>
                <div style="
                    position: absolute;
                    top: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 8px solid #76bc94;
                    filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
                "></div>`,
            iconSize: [24, 32],
            iconAnchor: [12, 32],
            popupAnchor: [0, -32]
        })
    }).addTo(map);

    // Popup met bedrijfsnaam
    const popupContent = `
        <div style="font-family: 'Segoe UI', sans-serif; min-width: 150px; text-align: center;">
            <strong style="color: #76bc94; font-size: 14px;">${name}</strong>
        </div>
    `;
    searchMarker.bindPopup(popupContent).openPopup();

    // Zoom de kaart naar het bedrijf
    map.flyTo([lat, lon], 18, {
        animate: true,
        duration: 1.5
    });
}

// ========================================
// ESCAPE‐HANDLING VOOR RADIUS‐ EN MEET‐MODUS
// ========================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && measureMode) {
        clearMeasurements();
    }
});

// ========================================
// INITIALIZATION
// ========================================
window.addEventListener('DOMContentLoaded', function () {
    console.log('✅ DOM fully loaded');

    console.log('🔍 Checking DOM elements...');
    console.log('Info bar exists:', !!document.getElementById('infoBar'));
    console.log('Mobile menu button exists:', !!document.getElementById('mobileMenuBtn'));
    console.log('Mobile menu exists:', !!document.getElementById('mobileMenu'));

    const allElements = document.querySelectorAll('[id]');
    console.log('All elements with IDs:', Array.from(allElements).map((el) => el.id));
});

window.addEventListener('load', function () {
    console.log('✅ WebGIS loaded successfully');

    setTimeout(() => {
        initMobileMenu();
    }, 300);

    // Zorg dat BAG aan staat
    document.getElementById('bagLayer').checked = true;
    map.addLayer(layers.bag);
    layers.bag.bringToFront();

    setTimeout(() => {
        console.log('🔍 Debugging info bar...');
        const infoBar = document.getElementById('infoBar');
        if (infoBar) {
            infoBar.style.display = 'block';
            infoBar.style.visibility = 'visible';
            infoBar.style.position = 'fixed';
            infoBar.style.top = '10px';
            infoBar.style.left = '50%';
            infoBar.style.transform = 'translateX(-50%)';
            infoBar.style.zIndex = '999';
            infoBar.style.background = '#76bc94';
            infoBar.style.color = 'white';
            infoBar.style.padding = '12px 20px';
            infoBar.style.borderRadius = '12px';
            infoBar.style.minWidth = '350px';
            infoBar.style.textAlign = 'center';
            infoBar.style.fontWeight = '600';
            infoBar.style.fontSize = '14px';
            console.log('✅ Info bar forced visible with inline styles');
        } else {
            console.error('❌ Info bar element STILL not found!');
            createInfoBarManually();
        }

        console.log('🔍 Debugging mobile menu button...');
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            console.log('✅ Mobile menu button found:', mobileMenuBtn);
            if (window.innerWidth <= 768) {
                mobileMenuBtn.style.display = 'flex';
                mobileMenuBtn.style.position = 'fixed';
                mobileMenuBtn.style.top = '70px';
                mobileMenuBtn.style.right = '10px';
                mobileMenuBtn.style.zIndex = '1002';
                mobileMenuBtn.style.background = '#76bc94';
                mobileMenuBtn.style.color = 'white';
                mobileMenuBtn.style.width = '50px';
                mobileMenuBtn.style.height = '50px';
                mobileMenuBtn.style.borderRadius = '8px';
                mobileMenuBtn.style.border = 'none';
                mobileMenuBtn.style.alignItems = 'center';
                mobileMenuBtn.style.justifyContent = 'center';
                mobileMenuBtn.style.cursor = 'pointer';
                mobileMenuBtn.style.fontSize = '18px';
                console.log('✅ Mobile menu button forced visible');
            } else {
                console.log('ℹ️ Desktop view - mobile menu button hidden');
            }
        } else {
            console.error('❌ Mobile menu button STILL not found!');
            createMobileMenuManually();
        }
    }, 500);

    setTimeout(() => {
        updateInfoBar('Zoom in en klik op een gebouw voor pand- en bedrijfsinformatie', 'fas fa-building');
    }, 600);

    console.log('🚀 WebGIS volledig geladen en klaar voor gebruik');
});

function createInfoBarManually() {
    console.log('🔧 Creating info bar manually...');

    const infoBar = document.createElement('div');
    infoBar.id = 'infoBar';
    infoBar.className = 'info-bar';
    infoBar.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <span id="infoBarText">Zoom in en klik op een gebouw voor pand- en bedrijfsinformatie</span>
    `;

    infoBar.style.position = 'fixed';
    infoBar.style.top = '10px';
    infoBar.style.left = '50%';
    infoBar.style.transform = 'translateX(-50%)';
    infoBar.style.zIndex = '999';
    infoBar.style.background = '#76bc94';
    infoBar.style.color = 'white';
    infoBar.style.padding = '12px 20px';
    infoBar.style.borderRadius = '12px';
    infoBar.style.minWidth = '350px';
    infoBar.style.textAlign = 'center';
    infoBar.style.fontWeight = '600';
    infoBar.style.fontSize = '14px';
    infoBar.style.display = 'block';
    infoBar.style.visibility = 'visible';

    document.body.appendChild(infoBar);
    console.log('✅ Info bar created manually');
}

function createMobileMenuManually() {
    console.log('🔧 Creating mobile menu manually...');

    const mobileMenuBtn = document.createElement('button');
    mobileMenuBtn.id = 'mobileMenuBtn';
    mobileMenuBtn.className = 'mobile-menu-btn';
    mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';

    mobileMenuBtn.style.position = 'fixed';
    mobileMenuBtn.style.top = '70px';
    mobileMenuBtn.style.right = '10px';
    mobileMenuBtn.style.zIndex = '1002';
    mobileMenuBtn.style.background = '#76bc94';
    mobileMenuBtn.style.color = 'white';
    mobileMenuBtn.style.width = '50px';
    mobileMenuBtn.style.height = '50px';
    mobileMenuBtn.style.borderRadius = '8px';
    mobileMenuBtn.style.border = 'none';
    mobileMenuBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    mobileMenuBtn.style.alignItems = 'center';
    mobileMenuBtn.style.justifyContent = 'center';
    mobileMenuBtn.style.cursor = 'pointer';
    mobileMenuBtn.style.fontSize = '18px';

    document.body.appendChild(mobileMenuBtn);
    console.log('✅ Mobile menu button created manually');
}

console.log('✅ Overheid.io OpenKVK WebGIS integration loaded');
console.log('ℹ️ Available test functions:');
console.log('  - getKvkCompaniesByPandId("0307100000322063") - Get companies by pand_id');
console.log('  - searchKvkViaSuggest("assetman") - Search via suggest API');
console.log('  - getKvkCompanyDetails("/v3/openkvk/...") - Get company details');
