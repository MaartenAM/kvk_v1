// js/map.js
// Deze module beheert alle Leaflet-gerelateerde functionaliteit,
// inclusief kaartinitialisatie, lagenbeheer, markers, polygonen en meettools.

import { showStatus, log, showInfoPanel } from './ui.js'; // Importeer UI functies voor statusmeldingen en paneelweergave
import { getKvkCompaniesByPandId } from './openkvk.js'; // Importeer OpenKVK functie voor het ophalen van bedrijven

// Kaart- en laagvariabelen die globaal beschikbaar moeten zijn binnen deze module
export let map;
export let currentHighlightedLayer = null; // Houdt de momenteel gemarkeerde laag bij (marker of polygon)
export let measurementLayer = null; // Laag voor meetresultaten (lijnen, polygonen, punten)

// Configuratie voor WMS (Web Map Service) lagen van PDOK (Publieke Dienstververlening Op de Kaart)
const BAG_WMS_URL = 'https://geodata.nationaalgeoregister.nl/bag/wms?';
const BAG_WMS_LAYERS = 'pand'; // Specifieke laag voor gebouwinformatie (panden)

// URLs voor andere basiskaartlagen
const OPENSTREETMAP_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TOPOGRAFISCHE_KAART_URL = 'https://service.pdok.nl/brt/top25000/wms/v1_0?request=GetCapabilities&service=WMS&version=1.3.0';
const LUCHTFOTO_URL = 'https://service.pdok.nl/hwh/luchtfoto/wms/v1_0?request=GetCapabilities&service=WMS&version=1.3.0';

// Leaflet laag objecten
let osmLayer;
let topoLayer;
let luchtfotoLayer;
let bagLayer;

/**
 * Initialiseert de Leaflet kaart en voegt basislagen toe.
 */
export function initMap() {
    log('Initializing map...');

    // Maak de kaart aan en stel het initiële centrum en zoomniveau in (Nederland)
    map = L.map('map').setView([52.1326, 5.2913], 8);

    // Voeg de OpenStreetMap tegelkaart toe als basislaag
    osmLayer = L.tileLayer(OPENSTREETMAP_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map); // Voeg direct toe aan de kaart

    // Voeg de BAG WMS laag toe (gebouwinformatie)
    bagLayer = L.tileLayer.wms(BAG_WMS_URL, {
        layers: BAG_WMS_LAYERS,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'BAG (Kadaster)'
    }).addTo(map); // Voeg direct toe aan de kaart

    // Initialiseer de topografische kaart WMS laag (standaard niet zichtbaar)
    topoLayer = L.tileLayer.wms(TOPOGRAFISCHE_KAART_URL, {
        layers: 'top25000',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'Topografische kaart (PDOK)'
    });

    // Initialiseer de luchtfoto WMS laag (standaard niet zichtbaar)
    luchtfotoLayer = L.tileLayer.wms(LUCHTFOTO_URL, {
        layers: 'actueel_ortho25',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'Luchtfoto (PDOK)'
    });

    // Voeg een event listener toe voor klikken op de kaart
    map.on('click', onMapClick);

    // Initialiseer de feature group voor meetresultaten
    measurementLayer = L.featureGroup().addTo(map);

    log('Map initialized.');
}

/**
 * Voegt een marker toe aan de kaart en zoomt ernaartoe.
 * Verwijdert eventuele eerdere highlights.
 * @param {number} lat - Breedtegraad.
 * @param {number} lon - Lengtegraad.
 * @param {string} [popupContent=''] - HTML-inhoud voor de popup van de marker.
 * @param {number} [zoom=18] - Zoomniveau na toevoegen van de marker.
 */
export function addMarker(lat, lon, popupContent = '', zoom = 18) {
    removeHighlight(); // Verwijder bestaande highlights

    const marker = L.marker([lat, lon]).addTo(map);
    if (popupContent) {
        marker.bindPopup(popupContent).openPopup();
    }
    map.setView([lat, lon], zoom);
    currentHighlightedLayer = marker; // Sla de marker op als de huidige highlight
    log(`Marker added at [${lat}, ${lon}] with content: ${popupContent}`);
}

