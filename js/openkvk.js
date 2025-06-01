// js/openkvk.js
// Deze module bevat alle logica voor de interactie met de Overheid.io OpenKVK API.
// Dit omvat functies voor het ophalen van bedrijfsgegevens en het parsen van API-responses.

import { showStatus, log } from './ui.js'; // Importeer UI functies voor statusmeldingen

// API Configuratie - eenvoudig aan te passen
const OPENKVK_CONFIG = {
    baseUrl: 'https://api.overheid.io/v3/openkvk',
    suggestUrl: 'https://api.overheid.io/v3/suggest/openkvk',
    // Let op: Deze API-sleutel is hier hardcoded voor demonstratiedoeleinden.
    // In een productieomgeving is het veiliger om deze via een backend of omgevingvariabelen te beheren.
    apiKey: 'af0f54b3b1a1718d8003866dd8fcae6d7d3eff2e726c72b99bbc60756870d455',
    maxSearchResults: 5,  // Maximaal aantal zoekresultaten om overmatige API-kosten te voorkomen
    minSearchLength: 3    // Minimum aantal karakters voordat een zoekopdracht wordt uitgevoerd
};

/**
 * Haalt KVK-bedrijven op die gekoppeld zijn aan een specifiek pand-ID (van BAG).
 * @param {string} pandId - Het pand-ID van het gebouw.
 * @returns {Promise<Array<object>>} Een array van bedrijfsobjecten.
 */
export async function getKvkCompaniesByPandId(pandId) {
    console.log('OpenKVK API lookup for pand_id:', pandId);
    
    try {
        const url = `${OPENKVK_CONFIG.baseUrl}?filters[pand_id]=${pandId}&ovio-api-key=${OPENKVK_CONFIG.apiKey}`;
        console.log('OpenKVK API URL:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'Accept': 'application/json',
                'ovio-api-key': OPENKVK_CONFIG.apiKey // API-sleutel in header
            }
        });
        
        console.log('OpenKVK API response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`OpenKVK API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('OpenKVK API data received:', data);
        
        let companies = [];
        
        // Controleer of er bedrijven zijn gevonden in de '_embedded' sectie
        if (data._embedded && data._embedded.bedrijf && data._embedded.bedrijf.length > 0) {
            console.log(`Found ${data._embedded.bedrijf.length} companies, fetching detailed info...`);
            
            // Haal voor elk gevonden bedrijf de volledige informatie op via de 'self' link
            for (const bedrijf of data._embedded.bedrijf) {
                if (bedrijf._links && bedrijf._links.self && bedrijf._links.self.href) {
                    console.log('Fetching detailed info for:', bedrijf.kvknummer);
                    const detailedCompany = await getKvkCompanyDetails(bedrijf._links.self.href);
                    if (detailedCompany) {
                        companies.push(detailedCompany);
                    }
                } else {
                    // Fallback: gebruik beperkte data als er geen detail-link is
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
        return []; // Retourneer een lege array bij fouten
    }
}

/**
 * Zoekt KVK-bedrijven via de Overheid.io suggest API (voor autocomplete/zoekfunctionaliteit).
 * @param {string} query - De zoekterm (bedrijfsnaam of KVK-nummer).
 * @returns {Promise<Array<object>>} Een array van gesuggereerde bedrijfsobjecten.
 */
export async function searchKvkViaSuggest(query) {
    console.log('=== SEARCHING KVK VIA OVERHEID.IO SUGGEST ===');
    console.log('Input query:', query);
    
    // Voorkom zoeken met te korte queries om onnodige API-aanroepen te minimaliseren
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
            // Beperk het aantal resultaten om kosten te beheersen
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

/**
 * Haalt volledige bedrijfsgegevens op via een specifieke link (vaak verkregen via suggest of pand-ID zoekopdracht).
 * @param {string} link - De relatieve URL van het bedrijf in de Overheid.io API.
 * @returns {Promise<object|null>} Een gedetailleerd bedrijfsobject of null bij fouten.
 */
export async function getKvkCompanyDetails(link) {
    console.log('Getting company details via link:', link);
    
    try {
        // De link van de suggest API is relatief, dus voeg de basis-URL van Overheid.io toe
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

/**
 * Parseert de volledige bedrijfsdata van de Overheid.io API naar een gestandaardiseerd object.
 * @param {object} bedrijf - Het ruwe bedrijfsobject van de Overheid.io API.
 * @returns {object} Een geparseerd bedrijfsobject.
 */
function parseOverheidApiCompany(bedrijf) {
    const company = {
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
        locatie: bedrijf.locatie || null, // Kan coördinaten bevatten
        pandId: bedrijf.pand_id || null,
        
        // Extra velden die nuttig kunnen zijn
        verblijfsobjectgebruiksdoel: bedrijf.verblijfsobjectgebruiksdoel,
        vboId: bedrijf.vbo_id,
        updatedAt: bedrijf.updated_at,
        isVestiging: bedrijf.vestiging,
        postlocatie: bedrijf.postlocatie,
        slug: bedrijf.slug,
        
        _source: 'OVERHEID_API' // Bron van de data
    };
    
    return company;
}

/**
 * Parseert een suggestie-item van de Overheid.io API naar een gestandaardiseerd object.
 * @param {object} item - Het ruwe suggestie-item object van de Overheid.io API.
 * @returns {object} Een geparseerd suggestie-object.
 */
function parseOverheidSuggestItem(item) {
    return {
        kvkNummer: item.kvknummer,
        naam: item.naam,
        postcode: item.postcode,
        vestigingsnummer: item.vestigingsnummer,
        link: item.link, // Belangrijk voor het ophalen van gedetailleerde info
        _source: 'OVERHEID_SUGGEST'
    };
}

/**
 * Test de verbinding met de Overheid.io API door een eenvoudige suggest-query uit te voeren.
 * Toont een statusmelding op basis van het resultaat.
 * @returns {Promise<Array<object>|null>} De suggestieresultaten of null bij een fout.
 */
export async function testOverheidApi() {
    console.log('=== TESTING OVERHEID.IO API CONNECTION ===');
    
    try {
        // Voer een kleine suggestie-query uit om de verbinding te testen
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
