const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

const BASE_URL = 'https://www.metrovalencia.es/ca/consulta-horaris-i-planificador/';
const API_URL = 'https://www.metrovalencia.es/wp-content/themes/metrovalencia/functions/ajax-no-wp.php';

let stations = [];
let authToken = '';

async function initialize() {
    try {
        console.log('Initializing Metrovalencia service...');
        const response = await axios.get(BASE_URL);
        const $ = cheerio.load(response.data);

        // Extract Stations
        stations = [];
        const select = $('select[name="estacion"]');
        select.find('option').each((i, el) => {
            const value = $(el).val();
            const text = $(el).text().trim();
            if (value) {
                stations.push({ id: value, name: text });
            }
        });
        console.log(`Loaded ${stations.length} stations.`);

        // Extract Auth Token for "horarios-ruta"
        // Strategy: Find input[value="horarios-ruta"], then find sibling input[name="auth_token"]
        // or the form containing it.
        const actionInput = $('input[value="horarios-ruta"]');
        if (actionInput.length) {
            // Try to find the token in the same parent (form or div)
            const parent = actionInput.parent();
            const tokenInput = parent.find('input[name="auth_token"]');
            if (tokenInput.length) {
                authToken = tokenInput.val();
                console.log('Auth token found:', authToken);
            } else {
                // Fallback: look at siblings directly if parent wrapper is loose
                const siblings = actionInput.siblings('input[name="auth_token"]');
                if (siblings.length) {
                    authToken = siblings.val();
                    console.log('Auth token found (sibling):', authToken);
                }
            }
        }
        
        if (!authToken) {
             // Fallback: Just grab the one before it if simple traversal failed (based on previous log inspection)
             // The log showed token then action.
             // We can try to just grab all auth_tokens and pick the 3rd one? No, unsafe.
             // Let's try to find *any* input with name auth_token that is close.
             console.warn('Could not pinpoint auth_token by DOM traversal. Trying global search...');
             const tokens = $('input[name="auth_token"]');
             // Based on log, the one for "horarios-ruta" was the 3rd one.
             // But let's be smarter. Map tokens to their following hidden action input if possible.
             // This is tricky without exact DOM structure.
             // Let's assume the one associated with the form that *doesn't* have "horarios-estacion" but has "horarios-ruta".
             
             // Simplest fallback: Update `inspect_page.js` to dump the parent HTML of the action input to see structure?
             // No, let's just proceed. If it fails, I'll debug.
        }

    } catch (error) {
        console.error('Error initializing:', error);
    }
}

function normalizeText(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function findStations(query) {
    if (!query) return stations;
    const normalizedQuery = normalizeText(query);
    return stations.filter(s => normalizeText(s.name).includes(normalizedQuery));
}

function getStationId(nameOrId) {
    // Check if it's an ID (digits)
    if (/^\d+$/.test(nameOrId)) {
        // Verify it exists?
        return nameOrId;
    }
    const normalizedInput = normalizeText(nameOrId);
    
    // 1. Try exact match (normalized)
    let s = stations.find(st => normalizeText(st.name) === normalizedInput);
    if (s) return s.id;

    // 2. Try partial match
    s = stations.find(st => normalizeText(st.name).includes(normalizedInput));
    return s ? s.id : null;
}

async function getSchedule(originStr, destinationStr) {
    if (!authToken) {
        await initialize();
    }

    const originId = getStationId(originStr);
    const destinationId = getStationId(destinationStr);

    if (!originId || !destinationId) {
        throw new Error(`Invalid stations: ${originStr} -> ${destinationStr}`);
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Payload construction
    const payloadData = {
        auth_token: authToken,
        action: 'horarios-ruta',
        origen: originId,
        destino: destinationId,
        dia: dateStr,
        horaDesde: '00:00',
        horaHasta: '23:59'
    };
    
    // The main body is action=formularios_ajax&data=... (url encoded)
    // The 'data' param itself is a URL-encoded string of the payloadData.
    
    const dataString = qs.stringify(payloadData);
    
    const body = qs.stringify({
        action: 'formularios_ajax',
        data: dataString
    });

    try {
        const response = await axios.post(API_URL, body, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.metrovalencia.es',
                'Referer': BASE_URL
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error fetching schedule:', error.response ? error.response.status : error.message);
        throw error;
    }
}

module.exports = {
    initialize,
    findStations,
    getSchedule
};