/**
 * Markeert een GeoJSON polygoon op de kaart en zoomt ernaartoe.
 * Verwijdert eventuele eerdere highlights.
 * @param {object} geojson - Het GeoJSON object van de polygoon.
 * @param {string} [popupContent=''] - HTML-inhoud voor de popup van de polygoon.
 * @param {boolean} [fitBounds=true] - Zoomt de kaart naar de grenzen van de polygoon.
 */
export function highlightPolygon(geojson, popupContent = '', fitBounds = true) {
    removeHighlight(); // Verwijder bestaande highlights

    const geoJsonLayer = L.geoJson(geojson, {
        style: {
            color: '#ff7800',
            weight: 5,
            opacity: 0.65,
            fillOpacity: 0.2,
            fillColor: '#ff7800'
        }
    }).addTo(map);

    if (popupContent) {
        geoJsonLayer.bindPopup(popupContent).openPopup();
    }

    // Probeer te zoomen naar de grenzen van de polygoon
    if (fitBounds && geoJsonLayer.getBounds().isValid()) {
        map.fitBounds(geoJsonLayer.getBounds());
    } else {
        // Fallback: pulse animatie als fitBounds niet werkt (bijv. leeg/ongeldig GeoJSON)
        geoJsonLayer.eachLayer(function(layer) {
            if (layer instanceof L.Path) { // Controleer of het een vectorlaag is (polygoon, lijn)
                layer.getElement().style.animation = 'pulse 1s infinite alternate';
                setTimeout(() => {
                    if (layer.getElement()) {
                        layer.getElement().style.animation = ''; // Verwijder animatie na 3 seconden
                    }
                }, 3000);
            }
        });
        showStatus('Nauwkeurige zoom niet mogelijk, object kort gemarkeerd.', 'info');
    }
    currentHighlightedLayer = geoJsonLayer; // Sla de GeoJSON laag op als de huidige highlight
    log('Polygon highlighted and zoomed to bounds.');
}

/**
 * Verwijdert de huidige highlight (marker of polygoon) van de kaart.
 */
export function removeHighlight() {
    if (currentHighlightedLayer) {
        map.removeLayer(currentHighlightedLayer);
        currentHighlightedLayer = null;
        log('Highlight removed.');
    }
}

/**
 * Schakelt de zichtbaarheid van een specifieke kaartlaag in of uit.
 * @param {string} layerName - De naam van de kaartlaag ('bagLayer', 'osmLayer', 'topoLayer', 'luchtfotoLayer').
 * @param {boolean} checked - True om de laag in te schakelen, false om uit te schakelen.
 */
export function toggleLayer(layerName, checked) {
    switch (layerName) {
        case 'bagLayer':
            if (checked && !map.hasLayer(bagLayer)) {
                map.addLayer(bagLayer);
                log('BAG Layer added.');
            } else if (!checked && map.hasLayer(bagLayer)) {
                map.removeLayer(bagLayer);
                log('BAG Layer removed.');
            }
            break;
        case 'osmLayer':
            if (checked && !map.hasLayer(osmLayer)) {
                map.addLayer(osmLayer);
                log('OSM Layer added.');
            } else if (!checked && map.hasLayer(osmLayer)) {
                map.removeLayer(osmLayer);
                log('OSM Layer removed.');
            }
            break;
        case 'topoLayer':
            if (checked && !map.hasLayer(topoLayer)) {
                map.addLayer(topoLayer);
                log('Topo Layer added.');
            } else if (!checked && map.hasLayer(topoLayer)) {
                map.removeLayer(topoLayer);
                log('Topo Layer removed.');
            }
            break;
        case 'luchtfotoLayer':
            if (checked && !map.hasLayer(luchtfotoLayer)) {
                map.addLayer(luchtfotoLayer);
                log('Luchtfoto Layer added.');
            } else if (!checked && map.hasLayer(luchtfotoLayer)) {
                map.removeLayer(luchtfotoLayer);
                log('Luchtfoto Layer removed.');
            }
            break;
        default:
            log(`Unknown layer: ${layerName}`);
            break;
    }
}

