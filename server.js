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
        
        // For serverless environments, return a more helpful error about the limitations
        // The full TNS database is ~100MB which exceeds Vercel's limits
        console.log('⚠️ Full TNS database download not supported in serverless environment');
        console.log('   - TNS CSV file: ~100MB');
        console.log('   - Vercel timeout: 10 seconds');
        console.log('   - Vercel memory: Limited');
        
        return { 
            success: false, 
            error: 'Full TNS database download not supported in serverless environment. TNS CSV file (~100MB) exceeds Vercel\'s 10-second timeout and memory limits. Please use the demo data or consider a persistent deployment.',
            serverless_limitation: true,
            suggested_action: 'Use demo data with objects like 1987A, 2011fe, 1993J, etc.'
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
            console.log('⚠️ No TNS cache available in serverless environment');
            // In serverless environments like Vercel, we can't persist large files
            // Return an error that prompts user to enter credentials for fresh download
            res.status(404).json({ 
                error: 'No TNS data available. Please enter TNS credentials to download the latest data.',
                serverless: true,
                message: 'This is a serverless deployment. TNS data cache is not persistent. Please provide TNS credentials to fetch fresh data.'
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

// --- Static File Serving (MOVED AFTER ALL API ENDPOINTS) ---
app.use(express.static(staticPath, {
  setHeaders: (res, filePath) => {
    console.log('Attempting to serve static file:', filePath);
    if (path.extname(filePath) === '.js') {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.extname(filePath) === '.css') {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// --- Serve index.html for root path (AFTER static and API routes) ---
app.get('/', (req, res) => {
    console.log('Serving index.html for / route');
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
    } else {
        console.log(`\n🌐 Production Server running at:`);
        console.log(`   Domain: https://${domain}`);
        console.log(`   Port:   ${port}`);
        console.log(`\n✅ Ready to serve themetabroker.org`);
    }
}); 