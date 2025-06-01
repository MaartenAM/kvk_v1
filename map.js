// js/map.js

import { showStatus, log, showInfoPanel } from './ui.js'; // Importeer UI functies
import { getKvkCompaniesByPandId } from './openkvk.js'; // Importeer OpenKVK functie

// Declareer de kaart als een globaal object, zodat andere modules erbij kunnen
export let map;
export let currentHighlightedLayer = null; // Voor het bijhouden van de gemarkeerde laag
export let measurementLayer = null; // Voor meetresultaten

// BAG Basisregistratie Adressen en Gebouwen (WMS)
const BAG_WMS_URL = 'https://geodata.nationaalgeoregister.nl/bag/wms?';
const BAG_WMS_LAYERS = 'pand'; // We zijn geïnteresseerd in panden

// Overige kaartlagen
const OPENSTREETMAP_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TOPOGRAFISCHE_KAART_URL = 'https://service.pdok.nl/brt/top25000/wms/v1_0?request=GetCapabilities&service=WMS&version=1.3.0';
const LUCHTFOTO_URL = 'https://service.pdok.nl/hwh/luchtfoto/wms/v1_0?request=GetCapabilities&service=WMS&version=1.3.0';

let osmLayer;
let topoLayer;
let luchtfotoLayer;
let bagLayer; // BAG laag

export function initMap() {
    log('Initializing map...');

    map = L.map('map').setView([52.1326, 5.2913], 8); // Centraal Nederland, zoom 8

    // Standaard OpenStreetMap laag
    osmLayer = L.tileLayer(OPENSTREETMAP_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // BAG WMS laag
    bagLayer = L.tileLayer.wms(BAG_WMS_URL, {
        layers: BAG_WMS_LAYERS,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'BAG (Kadaster)'
    }).addTo(map); // Voeg de BAG laag direct toe bij initialisatie

    // Topografische kaart WMS laag (standaard niet zichtbaar)
    topoLayer = L.tileLayer.wms(TOPOGRAFISCHE_KAART_URL, {
        layers: 'top25000',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'Topografische kaart (PDOK)'
    });

    // Luchtfoto WMS laag (standaard niet zichtbaar)
    luchtfotoLayer = L.tileLayer.wms(LUCHTFOTO_URL, {
        layers: 'actueel_ortho25',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: 'Luchtfoto (PDOK)'
    });

    // Event listener voor klik op de kaart
    map.on('click', onMapClick);

    // Initialiseer de measurement layer
    measurementLayer = L.featureGroup().addTo(map);

    log('Map initialized.');
}

// Functie om de markering op de kaart te beheren
export function addMarker(lat, lon, popupContent = '', zoom = 18) {
    if (currentHighlightedLayer) {
        map.removeLayer(currentHighlightedLayer);
    }

    const marker = L.marker([lat, lon]).addTo(map);
    if (popupContent) {
        marker.bindPopup(popupContent).openPopup();
    }
    map.setView([lat, lon], zoom);
    currentHighlightedLayer = marker;
    log(`Marker added at [${lat}, ${lon}] with content: ${popupContent}`);
}

export function highlightPolygon(geojson, popupContent = '', fitBounds = true) {
    if (currentHighlightedLayer) {
        map.removeLayer(currentHighlightedLayer);
    }

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

    if (fitBounds && geoJsonLayer.getBounds().isValid()) {
        map.fitBounds(geoJsonLayer.getBounds());
    } else {
        // Fallback: pulse animatie als fitBounds niet werkt (bijv. leeg GeoJSON)
        geoJsonLayer.eachLayer(function(layer) {
            if (layer instanceof L.Path) { // Check if it's a vector layer like polygon/polyline
                layer.getElement().style.animation = 'pulse 1s infinite alternate';
                setTimeout(() => {
                    if (layer.getElement()) {
                        layer.getElement().style.animation = '';
                    }
                }, 3000);
            }
        });
        showStatus('Nauwkeurige zoom niet mogelijk, object kort gemarkeerd.', 'info');
    }
    currentHighlightedLayer = geoJsonLayer;
    log('Polygon highlighted and zoomed to bounds.');
}

export function removeHighlight() {
    if (currentHighlightedLayer) {
        map.removeLayer(currentHighlightedLayer);
        currentHighlightedLayer = null;
        log('Highlight removed.');
    }
}

// Functie om kaartlagen aan/uit te zetten
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

// Functie voor metingen
let measuring = false;
let currentMeasurementType = null;
let measurePoints = [];
let measurePolyline = null;
let measurePolygon = null;

export function toggleMeasurement(type) {
    if (measuring && currentMeasurementType === type) {
        // Schakel dezelfde meetmodus uit
        stopMeasurement();
        return;
    }

    stopMeasurement(); // Stop andere actieve meting
    measuring = true;
    currentMeasurementType = type;
    measurePoints = [];
    measurementLayer.clearLayers(); // Wis eerdere metingen

    map.on('click', onMeasureClick);
    map.on('dblclick', onMeasureDoubleClick);

    showStatus(`Meten van ${type === 'distance' ? 'afstand' : 'gebied'}: Klik op de kaart om punten toe te voegen. Dubbelklik om te voltooien.`);
    log(`Measurement mode activated: ${type}`);
}

export function clearMeasurements() {
    stopMeasurement();
    measurementLayer.clearLayers();
    document.getElementById('measureResults').innerHTML = '';
    showStatus('Alle metingen gewist.');
    log('All measurements cleared.');
}

function onMeasureClick(e) {
    measurePoints.push(e.latlng);
    L.circleMarker(e.latlng, { radius: 5, color: '#007bff', fillColor: '#007bff', fillOpacity: 0.8 }).addTo(measurementLayer);

    if (measurePoints.length > 1) {
        if (measurePolyline) {
            measurementLayer.removeLayer(measurePolyline);
        }
        if (currentMeasurementType === 'distance') {
            measurePolyline = L.polyline(measurePoints, { color: '#007bff', weight: 3, opacity: 0.7 }).addTo(measurementLayer);
            const totalDistance = calculateDistance(measurePoints);
            document.getElementById('measureResults').innerHTML = `<p class="measure-result">Afstand: ${totalDistance.toFixed(2)} m</p>`;
        } else if (currentMeasurementType === 'area' && measurePoints.length > 2) {
            if (measurePolygon) {
                measurementLayer.removeLayer(measurePolygon);
            }
            measurePolygon = L.polygon(measurePoints, { color: '#007bff', weight: 3, opacity: 0.7, fillOpacity: 0.2 }).addTo(measurementLayer);
            const totalArea = calculateArea(measurePoints);
            document.getElementById('measureResults').innerHTML = `<p class="measure-result">Gebied: ${totalArea.toFixed(2)} m&sup2;</p>`;
        }
    }
    log(`Measurement point added: ${e.latlng.lat}, ${e.latlng.lng}`);
}

function onMeasureDoubleClick(e) {
    L.DomEvent.stop(e); // Voorkom standaard dubbelklik zoom
    stopMeasurement();
    showStatus('Meting voltooid.');
    log('Measurement completed.');
}

function stopMeasurement() {
    if (measuring) {
        map.off('click', onMeasureClick);
        map.off('dblclick', onMeasureDoubleClick);
        measuring = false;
        currentMeasurementType = null;
        measurePoints = [];
        measurePolyline = null;
        measurePolygon = null;
        log('Measurement stopped.');
    }
}

function calculateDistance(points) {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalDistance += points[i].distanceTo(points[i + 1]);
    }
    return totalDistance;
}

