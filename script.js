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
// OVERHEID.IO OPENKVK API INTEGRATION
// ========================================

const OPENKVK_CONFIG = {
    baseUrl: 'https://api.overheid.io/v3/openkvk',
    suggestUrl: 'https://api.overheid.io/v3/suggest/openkvk',
    radiusUrl: 'https://api.overheid.io/v3/geo/openkvk/radius',
    apiKey: 'af0f54b3b1a1718d8003866dd8fcae6d7d3eff2e726c72b99bbc60756870d455',
    maxSearchResults: 5,
    minSearchLength: 3
};

async function getKvkCompaniesByPandId(pandId) {
    console.log('OpenKVK API lookup for pand_id:', pandId);
    try {
        const url = `${OPENKVK_CONFIG.baseUrl}?filters[pand_id]=${pandId}&ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('OpenKVK API URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
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
        if (data._embedded && data._embedded.bedrijf && data._embedded.bedrijf.length > 0) {
            console.log(`Found ${data._embedded.bedrijf.length} companies, fetching detailed info...`);
            for (const bedrijf of data._embedded.bedrijf) {
                if (bedrijf._links && bedrijf._links.self && bedrijf._links.self.href) {
                    console.log('Fetching detailed info for:', bedrijf.kvknummer);
                    const detailedCompany = await getKvkCompanyDetails(bedrijf._links.self.href);
                    if (detailedCompany) {
                        companies.push(detailedCompany);
                    }
                } else {
                    companies.push(parseOverheidApiCompany(bedrijf));
                }
            }
            console.log(`Processed ${companies.length} companies with detailed info`);
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
        console.log('🔍 Making API request with max results:', OPENKVK_CONFIG.maxSearchResults);
        const url = `${OPENKVK_CONFIG.suggestUrl}/${encodeURIComponent(query)}?ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('🔍 Suggest API URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
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
            console.log(`✅ Found ${data.length} suggestions, returning ${limitedResults.length} (max: ${OPENKVK_CONFIG.maxSearchResults})`);
            return limitedResults.map(item => parseOverheidSuggestItem(item));
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
        const url = `https://api.overheid.io${link}?ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('Company details URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
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
        hoofdactiviteit: bedrijf.activiteitomschrijving || 'Onbekend',
        status: bedrijf.actief !== false ? 'Actief' : 'Inactief',
        type: bedrijf.inschrijvingstype || 'Onbekend',
        rechtsvorm: bedrijf.rechtsvormOmschrijving || bedrijf.rechtsvormCode || 'Onbekend',
        adres: bedrijf.bezoeklocatie ? {
            straatnaam: bedrijf.bezoeklocatie.straat,
            huisnummer: bedrijf.bezoeklocatie.huisnummer,
            postcode: bedrijf.bezoeklocatie.postcode,
            plaats: bedrijf.bezoeklocatie.plaats
        } : null,
        handelsnamen: bedrijf.huidigeHandelsNamen || [],
        sbiActiviteiten: bedrijf.activiteiten || [],
        sbiCodes: bedrijf.sbi || [],
        locatie: bedrijf.locatie || null,
        pandId: bedrijf.pand_id || null,
        verblijfsobjectgebruiksdoel: bedrijf.verblijfsobjectgebruiksdoel,
        vboId: bedrijf.vbo_id,
        updatedAt: bedrijf.updated_at,
        isVestiging: bedrijf.vestiging,
        postlocatie: bedrijf.postlocatie,
        slug: bedrijf.slug,
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

async function testOverheidApi() {
    console.log('=== TESTING OVERHEID.IO API CONNECTION ===');
    try {
        const testUrl = `${OPENKVK_CONFIG.suggestUrl}/assetman?ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('Test URL:', testUrl);
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey
            }
        });
        console.log('Test response status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ OVERHEID.IO API CONNECTION SUCCESS');
            console.log('Found suggestions:', data?.length || 0);
            showStatus('Overheid.io API verbinding succesvol', 'success');
            return data;
        } else {
            console.log('❌ Overheid.io API test failed:', response.status);
            showStatus('Overheid.io API test gefaald', 'error');
            return null;
        }
    } catch (error) {
        console.log('❌ OVERHEID.IO API CONNECTION FAILED:', error.message);
        showStatus('Overheid.io API niet bereikbaar', 'error');
        return null;
    }
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