// Variabelen voor meetfunctionaliteit
let measuring = false; // Geeft aan of een meting actief is
let currentMeasurementType = null; // Type meting: 'distance' of 'area'
let measurePoints = []; // Array om geklikte punten op te slaan
let measurePolyline = null; // Leaflet Polyline object voor afstandsmeting
let measurePolygon = null; // Leaflet Polygon object voor gebiedsmeting

/**
 * Activeert of deactiveert de meetmodus op de kaart.
 * @param {'distance'|'area'} type - Het type meting dat moet worden geactiveerd.
 */
export function toggleMeasurement(type) {
    if (measuring && currentMeasurementType === type) {
        // Schakel dezelfde meetmodus uit als deze al actief is
        stopMeasurement();
        return;
    }

    stopMeasurement(); // Stop eventuele andere actieve meting
    measuring = true;
    currentMeasurementType = type;
    measurePoints = []; // Reset meetpunten
    measurementLayer.clearLayers(); // Wis eerdere meetvisualisaties

    // Voeg event listeners toe voor klikken en dubbelklikken op de kaart
    map.on('click', onMeasureClick);
    map.on('dblclick', onMeasureDoubleClick);

    showStatus(`Meten van ${type === 'distance' ? 'afstand' : 'gebied'}: Klik op de kaart om punten toe te voegen. Dubbelklik om te voltooien.`);
    log(`Measurement mode activated: ${type}`);
}

/**
 * Wis alle actieve metingen en meetresultaten van de kaart.
 */
export function clearMeasurements() {
    stopMeasurement(); // Stop de meetmodus
    measurementLayer.clearLayers(); // Wis alle lagen in de meetlaag
    document.getElementById('measureResults').innerHTML = ''; // Wis meetresultaten in de UI
    showStatus('Alle metingen gewist.');
    log('All measurements cleared.');
}

/**
 * Handler voor klikgebeurtenissen tijdens de meetmodus.
 * Voegt punten toe en tekent de lijn/polygoon.
 * @param {L.LeafletMouseEvent} e - Het Leaflet muisklik-event object.
 */
function onMeasureClick(e) {
    measurePoints.push(e.latlng); // Voeg het geklikte punt toe aan de array
    // Voeg een cirkelmarker toe voor elk geklikt punt
    L.circleMarker(e.latlng, { radius: 5, color: '#007bff', fillColor: '#007bff', fillOpacity: 0.8 }).addTo(measurementLayer);

    if (measurePoints.length > 1) {
        if (measurePolyline) {
            measurementLayer.removeLayer(measurePolyline); // Verwijder de oude lijn
        }
        if (currentMeasurementType === 'distance') {
            // Teken een polyline voor afstandsmeting
            measurePolyline = L.polyline(measurePoints, { color: '#007bff', weight: 3, opacity: 0.7 }).addTo(measurementLayer);
            const totalDistance = calculateDistance(measurePoints);
            document.getElementById('measureResults').innerHTML = `<p class="measure-result">Afstand: ${totalDistance.toFixed(2)} m</p>`;
        } else if (currentMeasurementType === 'area' && measurePoints.length > 2) {
            if (measurePolygon) {
                measurementLayer.removeLayer(measurePolygon); // Verwijder de oude polygoon
            }
            // Teken een polygoon voor gebiedsmeting
            measurePolygon = L.polygon(measurePoints, { color: '#007bff', weight: 3, opacity: 0.7, fillOpacity: 0.2 }).addTo(measurementLayer);
            const totalArea = calculateArea(measurePoints);
            document.getElementById('measureResults').innerHTML = `<p class="measure-result">Gebied: ${totalArea.toFixed(2)} m&sup2;</p>`;
        }
    }
    log(`Measurement point added: ${e.latlng.lat}, ${e.latlng.lng}`);
}

/**
 * Handler voor dubbelklikgebeurtenissen tijdens de meetmodus.
 * Voltooit de meting.
 * @param {L.LeafletMouseEvent} e - Het Leaflet muisklik-event object.
 */
