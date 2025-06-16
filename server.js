const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse');
require('dotenv').config(); // For loading .env file

const app = express();

// Production configuration
const port = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';
const domain = process.env.DOMAIN || 'themetabroker.org';

// For console logging during debugging static paths
console.log('Server script directory (__dirname):', __dirname);
console.log('Environment:', isDevelopment ? 'development' : 'production');
console.log('Domain:', domain);
console.log('Port:', port);

const staticPath = path.join(__dirname);
console.log('Serving static files from:', staticPath);

// Increase limits for request headers and body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure CORS for production and development
const allowedOrigins = isDevelopment 
    ? ['http://localhost:3000', `https://${domain}`, `http://${domain}`, `https://www.${domain}`, `http://www.${domain}`]
    : [`https://${domain}`, `http://${domain}`, `https://www.${domain}`, `http://www.${domain}`];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// --- API Endpoints Configuration ---
const CACHE_FILE = path.join(__dirname, 'tns_cache.json');
const ZIP_FILE = path.join(__dirname, 'tns_data.zip');
const CSV_FILE = path.join(__dirname, 'tns_data.csv');

async function parseCSV(filePath) {
    try {
        console.log('\n=== Starting CSV Parsing ===');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return parseCSVFromString(fileContent);
    } catch (error) {
        console.error('Error in parseCSV:', error);
        throw error;
    }
}

async function parseCSVFromString(csvContent) {
    try {
        console.log('\n=== Starting CSV Parsing from String ===');
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) throw new Error('CSV file has too few lines to process (expected at least 2).');
        const headerLine = lines[1]; 
        const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const results = [];
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            let values = [];
            let currentValue = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"' && (j === 0 || line[j-1] !== '\\' || (line[j-1] === '"' && line[j+1] === '"'))) {
                    if (inQuotes && j + 1 < line.length && line[j+1] === '"') { currentValue += '"'; j++; continue; }
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(currentValue.trim());
                    currentValue = '';
                } else {
                    currentValue += char;
                }
            }
            values.push(currentValue.trim());
            const record = {};
            headers.forEach((header, index) => {
                let value = values[index] || null;
                if (value && value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1).replace(/""/g, '"');
                }
                record[header] = value;
            });
            results.push(record);
        }
        console.log(`CSV Parsing complete. Total records processed: ${results.length}`);
        return results;
    } catch (error) {
        console.error('Error in parseCSVFromString:', error);
        throw error;
    }
}

// In-memory cache for serverless environment
let inMemoryCache = null;
let cacheTimestamp = null;

async function downloadTNSData(tnsId = null, tnsUsername = null) {
    try {
        console.log('Attempting to download TNS data in serverless environment...');
        
        // Create dynamic user agent based on provided credentials
        let userAgent = 'tns_marker{"type": "user", "name":"metabroker"}'; // Generic fallback
        if (tnsId && tnsUsername) {
            userAgent = `tns_marker{"tns_id":${tnsId},"type": "user", "name":"${tnsUsername}"}`;
        }
        
        console.log('Using User-Agent:', userAgent);
        
        // Download ZIP file directly to memory (buffer)
        console.log('Making request to TNS with headers:', {
            'User-Agent': userAgent,
            'Accept': '*/*'
        });
        
        const response = await axios({
            method: 'POST',
            url: 'https://www.wis-tns.org/system/files/tns_public_objects/tns_public_objects.csv.zip',
            headers: { 
                'User-Agent': userAgent, 
                'Accept': '*/*',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            responseType: 'arraybuffer',
            timeout: 300000, // 5 minute timeout for Docker environment
            maxRedirects: 5
        });
        
        console.log('ZIP file downloaded to memory, size:', response.data.byteLength);
        
        // Process ZIP in memory
        const zip = new AdmZip(Buffer.from(response.data));
        const csvEntry = zip.getEntries().find(entry => entry.entryName.endsWith('.csv'));
        if (!csvEntry) throw new Error('No CSV file found in the downloaded ZIP.');
        
        console.log('Found CSV file in ZIP:', csvEntry.entryName);
        const csvContent = zip.readAsText(csvEntry);
        
        // Parse CSV directly from memory
        const parsedResults = await parseCSVFromString(csvContent);
        if (!Array.isArray(parsedResults) || parsedResults.length === 0) throw new Error('No valid results parsed from CSV');
        
        // Store both in memory cache and file cache for persistence
        const cacheData = {
            last_updated: new Date().toISOString(),
            download_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
            total_objects: parsedResults.length,
            data: parsedResults
        };
        
        // Memory cache for immediate access
        inMemoryCache = cacheData;
        cacheTimestamp = Date.now();
        
        // File cache for persistence across restarts
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData));
            console.log('Data cached to file for persistence');
        } catch (writeError) {
            console.warn('Could not write cache file (non-critical):', writeError.message);
        }
        
        console.log(`Processed ${parsedResults.length} objects and stored in cache`);
        return { 
            success: true, 
            message: `CSV file parsed and cached with ${parsedResults.length} objects`, 
            timestamp: cacheData.last_updated,
            data: parsedResults
        };
    } catch (error) {
        console.error('Error in downloadTNSData function:', error.message, error.stack);
        return { success: false, error: error.message };
    }
}