let osmLayer;
try {
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
    });
    osmLayer.on('loading', () => log('OSM tiles are loading...'));
    osmLayer.on('load', () => log('OSM tiles loaded successfully'));
    osmLayer.on('tileerror', (e) => log('OSM tile error: ' + e.error));
    osmLayer.addTo(map);
    log('OSM layer added to map');
} catch (error) {
    log('Error loading OSM layer: ' + error.message);
}

const topoLayer = L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
    attribution: '© PDOK',
    maxZoom: 19
});
const luchtfotoLayer = L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg', {
    attribution: '© PDOK Luchtfoto',
    maxZoom: 19
});
const bagLayer = L.tileLayer.wms('https://service.pdok.nl/lv/bag/wms/v2_0', {
    layers: 'pand',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    attribution: '© BAG',
    zIndex: 1000
});
const perceelLayer = L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0?', {
    layers: 'perceel',
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
    console.log('🔄 Updating info bar with:', message);
    const infoBar = document.getElementById('infoBar');
    const infoText = document.getElementById('infoBarText');
    if (!infoBar || !infoText) return;
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
    infoText.textContent = message;
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
    if (!mobileMenuBtn || !mobileMenu || !mobileOverlay || !mobileMenuClose) {
        console.error('❌ Some mobile menu elements not found');
        return;
    }
    function openMobileMenu() {
        console.log('📱 Opening mobile menu');
        mobileMenu.style.display = 'block';
        mobileOverlay.style.display = 'block';
        setTimeout(() => mobileMenu.classList.add('active'), 10);
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
    console.log('✅ Mobile menu listeners added');
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
    if (!mobileBagLayer || !mobileOsmLayer || !mobileTopoLayer || !mobileLuchtfotoLayer || !mobilePerceelLayer) {
        console.error('❌ Some mobile layer checkboxes not found');
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
        'mobileSearchTabAddress', 'mobileSearchTabKvk', 'mobileSearchTabRadius',
        'mobileAddressSearch', 'mobileKvkSearch', 'mobileRadiusSearch',
        'mobileRadiusSlider', 'mobileRadiusReset', 'mobileSearchResults',
        'mobileBagLayer', 'mobileOsmLayer', 'mobileTopoLayer', 'mobileLuchtfotoLayer', 'mobilePerceelLayer',
        'mobileMeasureDistance', 'mobileMeasureArea', 'mobileClearMeasurements',
        'mobileSearchBtn', 'mobileKvkSearchBtn', 'mobileSearchInput', 'mobileKvkSearchInput', 'mobileMeasureResults', 'mobileRadiusValue'
    ];
    for (const id of mobileElements) {
        if (!document.getElementById(id)) {
            console.error(`❌ Mobile element not found: ${id}`);
            return;
        }
    }
    console.log('✅ All mobile elements found');

    // Mobile tabs
    document.getElementById('mobileSearchTabAddress').addEventListener('click', () => {
        document.getElementById('mobileSearchTabAddress').classList.add('active');
        document.getElementById('mobileSearchTabKvk').classList.remove('active');
        document.getElementById('mobileSearchTabRadius').classList.remove('active');
        document.getElementById('mobileAddressSearch').style.display = 'block';
        document.getElementById('mobileKvkSearch').style.display = 'none';
        document.getElementById('mobileRadiusSearch').style.display = 'none';
        document.getElementById('mobileSearchResults').innerHTML = '';
    });
    document.getElementById('mobileSearchTabKvk').addEventListener('click', () => {
        document.getElementById('mobileSearchTabKvk').classList.add('active');
        document.getElementById('mobileSearchTabAddress').classList.remove('active');
        document.getElementById('mobileSearchTabRadius').classList.remove('active');
        document.getElementById('mobileKvkSearch').style.display = 'block';
        document.getElementById('mobileAddressSearch').style.display = 'none';
        document.getElementById('mobileRadiusSearch').style.display = 'none';
        document.getElementById('mobileSearchResults').innerHTML = '';
    });
    document.getElementById('mobileSearchTabRadius').addEventListener('click', () => {
        document.getElementById('mobileSearchTabRadius').classList.add('active');
        document.getElementById('mobileSearchTabAddress').classList.remove('active');
        document.getElementById('mobileSearchTabKvk').classList.remove('active');
        document.getElementById('mobileRadiusSearch').style.display = 'block';
        document.getElementById('mobileAddressSearch').style.display = 'none';
        document.getElementById('mobileKvkSearch').style.display = 'none';
        document.getElementById('mobileSearchResults').innerHTML = '';
    });

    // Mobile layer toggles
    document.getElementById('mobileBagLayer').addEventListener('change', function() {
        document.getElementById('bagLayer').checked = this.checked;
        document.getElementById('bagLayer').dispatchEvent(new Event('change'));
    });
    document.getElementById('mobileOsmLayer').addEventListener('change', function() {
        document.getElementById('osmLayer').checked = this.checked;
        document.getElementById('osmLayer').dispatchEvent(new Event('change'));
    });
    document.getElementById('mobileTopoLayer').addEventListener('change', function() {
        document.getElementById('topoLayer').checked = this.checked;
        document.getElementById('topoLayer').dispatchEvent(new Event('change'));
    });
    document.getElementById('mobileLuchtfotoLayer').addEventListener('change', function() {
        document.getElementById('luchtfotoLayer').checked = this.checked;
        document.getElementById('luchtfotoLayer').dispatchEvent(new Event('change'));
    });
    document.getElementById('mobilePerceelLayer').addEventListener('change', function() {
        document.getElementById('perceelLayer').checked = this.checked;
        document.getElementById('perceelLayer').dispatchEvent(new Event('change'));
    });

    // Mobile measure controls
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

    // Mobile search
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

    // Mobile radius controls
    document.getElementById('mobileRadiusSlider').addEventListener('input', function(e) {
        const val = e.target.value;
        document.getElementById('mobileRadiusValue').textContent = `${val} m`;
    });
    document.getElementById('mobileRadiusReset').addEventListener('click', function() {
        resetRadiusSearch();
        document.getElementById('mobileRadiusValue').textContent = '100 m';
        document.getElementById('mobileRadiusSlider').value = 100;
    });
    document.getElementById('mobileRadiusSearchBtn').addEventListener('click', function() {
        const radius = parseInt(document.getElementById('mobileRadiusSlider').value, 10);
        const center = radiusCenterMarker ? radiusCenterMarker.getLatLng() : null;
        if (center && radius > 0) {
            searchRadiusCompanies(center.lat, center.lng, radius);
        } else {
            showStatus('Teken eerst een middelpunt of stel een straal in', 'error');
        }
    });

    // Enter key triggers
    document.getElementById('mobileSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('mobileSearchBtn').click();
    });
    document.getElementById('mobileKvkSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('mobileKvkSearchBtn').click();
    });

    console.log('✅ Mobile event listeners setup complete');
}