function onMeasureDoubleClick(e) {
    L.DomEvent.stop(e); // Voorkom standaard dubbelklik zoomgedrag van Leaflet
    stopMeasurement(); // Stop de meetmodus
    showStatus('Meting voltooid.');
    log('Measurement completed.');
}

/**
 * Stopt de actieve meetmodus en verwijdert de event listeners.
 */
function stopMeasurement() {
    if (measuring) {
        map.off('click', onMeasureClick); // Verwijder klik-event listener
        map.off('dblclick', onMeasureDoubleClick); // Verwijder dubbelklik-event listener
        measuring = false;
        currentMeasurementType = null;
        measurePoints = [];
        measurePolyline = null;
        measurePolygon = null;
        log('Measurement stopped.');
    }
}

/**
 * Berekent de totale afstand van een reeks punten.
 * @param {L.LatLng[]} points - Array van Leaflet LatLng objecten.
 * @returns {number} De totale afstand in meters.
 */
function calculateDistance(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalDistance += points[i].distanceTo(points[i + 1]); // Gebruik Leaflet's ingebouwde distanceTo
    }
    return totalDistance;
}

/**
 * Berekent het gebied van een polygoon gevormd door een reeks punten.
 * Let op: Deze implementatie is een *ruwe schatting* en is niet nauwkeurig voor grote gebieden
 * of gebieden dicht bij de polen vanwege de platte projectie aanname.
 * Voor precieze geografische gebiedsberekeningen is een gespecialiseerde bibliotheek (zoals Turf.js) aan te raden.
 * @param {L.LatLng[]} points - Array van Leaflet LatLng objecten.
 * @returns {number} Het berekende gebied in vierkante meters.
 */
function calculateArea(points) {
    if (points.length < 3) return 0; // Een polygoon vereist minimaal 3 punten
    
    // Implementatie van de Shoelace formule (vereenvoudigd voor kleine gebieden)
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        area += (points[j].lng + points[i].lng) * (points[j].lat - points[i].lat);
    }
    // Ruwe conversie van graden naar meters (ongeveer 111.32 km per graad op de evenaar)
    // Dit is een zeer vereenvoudigde benadering.
    return Math.abs(area / 2) * (111.32 * 1000) * (111.32 * 1000); 
}


/**
 * Handler voor klikgebeurtenissen op de kaart (buiten meetmodus).
 * Haalt informatie op over het geklikte pand en bijbehorende KVK-bedrijven.
 * @param {L.LeafletMouseEvent} e - Het Leaflet muisklik-event object.
 */