// --- API Routes ---
// Legacy GET endpoint (without credentials) for backwards compatibility
app.get('/api/update-tns', async (req, res) => {
    console.log('Received GET request for /api/update-tns (legacy)');
    const result = await downloadTNSData();
    res.json(result);
});

// New POST endpoint (with credentials) for secure updates
app.post('/api/update-tns', async (req, res) => {
    console.log('Received POST request for /api/update-tns with credentials');
    
    // Prevent caching of API responses
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    
    const { tns_id, tns_username } = req.body;
    
    if (!tns_id || !tns_username) {
        console.log('No TNS credentials provided, using public download');
        const result = await downloadTNSData();
        res.json(result);
    } else {
        console.log(`Using TNS credentials for user: ${tns_username} (ID: ${tns_id})`);
        const result = await downloadTNSData(tns_id, tns_username);
        res.json(result);
    }
});

app.get('/api/tns-data', async (req, res) => {
    console.log('Received request for /api/tns-data');
    
    // Prevent caching of API responses
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    
    try {
        // First check in-memory cache
        if (inMemoryCache && inMemoryCache.data) {
            console.log(`Serving data from memory cache. Objects: ${inMemoryCache.total_objects}`);
            return res.json(inMemoryCache.data);
        }
        
        // Then check file cache (for backwards compatibility)
        if (fs.existsSync(CACHE_FILE)) {
            const rawData = fs.readFileSync(CACHE_FILE);
            const cacheData = JSON.parse(rawData);
            
            // Check if this is the new format with metadata
            if (cacheData.data && Array.isArray(cacheData.data)) {
                console.log(`Serving data from file cache. Cache date: ${cacheData.download_date}, Objects: ${cacheData.total_objects}`);
                // Return just the data array for compatibility with frontend
                res.json(cacheData.data);
            } else if (Array.isArray(cacheData)) {
                // Old format - directly an array
                console.log('Serving data from file cache (legacy format).');
                res.json(cacheData);
            } else {
                throw new Error('Invalid cache format');
            }
        } else {
            console.log('⚠️ No TNS cache available');
            // Return an error that prompts user to enter credentials for fresh download
            res.status(404).json({ 
                error: 'No TNS data available. Please enter TNS credentials to download the latest data.',
                message: 'No cached TNS data found. Please provide TNS credentials to fetch fresh data.'
            });
        }
    } catch (error) {
        console.error('Error serving TNS data:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Cache info endpoint
app.get('/api/tns-cache-info', async (req, res) => {
    console.log('Received request for /api/tns-cache-info');
    
    // Prevent caching of API responses
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    
    try {
        // First check in-memory cache
        if (inMemoryCache && inMemoryCache.data) {
            const today = new Date().toISOString().split('T')[0];
            const isToday = inMemoryCache.download_date === today;
            
            return res.json({
                exists: true,
                download_date: inMemoryCache.download_date,
                last_updated: inMemoryCache.last_updated,
                total_objects: inMemoryCache.total_objects,
                is_current: isToday,
                age_days: Math.floor((new Date() - new Date(inMemoryCache.download_date)) / (1000 * 60 * 60 * 24)),
                source: 'memory'
            });
        }
        
        // Then check file cache
        if (fs.existsSync(CACHE_FILE)) {
            const rawData = fs.readFileSync(CACHE_FILE);
            const cacheData = JSON.parse(rawData);
            
            if (cacheData.data && cacheData.download_date) {
                const today = new Date().toISOString().split('T')[0];
                const isToday = cacheData.download_date === today;
                
                res.json({
                    exists: true,
                    download_date: cacheData.download_date,
                    last_updated: cacheData.last_updated,
                    total_objects: cacheData.total_objects,
                    is_current: isToday,
                    age_days: Math.floor((new Date() - new Date(cacheData.download_date)) / (1000 * 60 * 60 * 24)),
                    source: 'file'
                });
            } else {
                // Legacy format
                const stats = fs.statSync(CACHE_FILE);
                const fileDate = stats.mtime.toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                
                res.json({
                    exists: true,
                    download_date: fileDate,
                    last_updated: stats.mtime.toISOString(),
                    total_objects: Array.isArray(cacheData) ? cacheData.length : 'unknown',
                    is_current: fileDate === today,
                    age_days: Math.floor((new Date() - stats.mtime) / (1000 * 60 * 60 * 24)),
                    format: 'legacy',
                    source: 'file'
                });
            }
        } else {
            res.json({
                exists: false,
                is_current: false,
                age_days: null
            });
        }
    } catch (error) {
        console.error('Error checking cache info:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/proxy/alerce', async (req, res) => {
    const { ra, dec, name } = req.query;
    console.log(`ALeRCE Proxy: Received RA=${ra}, Dec=${dec}, Name/OID=${name}`);
    try {
        const { spawn } = require('child_process');
        const args = { broker: 'alerce', ra, dec, ztf_id: name };
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('ALeRCE Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`ALeRCE Python process exited with code ${code}`);
            if (errorString) console.error('ALeRCE Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'ALeRCE: ' + (result.error || 'No object found.') });
            } catch (parseError) {
                console.error('Error parsing ALeRCE Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse ALeRCE response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in ALeRCE proxy:', error);
        res.status(500).json({ error: 'Failed to query ALeRCE', details: error.message });
    }
});

app.get('/api/proxy/antares', async (req, res) => {
    const { ra, dec, name } = req.query;
    console.log(`Antares Proxy: Received RA=${ra}, Dec=${dec}, Name=${name}`);
     try {
        const { spawn } = require('child_process');
        const args = { broker: 'antares', ra, dec, ztf_id: name };
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('Antares Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`Antares Python process exited with code ${code}`);
            if (errorString) console.error('Antares Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'Antares: ' + (result.error || 'No object found.') });
            } catch (parseError) {
                console.error('Error parsing Antares Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse Antares response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in Antares proxy:', error);
        res.status(500).json({ error: 'Failed to query Antares', details: error.message });
    }
});

app.get('/api/proxy/fink', async (req, res) => {
    const { ra, dec, name, token } = req.query;
    console.log(`Fink Proxy: Received RA=${ra}, Dec=${dec}, Name/ZTF_ID=${name}, Token=${token ? 'Provided' : 'Not provided'}`);
    try {
        const { spawn } = require('child_process');
        const args = { broker: 'fink', ra, dec, ztf_id: name };
        if (token) {
            args.api_token = token;
        }
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('Fink Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`Fink Python process exited with code ${code}`);
            if (errorString) console.error('Fink Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'Fink: ' + (result.error || 'No object found.') });
            } catch (parseError) {
                console.error('Error parsing Fink Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse Fink response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in Fink proxy:', error);
        res.status(500).json({ error: 'Failed to query Fink', details: error.message });
    }
});

app.get('/api/proxy/lasair', async (req, res) => {
    const { ra, dec, name, token } = req.query;
    console.log(`Lasair Proxy: Received RA=${ra}, Dec=${dec}, Name/ZTF_ID=${name}, Token=${token ? 'Provided' : 'Not provided'}`);
    try {
        const { spawn } = require('child_process');
        const args = { broker: 'lasair', ra, dec, ztf_id: name };
        if (token) {
            args.api_token = token;
        }
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('Lasair Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`Lasair Python process exited with code ${code}`);
            if (errorString) console.error('Lasair Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'Lasair: ' + (result.error || 'No object found.') });
            } catch (parseError) {
                console.error('Error parsing Lasair Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse Lasair response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in Lasair proxy:', error);
        res.status(500).json({ error: 'Failed to query Lasair', details: error.message });
    }
});

app.get('/api/alerce/lightcurve', async (req, res) => {
    const { ztf_id } = req.query;
    if (!ztf_id) return res.status(400).json({ error: 'ztf_id is required' });
    try {
        const { spawn } = require('child_process');
        const args = { mode: 'lightcurve', ztf_id };
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('ALeRCE Lightcurve Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`ALeRCE Lightcurve Python process exited with code ${code}`);
            if (errorString) console.error('ALeRCE Lightcurve Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'ALeRCE Lightcurve: ' + (result.error || 'No data found.') });
            } catch (parseError) {
                console.error('Error parsing ALeRCE Lightcurve Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse ALeRCE lightcurve response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in ALeRCE lightcurve proxy:', error);
        res.status(500).json({ error: 'Failed to query ALeRCE lightcurve', details: error.message });
    }
});

// ATLAS Forced Photometry endpoint 
app.get('/api/atlas/photometry', async (req, res) => {
    console.log('=== ATLAS ENDPOINT HIT ===');
    console.log('Query params:', req.query);
    const { ra, dec, mjd_min, username, password } = req.query;
    
    if (!ra || !dec) {
        return res.status(400).json({ error: 'ra and dec are required' });
    }
    
    if (!username || !password) {
        return res.status(400).json({ 
            error: 'ATLAS credentials required',
            message: 'Please provide ATLAS username and password to access forced photometry data'
        });
    }
    
    try {
        const { spawn } = require('child_process');
        const args = { 
            username, 
            password, 
            ra: parseFloat(ra), 
            dec: parseFloat(dec),
            mjd_min: mjd_min ? parseFloat(mjd_min) : null
        };
        
        console.log(`Fetching ATLAS photometry for RA=${ra}, Dec=${dec}`);
        
        const python = spawn('./venv/bin/python3', ['atlas_api.py', JSON.stringify(args)]);
        let dataString = '';
        let errorString = '';
        
        python.stdout.on('data', (data) => {
            dataString += data.toString();
        });
        
        python.stderr.on('data', (data) => {
            errorString += data.toString();
            console.error('ATLAS Python stderr:', data.toString());
        });
        
        python.on('close', (code) => {
            console.log(`ATLAS Python process exited with code ${code}`);
            if (errorString) {
                console.error('ATLAS Python full errors:', errorString);
            }
            
            try {
                const result = JSON.parse(dataString);
                if (result.success) {
                    console.log(`ATLAS: Found ${result.data ? result.data.length : 0} detections`);
                    res.json(result);
                } else {
                    console.error('ATLAS error:', result.error);
                    res.status(result.status_code || 404).json({ 
                        message: 'ATLAS: ' + (result.error || 'No data found.'),
                        error: result.error
                    });
                }
            } catch (parseError) {
                console.error('Error parsing ATLAS Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ 
                    error: 'Failed to parse ATLAS response', 
                    details: parseError.message, 
                    raw: dataString.substring(0, 1000) // Limit raw output size
                });
            }
        });
        
        // Set a timeout for the request
        setTimeout(() => {
            python.kill();
            if (!res.headersSent) {
                res.status(408).json({ 
                    error: 'ATLAS request timed out',
                    message: 'ATLAS forced photometry request took too long. This can happen during high server load.'
                });
            }
        }, 600000); // 10 minute timeout for ATLAS requests
        
    } catch (error) {
        console.error('Error in ATLAS photometry proxy:', error);
        res.status(500).json({ 
            error: 'Failed to query ATLAS photometry', 
            details: error.message 
        });
    }
});

app.get('/api/alerce/crossmatch', async (req, res) => {
    const { ra, dec, radius } = req.query;
    if (!ra || !dec) return res.status(400).json({ error: 'ra and dec coordinates are required' });
    
    console.log(`ALeRCE Crossmatch Proxy: Received RA=${ra}, Dec=${dec}, Radius=${radius || 20}`);
    
    try {
        const { spawn } = require('child_process');
        const args = { mode: 'crossmatch', ra, dec, radius: radius || 20 };
        const python = spawn('./venv/bin/python3', ['broker_client.py', JSON.stringify(args)]);
        let dataString = ''; let errorString = '';
        python.stdout.on('data', (data) => dataString += data.toString());
        python.stderr.on('data', (data) => { errorString += data.toString(); console.error('ALeRCE Crossmatch Python stderr:', data.toString()); });
        python.on('close', (code) => {
            console.log(`ALeRCE Crossmatch Python process exited with code ${code}`);
            if (errorString) console.error('ALeRCE Crossmatch Python full errors:', errorString);
            try {
                const result = JSON.parse(dataString);
                if (result.success) res.json(result.data);
                else res.status(result.status_code || 404).json({ message: 'ALeRCE Crossmatch: ' + (result.error || 'No crossmatch data found.') });
            } catch (parseError) {
                console.error('Error parsing ALeRCE Crossmatch Python output:', parseError, 'Raw Output:', dataString);
                res.status(500).json({ error: 'Failed to parse ALeRCE crossmatch response', details: parseError.message, raw: dataString });
            }
        });
    } catch (error) {
        console.error('Error in ALeRCE crossmatch proxy:', error);
        res.status(500).json({ error: 'Failed to query ALeRCE crossmatch', details: error.message });
    }
});

console.log('🔧 Registering API endpoints...');
console.log('✓ TNS endpoints registered');
console.log('✓ ALeRCE endpoints registered'); 
console.log('✓ ATLAS endpoint registered at /api/atlas/photometry');
console.log('✓ All broker endpoints registered');

// --- Static File Serving (MOVED AFTER ALL API ENDPOINTS) ---
app.use(express.static(staticPath, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.js') {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.extname(filePath) === '.css') {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// --- Serve index.html for root path and transient routes (AFTER static and API routes) ---
app.get('/', (req, res) => {
    console.log('Serving index.html for / route');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Debug route to catch unmatched API calls
app.get('/api/*', (req, res) => {
    console.log(`🚨 UNMATCHED API ROUTE: ${req.path}`);
    console.log(`Query params: ${JSON.stringify(req.query)}`);
    console.log(`Available endpoints should include: /api/atlas/photometry`);
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path,
        availableEndpoints: [
            '/api/update-tns',
            '/api/tns-data', 
            '/api/alerce/lightcurve',
            '/api/atlas/photometry',
            '/api/alerce/crossmatch'
        ]
    });
});

// Catch-all route for transient names - serve index.html and let frontend handle routing
app.get('/:transientName', (req, res) => {
    const transientName = req.params.transientName;
    
    // Skip API routes and static file requests
    if (transientName.startsWith('api') || 
        transientName.includes('.') || 
        transientName.startsWith('_') ||
        transientName.startsWith('favicon')) {
        return res.status(404).json({ error: 'Not found' });
    }
    
    console.log(`Serving index.html for transient route: /${transientName}`);
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Error handling middleware (VERY LAST) ---
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.message);
    if (err.stack) console.error(err.stack);
    // Avoid sending HTML for API errors if possible, ensure JSON
    if (req.path.startsWith('/api/') && !res.headersSent) {
        return res.status(err.status || 500).json({
            error: err.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
    // For non-API errors, or if headers already sent, fall back or call next(err)
    if (!res.headersSent) {
         res.status(err.status || 500).json({
            error: err.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    } else {
        next(err); // Fallback to default Express error handler if headers sent
    }
});

app.listen(port, () => {
    if (isDevelopment) {
        console.log(`\n🚀 Development Server running at:`);
        console.log(`   Local:   http://localhost:${port}`);
        console.log(`   Domain:  https://${domain} (if DNS configured)`);
        console.log(`\nAPI Endpoints:`);
        console.log(`   Update TNS data: http://localhost:${port}/api/update-tns`);
        console.log(`   View TNS data:   http://localhost:${port}/api/tns-data`);
        console.log(`   ATLAS photometry: http://localhost:${port}/api/atlas/photometry`);
    } else {
        console.log(`\n🌐 Production Server running at:`);
        console.log(`   Domain: https://${domain}`);
        console.log(`   Port:   ${port}`);
        console.log(`\n✅ Ready to serve themetabroker.org`);
        console.log(`\n🔭 ATLAS endpoint available at: /api/atlas/photometry`);
    }
}); 