function setupMobileSearchResultListeners() {
    const mobileResults = document.getElementById('mobileSearchResults');
    const results = mobileResults.querySelectorAll('.search-result, .kvk-search-result');
    results.forEach(result => {
        result.addEventListener('click', () => {
            setTimeout(() => {
                document.getElementById('mobileMenuClose').click();
            }, 100);
        });
    });
}

// ========================================
// SEARCH FUNCTIONALITY
// ========================================

let searchMode = 'address'; // 'address', 'kvk', 'radius'
let searchTimeout;
let searchMarker;

function searchAddress() {
    const query = document.getElementById('searchInput').value.trim();
    console.log('Search function called with query:', query);
    if (!query || query.length < 2) {
        console.log('Query too short, clearing results');
        document.getElementById('searchResults').innerHTML = '';
        return;
    }
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(query)}&fq=type:adres&rows=10`;
    console.log('Search URL:', url);
    fetch(url)
        .then(response => {
            console.log('Search response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Search data received:', data);
            if (data.response && data.response.docs) {
                console.log('Found', data.response.docs.length, 'results');
                displaySearchResults(data.response.docs);
            } else {
                console.log('No docs in response');
                displaySearchResults([]);
            }
        })
        .catch(error => {
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
        .then(response => response.json())
        .then(data => {
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
                map.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });
                document.getElementById('searchResults').innerHTML = '';
                document.getElementById('searchInput').value = doc.weergavenaam;
                console.log('Zoom completed to:', lat, lng);
            }
        })
        .catch(error => {
            console.error('Locatie ophalen fout:', error);
        });
}

async function geocodeAddress(address) {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(address)}&fq=type:adres&rows=1`;
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
        if (companyDetails && companyDetails.adres) {
            let adresStr = companyDetails.adres.straatnaam;
            if (companyDetails.adres.huisnummer) {
                adresStr += ' ' + companyDetails.adres.huisnummer;
            }
            if (companyDetails.adres.plaats) {
                adresStr += ', ' + companyDetails.adres.plaats;
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
                position: relative;
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
        <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px;">
            <strong style="color: #76bc94; font-size: 14px;">${company.naam}</strong><br>
            <small style="color: #666;">KVK: ${company.kvknummer}</small><br>
            ${company.rechtsvorm ? `<small style="color: #666;">${company.rechtsvorm}</small><br>` : ''}
            ${coords.address ? `<small style="color: #888;">${coords.address}</small>` : ''}
        </div>
    `;
    searchMarker.bindPopup(popupContent).openPopup();
    map.flyTo([coords.lat, coords.lng], 18, { animate: true, duration: 1.5 });
}

function serializeKvkResultItem(suggestion) {
    return {
        kvkNummer: suggestion.kvkNummer,
        naam: suggestion.naam,
        postcode: suggestion.postcode,
        vestigingsnummer: suggestion.vestigingsnummer,
        link: suggestion.link,
        _source: 'OVERHEID_SUGGEST'
    };
}

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
    sourceDiv.style.cssText = 'margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 6px; font-size: 11px; text-align: center; color: #666;';
    sourceDiv.innerHTML = '<i class="fas fa-info-circle"></i> Gegevens via Overheid.io OpenKVK API';
    container.appendChild(sourceDiv);
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

function zoomToCompanyLocation(lat, lon, companyName) {
    const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };
    if (searchMarker) {
        map.removeLayer(searchMarker);
    }
    searchMarker = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
            className: 'custom-company-marker',
            html: `<div style="
                background-color: #e74c3c;
                border: 3px solid white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
            ">📍</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
        })
    }).addTo(map);

    const popupContent = `
        <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px;">
            <strong style="color: #e74c3c; font-size: 14px;">${companyName}</strong><br>
            <small style="color: #666;">Exacte bedrijfslocatie</small><br>
            <small style="color: #888;">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</small>
        </div>
    `;
    searchMarker.bindPopup(popupContent).openPopup();
    map.flyTo([coords.lat, coords.lng], 19, { animate: true, duration: 1.5 });
    showStatus(`Gezoomd naar ${companyName}`, 'success');
}