async function onMapClick(e) {
    if (measuring) return; // Geen info ophalen tijdens actieve meting

    showStatus('Informatie ophalen...', 'info');
    removeHighlight(); // Wis eventuele eerdere highlights op de kaart

    // PDOK Locatie Server API voor gebouwinformatie op basis van coördinaten
    // 'free' endpoint zoekt in verschillende datasets (adressen, panden, etc.)
    const PDOK_LOCATIESERVER_URL = `https://geodata.nationaalgeoregister.nl/locatieserver/v3/free?fq=type:adres&wt=json&rows=1&zoom=true&x=${e.latlng.lng}&y=${e.latlng.lat}`;
    log(`Fetching BAG info from: ${PDOK_LOCATIESERVER_URL}`);

    try {
        const response = await fetch(PDOK_LOCATIESERVER_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        log('PDOK LocatieServer response:', data);

        const docs = data.response.docs;
        if (docs && docs.length > 0) {
            const doc = docs[0]; // Neem het eerste (meest relevante) resultaat
            let infoHtml = `<h4>Adres: ${doc.weergavenaam || 'Onbekend'}</h4>`;
            infoHtml += `<div class="info-item"><div class="info-label">Postcode:</div><div class="info-value">${doc.postcode || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Plaats:</div><div class="info-value">${doc.woonplaatsnaam || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Perceelnummer:</div><div class="info-value">${doc.perceelnummer || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Pand ID:</div><div class="info-value">${doc.pand_id || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Verblijfsobject ID:</div><div class="info-value">${doc.vbo_id || 'N.v.t.'}</div></div>`;

            // Probeer GeoJSON op te halen voor het pand (indien beschikbaar) om te highlighten
            if (doc.geometrie_ll) {
                try {
                    const geojson = JSON.parse(doc.geometrie_ll);
                    highlightPolygon(geojson, `Adres: ${doc.weergavenaam}`);
                    log('GeoJSON found and highlighted.');
                } catch (parseError) {
                    console.error('Error parsing GeoJSON:', parseError);
                    addMarker(e.latlng.lat, e.latlng.lng, 'Geen geldige geometrie gevonden.');
                    log('Invalid GeoJSON, adding marker instead.');
                }
            } else if (doc.x && doc.y) {
                // Fallback: alleen marker als geen geometrie beschikbaar is
                addMarker(doc.y, doc.x, `Adres: ${doc.weergavenaam}`);
                log('No GeoJSON, adding marker instead.');
            } else {
                addMarker(e.latlng.lat, e.latlng.lng, 'Geen gedetailleerde geometrie gevonden.');
                log('No BAG geometry or coordinates found, placing marker at click location.');
            }

            // Haal KVK bedrijven op basis van pand_id
            const kvkContentDiv = document.getElementById('kvkContent');
            const kvkSectionDiv = document.getElementById('kvkSection');
            kvkSectionDiv.style.display = 'block'; // Toon de KVK sectie
            kvkContentDiv.innerHTML = '<div class="kvk-loading"><i class="fas fa-spinner fa-spin"></i> Bedrijven laden...</div>';

            if (doc.pand_id) {
                const companies = await getKvkCompaniesByPandId(doc.pand_id);
                if (companies.length > 0) {
                    kvkContentDiv.innerHTML = companies.map(company => `
                        <div class="kvk-company">
                            <div class="kvk-company-name">${company.naam}</div>
                            <div class="kvk-company-details">KVK: ${company.kvknummer} | Vestiging: ${company.vestigingsnummer}</div>
                            <div class="kvk-company-details">Activiteit: ${company.hoofdactiviteit}</div>
                            <div class="kvk-company-details">Rechtsvorm: ${company.rechtsvorm}</div>
                            <div class="kvk-company-details">Adres: ${company.adres ? `${company.adres.straatnaam} ${company.adres.huisnummer}, ${company.adres.postcode} ${company.adres.plaats}` : 'Onbekend'}</div>
                        </div>
                    `).join('');
                    showStatus(`${companies.length} KVK bedrijven gevonden.`, 'success');
                } else {
                    kvkContentDiv.innerHTML = '<p class="kvk-error">Geen KVK bedrijven gevonden op dit pand.</p>';
                    showStatus('Geen KVK bedrijven gevonden.', 'info');
                }
            } else {
                kvkContentDiv.innerHTML = '<p class="kvk-error">Geen pand ID beschikbaar voor KVK zoekopdracht.</p>';
                showStatus('Geen pand ID voor KVK zoekopdracht.', 'info');
            }

            document.getElementById('infoContent').innerHTML = infoHtml; // Vul de algemene info
            showInfoPanel(); // Toon het informatiepaneel
            showStatus('Informatie succesvol geladen.', 'success');

        } else {
            // Geen BAG informatie gevonden
            showStatus('Geen BAG informatie gevonden op deze locatie.', 'info');
            document.getElementById('infoContent').innerHTML = '<p>Geen BAG informatie gevonden op deze locatie.</p>';
            document.getElementById('kvkSection').style.display = 'none'; // Verberg KVK sectie
            showInfoPanel();
            addMarker(e.latlng.lat, e.latlng.lng, 'Geen BAG informatie gevonden hier.');
        }
    } catch (error) {
        console.error('Error fetching BAG or KVK data:', error);
        showStatus('Fout bij ophalen van informatie.', 'error');
        document.getElementById('infoContent').innerHTML = `<p class="kvk-error">Fout bij laden van locatiegegevens: ${error.message}</p>`;
        document.getElementById('kvkSection').style.display = 'none';
        showInfoPanel();
        addMarker(e.latlng.lat, e.latlng.lng, 'Fout bij laden van gegevens.');
    }
}