function calculateArea(points) {
    if (points.length < 3) return 0; // Een veelhoek vereist minimaal 3 punten
    const latlngs = points.map(p => [p.lat, p.lon]);
    
    // Gebruik de 'area' functie van Leaflet om het gebied te berekenen
    // (Leaflet heeft geen ingebouwde direct bruikbare area functie voor Polygon,
    // maar we kunnen een tijdelijke polygoon maken en dan de geo-area plugin gebruiken
    // of een eigen implementatie.)

    // Simpele (minder accurate voor grote gebieden) implementatie met Shoelace formula:
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        area += (points[j].lng + points[i].lng) * (points[j].lat - points[i].lat);
    }
    return Math.abs(area / 2) * (111.32 * 111.32); // Ongeveer omzetten naar vierkante meters (ruwe schatting)

    // Voor precieze metingen over grotere gebieden, overweeg een bibliotheek als turf.js of leaflet-measure.
}


// Functie voor kaartklik-gebeurtenissen
async function onMapClick(e) {
    if (measuring) return; // Geen info ophalen tijdens meten

    showStatus('Informatie ophalen...', 'info');
    removeHighlight(); // Wis eerdere highlights

    // PDOK Locatie Server API voor gebouwinformatie
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
            const doc = docs[0];
            let infoHtml = `<h4>Adres: ${doc.weergavenaam}</h4>`;
            infoHtml += `<div class="info-item"><div class="info-label">Postcode:</div><div class="info-value">${doc.postcode || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Plaats:</div><div class="info-value">${doc.woonplaatsnaam || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Perceelnummer:</div><div class="info-value">${doc.perceelnummer || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Pand ID:</div><div class="info-value">${doc.pand_id || 'N.v.t.'}</div></div>`;
            infoHtml += `<div class="info-item"><div class="info-label">Verblijfsobject ID:</div><div class="info-value">${doc.vbo_id || 'N.v.t.'}</div></div>`;

            // Probeer GeoJSON op te halen voor het pand (indien beschikbaar)
            if (doc.geometrie_ll) {
                const geojson = JSON.parse(doc.geometrie_ll);
                highlightPolygon(geojson, `Adres: ${doc.weergavenaam}`);
                log('GeoJSON found and highlighted.');
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
            kvkSectionDiv.style.display = 'block';
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

            document.getElementById('infoContent').innerHTML = infoHtml;
            showInfoPanel();
            showStatus('Informatie succesvol geladen.', 'success');

        } else {
            showStatus('Geen BAG informatie gevonden op deze locatie.', 'info');
            document.getElementById('infoContent').innerHTML = '<p>Geen BAG informatie gevonden op deze locatie.</p>';
            document.getElementById('kvkSection').style.display = 'none';
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