function formatAddress(adres) {
    if (!adres) return 'Onbekend';
    let formatted = '';
    if (adres.straatnaam) {
        formatted += adres.straatnaam;
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
// BAG INFORMATION FUNCTIONS
// ========================================

function getBagInfo(latlng) {
    console.log('BAG info requested for:', latlng);
    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const bounds = map.getBounds();
    console.log('Map pixel point:', point);
    console.log('Map size:', size);
    console.log('Map bounds WGS84:', bounds);

    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    console.log('WGS84 BBOX:', bbox);

    const wmsUrl = `https://service.pdok.nl/lv/bag/wms/v2_0?` +
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
        .then(response => {
            console.log('BAG Response status:', response.status);
            console.log('BAG Response content-type:', response.headers.get('content-type'));
            return response.text();
        })
        .then(text => {
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
                    console.log('First pand properties:', data.features[0].properties);
                    const pandInfo = data.features[0].properties;
                    showBagInfo(data.features[0]);
                    highlightBuilding(latlng, pandInfo);
                } else {
                    console.log('No pand found at clicked location');
                    showBagInfo(null, 'Geen pand gevonden op deze locatie – probeer preciezer te klikken');
                    clearBuildingHighlight();
                }
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.error('Response text:', text);
                showBagInfo(null, `JSON parse fout: ${parseError.message}`);
                clearBuildingHighlight();
            }
        })
        .catch(error => {
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
            'aantal_verblijfsobjecten': 'Aantal verblijfsobjecten',
            'bouwjaar': 'Bouwjaar',
            'oorspronkelijkbouwjaar': 'Oorspronkelijk bouwjaar',
            'gebruiksdoel': 'Gebruiksdoel',
            'identificatie': 'Identificatie',
            'pandidentificatie': 'Pand ID',
            'oppervlakte_max': 'Oppervlakte max (m²)',
            'oppervlakte_min': 'Oppervlakte min (m²)',
            'oppervlakte': 'Oppervlakte (m²)',
            'rdf_seealso': 'BAG Link',
            'status': 'Status',
            'pandstatus': 'Pand status',
            'voorkomenidentificatie': 'Voorkomen ID',
            'documentdatum': 'Document datum',
            'functie': 'Functie'
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
                    <div class="info-value"><pre style="white-space: pre-wrap; font-size: 11px;">${JSON.stringify(featureData, null, 2)}</pre></div>
                </div>
            `;
        }
        content.innerHTML = infoHTML;
    }
    panel.style.display = 'block';
}

async function getBagAndKvkInfo(latlng) {
    console.log('=== getBagAndKvkInfo called ===');
    console.log('Getting BAG and KVK info for:', latlng);
    getBagInfo(latlng);
    const kvkSection = document.getElementById('kvkSection');
    const kvkContent = document.getElementById('kvkContent');
    if (!kvkSection || !kvkContent) {
        console.error('KVK elements not found!');
        return;
    }
    kvkSection.style.display = 'block';
    kvkContent.innerHTML = '<div class="kvk-loading"><i class="fas fa-spinner fa-spin"></i> KVK gegevens ophalen...</div>';
    try {
        console.log('Starting BAG pand lookup for KVK...');
        const pandInfo = await getBagPandInfo(latlng);
        console.log('BAG pand info:', pandInfo);
        if (pandInfo && pandInfo.identificatie) {
            console.log('Pand ID found, looking up KVK with:', pandInfo.identificatie);
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
    }
}

async function getBagPandInfo(latlng) {
    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const wmsUrl = `https://service.pdok.nl/lv/bag/wms/v2_0?` +
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

// ========================================
// RADIUS SEARCH FUNCTIONALITY
// ========================================

let radiusCenterMarker = null;
let radiusCircle = null;
let radiusCompanyMarkers = [];
let radiusPlacingCenter = false;

// Called when user presses the "Teken middelpunt" button
function enableRadiusCenterPlacement() {
    radiusPlacingCenter = true;
    map.getContainer().style.cursor = 'crosshair';
    updateInfoBar('Klik op de kaart om middelpunt te plaatsen voor straal', 'fas fa-crosshairs');
}

async function searchRadiusCompanies(lat, lon, radius) {
    clearRadiusMarkers();
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
    }
    radiusCircle = L.circle([lat, lon], {
        radius: radius,
        color: '#ff8800',
        weight: 2,
        fill: false
    }).addTo(map);

    updateInfoBar(`Zoeken naar bedrijven binnen ${radius} m...`, 'fas fa-spinner fa-spin');

    try {
        const fields = [
            'rechtsvormCode','vestigingsnummer','kvkNummer','activiteiten.omschrijving','activiteiten.code',
            'activiteiten.hoofdactiviteit','vestiging','kvknummer','pand_id','updated_at','actief',
            'rechtsvormOmschrijving','activiteitomschrijving','website','vbo_id','locatie.lon',
            'locatie.lat','huidigeHandelsNamen','naam','bezoeklocatie.plaats','bezoeklocatie.straat',
            'bezoeklocatie.huisnummer','bezoeklocatie.postcode','bezoeklocatie.land','non_mailing_indicatie',
            'subdossiernummer','postlocatie','sbi','inschrijvingstype','_links.self.href'
        ];
        const fieldsQuery = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
        const url = `${OPENKVK_CONFIG.radiusUrl}/${lat}/${lon}/${radius}?${fieldsQuery}&ovio-api-key=${OPENKVK_CONFIG.apiKey}`;

        console.log('Radius API URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Radius API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Radius API data received:', data);

        if (data.features && data.features.length > 0) {
            data.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                const marker = L.marker([parseFloat(coords[1]), parseFloat(coords[0])], {
                    icon: L.divIcon({
                        className: 'custom-company-marker',
                        html: `<div style="
                            background-color: #76bc94;
                            border: 3px solid white;
                            border-radius: 50%;
                            width: 20px;
                            height: 20px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        "></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(map);

                marker.bindTooltip(props.naam, {
                    permanent: true,
                    direction: 'right',
                    offset: [8, 0],
                    className: 'subtle-label'
                });
                radiusCompanyMarkers.push(marker);
            });
            updateInfoBar(`Gevonden: ${data.features.length} bedrijven`, 'fas fa-building');
        } else {
            updateInfoBar('Geen bedrijven gevonden binnen deze straal', 'fas fa-info-circle');
        }
    } catch (error) {
        console.error('Radius zoekfout:', error);
        updateInfoBar('Fout bij radius-zoekopdracht', 'fas fa-exclamation-triangle');
    }
}

function clearRadiusMarkers() {
    radiusCompanyMarkers.forEach(m => map.removeLayer(m));
    radiusCompanyMarkers = [];
}

function resetRadiusSearch() {
    if (radiusCenterMarker) {
        map.removeLayer(radiusCenterMarker);
        radiusCenterMarker = null;
    }
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
    }
    clearRadiusMarkers();
    document.getElementById('radiusCenterInfo').textContent = 'Geen middelpunt gekozen';
    updateInfoBar('Radius-zoekactie gereset', 'fas fa-trash');
    radiusPlacingCenter = false;
}

// ========================================
// MEASUREMENT FUNCTIONALITY
// ========================================

let measureMode = null;
let measurePoints = [];
let measureLine = null;
let measurePolygon = null;
let measureMarkers = [];

function startMeasuring(mode) {
    clearMeasurements();
    measureMode = mode;
    document.querySelectorAll('.measure-panel .btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'distance') {
        document.getElementById('measureDistance').classList.add('active');
        showStatus('Klik op de kaart om afstand te meten', 'info');
    } else if (mode === 'area') {
        document.getElementById('measureArea').classList.add('active');
        showStatus('Klik op de kaart om oppervlakte te meten', 'info');
    }
    map.getContainer().style.cursor = 'crosshair';
}

function clearMeasurements() {
    if (measureLine) {
        map.removeLayer(measureLine);
        measureLine = null;
    }
    if (measurePolygon) {
        map.removeLayer(measurePolygon);
        measurePolygon = null;
    }
    measureMarkers.forEach(marker => map.removeLayer(marker));
    measureMarkers = [];
    document.getElementById('measureResults').innerHTML = '';
    document.querySelectorAll('.measure-panel .btn').forEach(btn => btn.classList.remove('active'));
    measureMode = null;
    map.getContainer().style.cursor = '';
    showStatus('Metingen gewist', 'info');
}

function calculateDistance(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalDistance += points[i].distanceTo(points[i + 1]);
    }
    return totalDistance;
}

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
    return area * 111319.9 * 111319.9 * Math.cos(points[0].lat * Math.PI / 180);
}

function updateMeasureResult() {
    const resultsDiv = document.getElementById('measureResults');
    if (measureMode === 'distance' && measurePoints.length > 1) {
        const distance = calculateDistance(measurePoints);
        let distanceText = distance > 1000
            ? `${(distance / 1000).toFixed(2)} km`
            : `${distance.toFixed(0)} m`;
        resultsDiv.innerHTML = `
            <div class="measure-result">
                <i class="fas fa-ruler-horizontal"></i> Afstand: <strong>${distanceText}</strong>
            </div>`;
    } else if (measureMode === 'area' && measurePoints.length > 2) {
        const area = calculateArea(measurePoints);
        let areaText = area > 10000
            ? `${(area / 10000).toFixed(2)} ha`
            : `${area.toFixed(0)} m²`;
        resultsDiv.innerHTML = `
            <div class="measure-result">
                <i class="fas fa-draw-polygon"></i> Oppervlakte: <strong>${areaText}</strong>
            </div>`;
    }
    updateMobileeMeasureResult();
}

// ========================================
// EVENT LISTENERS
// ========================================

document.getElementById('osmLayer').addEventListener('change', function() {
    this.checked ? map.addLayer(layers.osm) : map.removeLayer(layers.osm);
});
document.getElementById('topoLayer').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(layers.topo);
        if (document.getElementById('bagLayer').checked) layers.bag.bringToFront();
    } else {
        map.removeLayer(layers.topo);
    }
});
document.getElementById('bagLayer').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(layers.bag);
        layers.bag.bringToFront();
        updateInfoBar('BAG panden zichtbaar – klik op gebouwen voor informatie', 'fas fa-building');
    } else {
        map.removeLayer(layers.bag);
        updateInfoBar('BAG panden uitgeschakeld – zet aan voor gebouwinformatie', 'fas fa-exclamation-triangle');
    }
});
document.getElementById('luchtfotoLayer').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(layers.luchtfoto);
        if (document.getElementById('bagLayer').checked) layers.bag.bringToFront();
    } else {
        map.removeLayer(layers.luchtfoto);
    }
});
document.getElementById('perceelLayer').addEventListener('change', function() {
    this.checked ? map.addLayer(layers.perceel) : map.removeLayer(layers.perceel);
});

// Search tab functionality
document.getElementById('searchTabAddress').addEventListener('click', function() {
    searchMode = 'address';
    document.getElementById('searchTabAddress').classList.add('active');
    document.getElementById('searchTabKvk').classList.remove('active');
    document.getElementById('searchTabRadius').classList.remove('active');
    this.style.borderBottomColor = '#76bc94';
    this.style.color = '#76bc94';
    document.getElementById('searchTabKvk').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabKvk').style.color = '#666';
    document.getElementById('searchTabRadius').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabRadius').style.color = '#666';
    document.getElementById('addressSearch').style.display = 'block';
    document.getElementById('kvkSearch').style.display = 'none';
    document.getElementById('radiusSearch').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('kvkSearchInput').value = '';
    document.getElementById('radiusCenterInfo').textContent = 'Geen middelpunt gekozen';
});
document.getElementById('searchTabKvk').addEventListener('click', function() {
    searchMode = 'kvk';
    document.getElementById('searchTabKvk').classList.add('active');
    document.getElementById('searchTabAddress').classList.remove('active');
    document.getElementById('searchTabRadius').classList.remove('active');
    this.style.borderBottomColor = '#76bc94';
    this.style.color = '#76bc94';
    document.getElementById('searchTabAddress').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabAddress').style.color = '#666';
    document.getElementById('searchTabRadius').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabRadius').style.color = '#666';
    document.getElementById('kvkSearch').style.display = 'block';
    document.getElementById('addressSearch').style.display = 'none';
    document.getElementById('radiusSearch').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('radiusCenterInfo').textContent = 'Geen middelpunt gekozen';
});
document.getElementById('searchTabRadius').addEventListener('click', function() {
    searchMode = 'radius';
    document.getElementById('searchTabRadius').classList.add('active');
    document.getElementById('searchTabAddress').classList.remove('active');
    document.getElementById('searchTabKvk').classList.remove('active');
    this.style.borderBottomColor = '#76bc94';
    this.style.color = '#76bc94';
    document.getElementById('searchTabAddress').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabAddress').style.color = '#666';
    document.getElementById('searchTabKvk').style.borderBottomColor = 'transparent';
    document.getElementById('searchTabKvk').style.color = '#666';
    document.getElementById('radiusSearch').style.display = 'block';
    document.getElementById('addressSearch').style.display = 'none';
    document.getElementById('kvkSearch').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('kvkSearchInput').value = '';
    resetRadiusSearch();
});

// KVK search functionality
document.getElementById('kvkSearchBtn').addEventListener('click', async function() {
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
    console.log('Searching for:', query, 'with max results:', OPENKVK_CONFIG.maxSearchResults);
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
document.getElementById('kvkSearchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('kvkSearchBtn').click();
});

// Address search functionality
document.getElementById('searchBtn').addEventListener('click', () => {
    console.log('Address search button clicked');
    searchAddress();
});
document.getElementById('searchInput').addEventListener('input', function(e) {
    console.log('Search input changed:', e.target.value);
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length >= 3) {
        searchTimeout = setTimeout(() => {
            console.log('Auto-search triggered for:', query);
            searchAddress();
        }, 500);
    } else {
        console.log('Query too short, clearing results');
        document.getElementById('searchResults').innerHTML = '';
    }
});
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        searchAddress();
    }
});

// Radius functionality
document.getElementById('radiusCenterBtn').addEventListener('click', () => {
    enableRadiusCenterPlacement();
});
document.getElementById('radiusRadiusBtn').addEventListener('click', () => {
    const sliderVal = parseInt(document.getElementById('radiusSlider').value, 10);
    const center = radiusCenterMarker ? radiusCenterMarker.getLatLng() : null;
    if (center && sliderVal > 0) {
        searchRadiusCompanies(center.lat, center.lng, sliderVal);
    } else {
        showStatus('Teken eerst een middelpunt of stel een straal in', 'error');
    }
});
document.getElementById('radiusResetBtn').addEventListener('click', () => {
    resetRadiusSearch();
    document.getElementById('radiusSlider').value = 100;
    document.getElementById('radiusValue').textContent = '100 m';
});

document.getElementById('radiusSlider').addEventListener('input', function(e) {
    const val = e.target.value;
    document.getElementById('radiusValue').textContent = `${val} m`;
});

// Measurement controls
document.getElementById('measureDistance').addEventListener('click', () => {
    startMeasuring('distance');
});
document.getElementById('measureArea').addEventListener('click', () => {
    startMeasuring('area');
});
document.getElementById('clearMeasurements').addEventListener('click', clearMeasurements);

// Info panel controls
document.getElementById('closeInfo').addEventListener('click', function() {
    document.getElementById('infoPanel').style.display = 'none';
    document.getElementById('kvkSection').style.display = 'none';
    clearBuildingHighlight();
});

// Map click event handler
map.on('click', function(e) {
    console.log('=== MAP CLICK EVENT ===');
    console.log('Click coordinates:', e.latlng);
    console.log('Measure mode:', measureMode);
    console.log('Search mode:', searchMode);

    // Handle radius center placement first
    if (radiusPlacingCenter) {
        if (radiusCenterMarker) {
            map.removeLayer(radiusCenterMarker);
            radiusCenterMarker = null;
        }
        if (radiusCircle) {
            map.removeLayer(radiusCircle);
            radiusCircle = null;
        }
        clearRadiusMarkers();
        const latlng = e.latlng;
        radiusCenterMarker = L.circleMarker(latlng, {
            className: 'radius-center-marker',
            radius: 10
        }).addTo(map);
        document.getElementById('radiusCenterInfo').textContent = `Middelpunt: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        updateInfoBar('Middelpunt geplaatst, stel nu de straal in', 'fas fa-dot-circle');
        radiusPlacingCenter = false;
        map.getContainer().style.cursor = '';
        return;
    }

    // Measurement mode check
    if (measureMode) {
        measurePoints.push(e.latlng);
        const marker = L.circleMarker(e.latlng, {
            color: '#76bc94',
            radius: 6
        }).addTo(map);
        measureMarkers.push(marker);
        if (measureMode === 'distance') {
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
        } else if (measureMode === 'area') {
            if (measurePoints.length > 2) {
                if (measurePolygon) {
                    map.removeLayer(measurePolygon);
                }
                measurePolygon = L.polygon(measurePoints, {
                    color: '#76bc94',
                    fillColor: '#76bc94',
                    fillOpacity: 0.3
                }).addTo(map);
                updateMeasureResult();
            }
        }
        return;
    }

    // Only fetch building info if BAG layer is on and not in radius mode
    if (searchMode !== 'radius' && document.getElementById('bagLayer').checked) {
        updateInfoBar('Pand- en bedrijfsinformatie ophalen...', 'fas fa-spinner fa-spin');
        getBagAndKvkInfo(e.latlng);
    } else if (searchMode !== 'radius' && !document.getElementById('bagLayer').checked) {
        updateInfoBar('Zet BAG panden aan om gebouwinformatie te bekijken', 'fas fa-exclamation-triangle');
        showStatus('BAG layer is not active', 'error');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && measureMode) {
        clearMeasurements();
    }
});

// ========================================
// INITIALIZATION
// ========================================

window.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM fully loaded');
});

window.addEventListener('load', function() {
    console.log('✅ WebGIS loaded successfully');
    setTimeout(() => initMobileMenu(), 300);

    document.getElementById('bagLayer').checked = true;
    map.addLayer(layers.bag);
    layers.bag.bringToFront();

    document.getElementById('perceelLayer').checked = false;

    setTimeout(() => {
        updateInfoBar('Zoom in en klik op een gebouw voor pand- en bedrijfsinformatie', 'fas fa-building');
    }, 600);

    console.log('🚀 WebGIS volledig geladen en klaar voor gebruik');
});

// Expose test functions
window.testOverheidApi = testOverheidApi;
window.searchKvkViaSuggest = searchKvkViaSuggest;
window.getKvkCompaniesByPandId = getKvkCompaniesByPandId;
window.getKvkCompanyDetails = getKvkCompanyDetails;
window.zoomToCompanyLocation = zoomToCompanyLocation;
window.searchRadiusCompanies = searchRadiusCompanies;
window.resetRadiusSearch = resetRadiusSearch;
