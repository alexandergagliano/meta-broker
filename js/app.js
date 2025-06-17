document.addEventListener('DOMContentLoaded', () => {
    // API Configuration - automatically detects environment
    const API_BASE_URL = window.location.origin;
    console.log('Using API base URL:', API_BASE_URL);
    
    // URL routing functions
    function getTransientFromURL() {
        const path = window.location.pathname;
        if (path === '/') return null;
        // Remove leading slash and decode URI component
        return decodeURIComponent(path.substring(1));
    }
    
    function updateURL(transientName) {
        const newPath = `/${encodeURIComponent(transientName)}`;
        if (window.location.pathname !== newPath) {
            window.history.pushState({ transient: transientName }, `The Meta-Broker - ${transientName}`, newPath);
            updatePageMetadata(transientName);
        }
    }
    
    function updatePageMetadata(transientName, transientData = null) {
        document.title = `The Meta-Broker - ${transientName}`;
        
        // Update meta description
        let description = `Information about transient ${transientName} from multiple astronomical brokers`;
        if (transientData) {
            if (transientData.type) {
                description = `${transientData.type} ${transientName}: discovery, classification, and multi-wavelength data`;
            }
        }
        
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.content = description;
        
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = `The Meta-Broker - ${transientName}`;
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = description;
    }
    
    function navigateToHome() {
        window.history.pushState(null, 'The Meta-Broker', '/');
        document.title = 'The Meta-Broker';
        
        // Reset meta tags to default
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.content = 'Search for transients across multiple astronomical brokers including TNS, ALeRCE, Fink, Lasair, and Antares';
        
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = 'The Meta-Broker';
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = 'Search for transients across multiple astronomical brokers';
    }
    
    const searchForm = document.getElementById('search-form');
    const searchStatus = document.getElementById('search-status');
    const resultsContainer = document.getElementById('results-container');
    const loadingScreen = document.getElementById('loading-screen');
    const loadingStatus = document.getElementById('loading-status');
    const databaseInfo = document.getElementById('database-info');
    
    // Credentials modal elements
    const credentialsModal = document.getElementById('credentials-modal');
    const credentialsForm = document.getElementById('credentials-form');
    const skipCredentialsBtn = document.getElementById('skip-credentials');
    
    // Container elements for broker links
    const tnsContainer = document.getElementById('tns-container');
    const antaresContainer = document.getElementById('antares-container');
    const alerceContainer = document.getElementById('alerce-container');
    const snadContainer = document.getElementById('snad-container');
    const finkContainer = document.getElementById('fink-container');
    const lasairContainer = document.getElementById('lasair-container');
    
    // Cache for TNS data
    let tnsCache = null;
    
    function clearCorruptedCredentials() {
        const storedToken = localStorage.getItem('lasair_api_token');
        if (storedToken && (storedToken.includes('🆔') || storedToken.includes('Object Information') || storedToken.includes('undefined'))) {
            localStorage.removeItem('lasair_api_token');
            localStorage.removeItem('credentials_modal_seen');
        }
        
        // Clear any cached error states that might persist
        localStorage.removeItem('tns_error_cache');
        localStorage.removeItem('app_initialization_failed');
    }
    
    // Clear corrupted data first
    clearCorruptedCredentials();
    
    // Function to fix malformed links in text (especially from Sherlock descriptions)
    function fixMalformedLinks(text) {
        if (!text || typeof text !== 'string') return text;
        
        // Remove all HTML links - both the tags and any raw URLs
        // First remove HTML anchor tags but keep the inner text
        text = text.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
        
        // Remove any remaining raw URLs
        text = text.replace(/https?:\/\/[^\s<>"']+/g, '');
        
        // Clean up any extra spaces that might be left
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }
    
    // API Credentials storage - SECURITY NOTE:
    // Credentials are ONLY stored in browser localStorage and ONLY transmitted
    // to official broker APIs (TNS, Lasair, ATLAS) via our local server proxy.
    // They are NEVER logged, cached, or stored on our servers.
    let API_CREDENTIALS = {
        lasair: localStorage.getItem('lasair_api_token') || '',
        tns_id: localStorage.getItem('tns_id') || '',
        tns_username: localStorage.getItem('tns_username') || '',
        atlas_username: localStorage.getItem('atlas_username') || '',
        atlas_password: localStorage.getItem('atlas_password') || ''
    };
    

    
    // Function to refresh credentials from localStorage
    function refreshCredentials() {
        API_CREDENTIALS.lasair = localStorage.getItem('lasair_api_token') || '';
        API_CREDENTIALS.tns_id = localStorage.getItem('tns_id') || '';
        API_CREDENTIALS.tns_username = localStorage.getItem('tns_username') || '';
        API_CREDENTIALS.atlas_username = localStorage.getItem('atlas_username') || '';
        API_CREDENTIALS.atlas_password = localStorage.getItem('atlas_password') || '';
    }
    
    // Fallback data for serverless environment when TNS download fails
    function getFallbackServerlessData() {
        return [
            {
                name: '2011fe',
                ra: '14:03:05.810',
                declination: '+54:16:25.39',
                type: 'SN Ia',
                redshift: '0.0008',
                discoverydate: '2011-08-24',
                discoverymag: '17.2',
                filter: 'g',
                reporting_group: 'Palomar Transient Factory',
                source_group: 'PTF',
                internal_names: 'SN 2011fe, PTF11kly',
                Discovery_ADS_bibcode: '2011CBET.2792....1N',
                Class_ADS_bibcodes: '2011CBET.2792....1N'
            },
            {
                name: '1987A',
                ra: '05:35:27.989',
                declination: '-69:16:11.50',
                type: 'SN IIP',
                redshift: '0.0009',
                discoverydate: '1987-02-24',
                discoverymag: '4.5',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1987A, Sanduleak -69° 202',
                Discovery_ADS_bibcode: 'IAUC 4316',
                Class_ADS_bibcodes: 'Multiple IAUCs'
            },
            {
                name: '1993J',
                ra: '09:55:24.77',
                declination: '+69:01:13.7',
                type: 'SN IIb',
                redshift: '0.0001',
                discoverydate: '1993-03-28',
                discoverymag: '10.8',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1993J',
                Discovery_ADS_bibcode: '1993IAUC.5731....1R',
                Class_ADS_bibcodes: '1993IAUC.5731....1R'
            }
        ];
    }
    
    // Check if credentials modal should be shown
    function shouldShowCredentialsModal() {
        const hasSeenModal = localStorage.getItem('credentials_modal_seen');
        const hasLasairCredentials = localStorage.getItem('lasair_api_token');
        const hasTnsCredentials = localStorage.getItem('tns_id') && localStorage.getItem('tns_username');
        // Show modal if they haven't seen it AND don't have TNS credentials
        return !hasSeenModal && !hasTnsCredentials;
    }
    
    // Show credentials modal on first visit
    if (shouldShowCredentialsModal()) {
        credentialsModal.style.display = 'flex';
        // Pre-fill any existing credentials
        document.getElementById('lasair-token').value = API_CREDENTIALS.lasair;
        document.getElementById('tns-id').value = API_CREDENTIALS.tns_id;
        document.getElementById('tns-username').value = API_CREDENTIALS.tns_username;
        document.getElementById('atlas-username').value = API_CREDENTIALS.atlas_username;
        document.getElementById('atlas-password').value = API_CREDENTIALS.atlas_password;
    } else {
        credentialsModal.style.display = 'none';
    }
    
    // Handle credentials form submission
    credentialsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCredentials();
        hideCredentialsModal();
    });
    
    // Handle skip credentials button
    skipCredentialsBtn.addEventListener('click', () => {
        hideCredentialsModal();
    });
    
    function saveCredentials() {
        const lasairToken = document.getElementById('lasair-token').value.trim();
        const tnsId = document.getElementById('tns-id').value.trim();
        const tnsUsername = document.getElementById('tns-username').value.trim();
        const atlasUsername = document.getElementById('atlas-username').value.trim();
        const atlasPassword = document.getElementById('atlas-password').value.trim();
        
        if (lasairToken && (lasairToken.includes('🆔') || lasairToken.includes('Object Information') || lasairToken.includes('<') || lasairToken.includes('undefined'))) {
            alert('Invalid API token detected. Please enter a valid Lasair API token.');
            return;
        }
        
        // Validate TNS credentials
        if (tnsId && !tnsUsername) {
            alert('Please enter both TNS ID and username, or leave both empty to use cached data.');
            return;
        }
        if (tnsUsername && !tnsId) {
            alert('Please enter both TNS ID and username, or leave both empty to use cached data.');
            return;
        }
        if (tnsId && isNaN(parseInt(tnsId))) {
            alert('TNS ID must be a number.');
            return;
        }
        
        // Validate ATLAS credentials
        if (atlasUsername && !atlasPassword) {
            alert('Please enter both ATLAS username and password, or leave both empty.');
            return;
        }
        if (atlasPassword && !atlasUsername) {
            alert('Please enter both ATLAS username and password, or leave both empty.');
            return;
        }
        
        if (lasairToken) {
            localStorage.setItem('lasair_api_token', lasairToken);
        }
        
        if (tnsId && tnsUsername) {
            localStorage.setItem('tns_id', tnsId);
            localStorage.setItem('tns_username', tnsUsername);
        }
        
        if (atlasUsername && atlasPassword) {
            localStorage.setItem('atlas_username', atlasUsername);
            localStorage.setItem('atlas_password', atlasPassword);
        }
        
        refreshCredentials();
        localStorage.setItem('credentials_modal_seen', 'true');
    }
    
    function hideCredentialsModal() {
        credentialsModal.style.display = 'none';
        // Mark that user has seen the modal even if they skipped
        localStorage.setItem('credentials_modal_seen', 'true');
        // Initialize the app after credentials are handled
        init();
    }
    
    // Fallback data for famous transients that might not be in the TNS public cache
    function getFallbackTransientData(searchName) {
        const fallbackTransients = {
            '1987a': {
                name: '1987A',
                ra: '05:35:27.989',
                declination: '-69:16:11.50',
                type: 'SN IIP',
                redshift: '0.0009',
                discoverydate: '1987-02-24',
                discoverymag: '4.5',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1987A, Sanduleak -69° 202',
                Discovery_ADS_bibcode: 'IAUC 4316',
                Class_ADS_bibcodes: 'Multiple IAUCs'
            },
            '2011fe': {
                name: '2011fe',
                ra: '14:03:05.810',
                declination: '+54:16:25.39',
                type: 'SN Ia',
                redshift: '0.0008',
                discoverydate: '2011-08-24',
                discoverymag: '17.2',
                filter: 'g',
                reporting_group: 'Palomar Transient Factory',
                source_group: 'PTF',
                internal_names: 'SN 2011fe, PTF11kly',
                Discovery_ADS_bibcode: '2011CBET.2792....1N',
                Class_ADS_bibcodes: '2011CBET.2792....1N'
            },
            '1993j': {
                name: '1993J',
                ra: '09:55:24.77',
                declination: '+69:01:13.7',
                type: 'SN IIb',
                redshift: '0.0001',
                discoverydate: '1993-03-28',
                discoverymag: '10.8',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1993J',
                Discovery_ADS_bibcode: '1993IAUC.5731....1R',
                Class_ADS_bibcodes: '1993IAUC.5731....1R'
            },
            '1994i': {
                name: '1994I',
                ra: '12:36:23.15',
                declination: '+33:32:19.0',
                type: 'SN Ic',
                redshift: '0.0016',
                discoverydate: '1994-04-02',
                discoverymag: '12.2',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1994I',
                Discovery_ADS_bibcode: '1994IAUC.5961....1S',
                Class_ADS_bibcodes: '1994IAUC.5961....1S'
            },
            '1998bw': {
                name: '1998bw',
                ra: '19:35:03.17',
                declination: '-52:50:46.1',
                type: 'SN Ic',
                redshift: '0.0085',
                discoverydate: '1998-04-25',
                discoverymag: '14.1',
                filter: 'V',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 1998bw, GRB 980425',
                Discovery_ADS_bibcode: '1998IAUC.6895....1G',
                Class_ADS_bibcodes: '1998IAUC.6895....1G'
            },
            '2006gy': {
                name: '2006gy',
                ra: '02:22:28.84',
                declination: '+57:09:13.4',
                type: 'SLSN-II',
                redshift: '0.019',
                discoverydate: '2006-09-18',
                discoverymag: '22.2',
                filter: 'R',
                reporting_group: 'Historical',
                source_group: 'Historical',
                internal_names: 'SN 2006gy',
                Discovery_ADS_bibcode: '2006CBET..647....1Q',
                Class_ADS_bibcodes: '2006CBET..647....1Q'
            }
        };
        
        // Check for exact match or common variations
        const normalizedName = searchName.toLowerCase().replace(/^sn\s*/, '');
        return fallbackTransients[normalizedName] || null;
    }
    
    // Function to convert RA/Dec from sexagesimal to decimal degrees
    function convertToDecimal(raString, decString) {
        try {
            let raDecimal, decDecimal;
            
            // Handle RA conversion
            if (typeof raString === 'number') {
                raDecimal = raString;
            } else if (typeof raString === 'string') {
                raString = raString.trim();
                
                // Check if already in decimal format
                if (!raString.includes(':') && !isNaN(parseFloat(raString))) {
                    raDecimal = parseFloat(raString);
                } else {
                    // Handle sexagesimal format (HH:MM:SS.SS or HH MM SS.SS)
                    const raParts = raString.split(/[:\s]+/).map(parseFloat);
                    if (raParts.length < 2 || raParts.length > 3) {
                        throw new Error('Invalid RA format: expected HH:MM:SS or HH MM SS');
                    }
                    
                    const hours = raParts[0] || 0;
                    const minutes = raParts[1] || 0;
                    const seconds = raParts[2] || 0;
                    
                    raDecimal = (hours * 15) + (minutes * 15 / 60) + (seconds * 15 / 3600);
                }
            } else {
                throw new Error('RA must be a string or number');
            }
            
            // Handle Dec conversion
            if (typeof decString === 'number') {
                decDecimal = decString;
            } else if (typeof decString === 'string') {
                decString = decString.trim();
                const isNegative = decString.startsWith('-');
                
                // Check if already in decimal format
                if (!decString.includes(':') && !isNaN(parseFloat(decString))) {
                    decDecimal = parseFloat(decString);
                } else {
                    // Handle sexagesimal format (DD:MM:SS.SS or DD MM SS.SS)
                    const decParts = decString.replace('-', '').split(/[:\s]+/).map(parseFloat);
                    if (decParts.length < 2 || decParts.length > 3) {
                        throw new Error('Invalid Dec format: expected DD:MM:SS or DD MM SS');
                    }
                    
                    const degrees = decParts[0] || 0;
                    const minutes = decParts[1] || 0;
                    const seconds = decParts[2] || 0;
                    
                    decDecimal = degrees + (minutes / 60) + (seconds / 3600);
                    
                    if (isNegative) {
                        decDecimal = -decDecimal;
                    }
                }
            } else {
                throw new Error('Dec must be a string or number');
            }
            
            // Validate ranges
            if (raDecimal < 0 || raDecimal >= 360) {
                console.warn(`RA ${raDecimal} outside valid range [0, 360)`);
            }
            if (decDecimal < -90 || decDecimal > 90) {
                console.warn(`Dec ${decDecimal} outside valid range [-90, 90]`);
            }
            
            return { raDecimal, decDecimal };
        } catch (error) {
            console.error('Error converting coordinates:', error);
            console.error('Input RA:', raString, 'Input Dec:', decString);
            return { raDecimal: null, decDecimal: null };
        }
    }
    
    // Initialize the application
    async function init() {
        try {
            // Show loading screen
            loadingScreen.style.display = 'flex';
            loadingStatus.textContent = 'Connecting to server...';
            
            // Clear any previous error states
            clearCorruptedCredentials();
            
            // Refresh credentials to get the latest from localStorage
            refreshCredentials();
            
            // Check cache freshness first
            let cacheInfo = null;
            let shouldGetFreshData = false;
            
            try {
                const cacheBuster = Date.now();
                const cacheInfoResponse = await fetch(`${API_BASE_URL}/api/tns-cache-info?_=${cacheBuster}`, {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                if (cacheInfoResponse.ok) {
                    cacheInfo = await cacheInfoResponse.json();
        
                    
                                // Decide if we should get fresh data
            const hasCredentials = API_CREDENTIALS.tns_id && API_CREDENTIALS.tns_username;
            const cacheIsOld = !cacheInfo.exists || !cacheInfo.is_current || (cacheInfo.age_days > 0);
            
            shouldGetFreshData = hasCredentials && cacheIsOld;
                    
                    if (cacheInfo.exists && cacheInfo.is_current) {
                        loadingStatus.textContent = 'Cache is current, loading existing data...';
                    } else if (cacheInfo.exists) {
                        loadingStatus.textContent = `Cache is ${cacheInfo.age_days} day(s) old...`;
                    }
                }
            } catch (error) {
                console.warn('Could not check cache info:', error);
                            // If we can't check cache info, try to get fresh data if we have credentials
            shouldGetFreshData = API_CREDENTIALS.tns_id && API_CREDENTIALS.tns_username;
            }
            
            let usedFreshData = false;
            
            if (shouldGetFreshData) {
                try {
                    loadingStatus.textContent = 'Downloading latest TNS data...';
                    const updateResponse = await fetch(`${API_BASE_URL}/api/update-tns`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            tns_id: API_CREDENTIALS.tns_id,
                            tns_username: API_CREDENTIALS.tns_username
                        })
                    });
                    
                    if (updateResponse.ok) {
                        const updateResult = await updateResponse.json();
                        if (updateResult.success) {
                            // TNS download succeeded, get the newly downloaded data
                            const cacheBuster = Date.now();
                            const newCacheResponse = await fetch(`${API_BASE_URL}/api/tns-data?_=${cacheBuster}`, {
                                cache: 'no-store',
                                headers: {
                                    'Cache-Control': 'no-cache'
                                }
                            });
                            if (newCacheResponse.ok) {
                                tnsCache = await newCacheResponse.json();
                                usedFreshData = true;
                                loadingStatus.textContent = 'Loaded latest TNS data successfully!';
                            } else {
                                console.error('TNS download succeeded but failed to retrieve data from cache');
                                loadingStatus.textContent = 'TNS download succeeded but failed to retrieve data...';
                            }
                        } else {
                            console.error('TNS download failed:', updateResult.error);
                            loadingStatus.textContent = `TNS download failed: ${updateResult.error}. Will use fallback data for searches.`;
                        }
                    } else {
                        const errorResult = await updateResponse.json().catch(() => ({ error: 'Unknown error' }));
                        console.error('Failed to download fresh TNS data:', errorResult);
                        loadingStatus.textContent = `TNS download failed: ${errorResult.error || 'Network error'}. Will use fallback data for searches.`;
                    }
                } catch (error) {
                    console.error('Error downloading fresh TNS data:', error);
                    if (error.name === 'TypeError' && error.message.includes('CORS')) {
                        loadingStatus.textContent = 'CORS error detected - using demo data. Please check server logs.';
                    } else {
                        loadingStatus.textContent = `Connection error: ${error.message}. Using demo data.`;
                    }
                }
            }
            
            // If we didn't get fresh data, try to get cached data
            if (!usedFreshData) {
                try {
                    const cacheBuster = Date.now();
                    const cacheResponse = await fetch(`${API_BASE_URL}/api/tns-data?_=${cacheBuster}`, {
                        cache: 'no-store',
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (cacheResponse.ok) {
                        tnsCache = await cacheResponse.json();
                        loadingStatus.textContent = 'Loading cached TNS data...';
                    } else {
                        const errorResponse = await cacheResponse.json();
                        if (errorResponse.serverless) {
                            // In serverless environment with no cache, provide fallback data
                            console.warn('No persistent cache available in serverless environment, using fallback data');
                            tnsCache = getFallbackServerlessData();
                            loadingStatus.textContent = 'Using fallback transient data (limited dataset for demonstration)';
                        } else {
                            throw new Error('No TNS data available. Please enter TNS credentials to download the latest data.');
                        }
                    }
                } catch (error) {
                    if (error.message.includes('serverless')) {
                        // Don't re-throw serverless errors, use fallback data instead
                        console.warn('Serverless environment detected, using fallback data');
                        tnsCache = getFallbackServerlessData();
                        loadingStatus.textContent = 'Using fallback transient data (limited dataset for demonstration)';
                    } else {
                        throw error;
                    }
                }
            }
            
            // Update UI with database info
            let dataAge = '';
            if (usedFreshData) {
                dataAge = ' (latest - downloaded today)';
            } else if (cacheInfo && cacheInfo.exists) {
                if (cacheInfo.is_current) {
                    dataAge = ' (current - from today)';
                } else {
                    dataAge = ` (cached - ${cacheInfo.age_days} day${cacheInfo.age_days === 1 ? '' : 's'} old)`;
                }
            } else {
                dataAge = ' (cached)';
            }
            databaseInfo.textContent = `Database contains ${tnsCache.length.toLocaleString()} transients${dataAge}`;
            
            // Hide loading screen
            loadingScreen.style.display = 'none';
            
            // Enable the search form
            const searchButton = document.querySelector('#search-form button');
            searchButton.disabled = false;
            
        } catch (error) {
            console.error('Initialization error:', error);
            loadingStatus.textContent = `Error: ${error.message}. Please refresh the page and enter TNS credentials.`;
        }
    }
    
    // Only initialize if credentials modal is not shown
    if (!shouldShowCredentialsModal()) {
        init();
    }
    
    // Add collapsible functionality to sections
    function initializeCollapsibleSections() {
        const sectionHeaders = document.querySelectorAll('.section-header');
        
        sectionHeaders.forEach(header => {
            // Skip if already initialized
            if (header.querySelector('.collapse-indicator')) return;
            
            // Add click cursor
            header.style.cursor = 'pointer';
            
            // Add collapse indicator
            const collapseIndicator = document.createElement('span');
            collapseIndicator.innerHTML = '▼';
            collapseIndicator.style.marginLeft = 'auto';
            collapseIndicator.style.transition = 'transform 0.3s ease';
            collapseIndicator.className = 'collapse-indicator';
            header.appendChild(collapseIndicator);
            
            header.addEventListener('click', () => {
                const section = header.parentElement;
                const indicator = header.querySelector('.collapse-indicator');
                
                // Find the content div - look for common content class patterns
                let content = section.querySelector('.lightcurve-stats-content') ||
                             section.querySelector('.primary-classification-content') ||
                             section.querySelector('.ml-classifications-content') ||
                             section.querySelector('.host-galaxy-content') ||
                             section.querySelector('.discovery-info-content') ||
                             section.querySelector('.tags-annotations-content') ||
                             section.querySelector('.context-description-content') ||
                             section.querySelector('.crossmatch-content');
                
                if (content) {
                    if (content.style.display === 'none') {
                        content.style.display = '';
                        indicator.style.transform = 'rotate(0deg)';
                        section.classList.remove('collapsed');
                    } else {
                        content.style.display = 'none';
                        indicator.style.transform = 'rotate(-90deg)';
                        section.classList.add('collapsed');
                    }
                } else {
                    console.warn('[COLLAPSIBLE] No content div found for section:', section.className);
                }
            });
        });
    }
    
    // Add event listener for download photometry button
    document.addEventListener('click', (e) => {
        if (e.target.id === 'downloadPhotometryBtn') {
            downloadPhotometry();
        }
    });

    // Function to search for a transient (can be called from form or URL routing)
    async function searchTransient(transientName) {
        if (!transientName) {
            showStatus('Please enter a transient name', 'error');
            // Navigate back to home if no transient name
            navigateToHome();
            return;
        }
        
        // Clear previous results
        clearResults();
        
        // Show searching status
        showStatus('Searching for ' + transientName + '...', 'info');
        
        // Update URL and browser title
        updateURL(transientName);
        
        try {
            // Search in the cache
            const searchName = transientName.toLowerCase().replace(/^sn\s+/, '');
            let transient = tnsCache.find(obj => {
                const objName = obj.name.toLowerCase().replace(/^sn\s+/, '');
                return objName === searchName || 
                       (obj.internal_names && obj.internal_names.toLowerCase().includes(searchName));
            });
            
            // Fallback for famous transients that may not be in the public TNS cache
            if (!transient) {
                const fallbackData = getFallbackTransientData(searchName);
                if (fallbackData) {
    
                    transient = fallbackData;
                }
            }

            if (!transient) {
                showStatus(`Couldn't find ${transientName} in the TNS database.`, 'error');
                return;
            }
            
            // Display object header (coordinates are now part of the header)
            populateObjectHeader(transient);
            
            // Update page metadata with transient information
            updatePageMetadata(transientName, transient);
            
            // Show the results container
            resultsContainer.style.display = 'block';
            
            // Initialize collapsible sections
            initializeCollapsibleSections();
            
            // Create direct links for each broker
            const { ra: raString, declination: decString, name: snName } = transient;
            const { raDecimal, decDecimal } = convertToDecimal(raString, decString);

            if (raDecimal === null || decDecimal === null) {
                showStatus(`Error: Invalid coordinates for ${snName} (RA: ${raString}, Dec: ${decString}). Cannot fetch broker data.`, 'error');
                return;
            }
            
            // Populate new semantic sections with TNS data
            populatePrimaryClassification(transient);
            populateDiscoveryInformation(transient);
            populateMachineLearningClassifications();
            populateContextualAnalysis();
            populateDetectionStatistics();
            populateTagsAndAnnotations();
            
            // For ALeRCE, try to find a ZTF ID from TNS internal_names
            let alerceSearchName = snName; // Default to IAU name
            let ztfId = null; // Define ztfId variable here
            let hasZtfId = false;
            
            if (transient.internal_names) {
                const internalNames = transient.internal_names.split(/[,;]\s*/);
                const ztfPattern = /^ZTF[0-9]{2}[a-z]{7}$/i; // Basic ZTF ID pattern e.g. ZTF19abcxyz
                const foundZtfId = internalNames.find(name => ztfPattern.test(name.trim()));
                if (foundZtfId) {
                    ztfId = foundZtfId.trim();
                    alerceSearchName = ztfId;
                    hasZtfId = true;
                                } else {
                }
            }
            
            // Check if this object is likely to have broker data
            if (!hasZtfId) {
                // Show a more informative message for non-ZTF objects
                const mlSection = document.getElementById('ml-classifications');
                const contextualSection = document.getElementById('contextual-analysis');
                const detectionSection = document.getElementById('detection-stats');
                
                mlSection.innerHTML = `
                    <div class="no-ztf-notice">
                        <h4>⚠️ Limited Broker Data Available</h4>
                        <p>This object (${transient.name}) does not have a ZTF identifier. It was likely discovered by other surveys:</p>
                        <ul>
                            ${transient.internal_names ? transient.internal_names.split(/[,;]\s*/).map(name => `<li><strong>${name.trim()}</strong></li>`).join('') : '<li>No internal names available</li>'}
                        </ul>
                        <p>Modern astronomical brokers (ALeRCE, Fink, Lasair) primarily process ZTF survey data, so classification and host galaxy information may not be available for this object.</p>
                        <p>Discovery and basic information is still available from TNS above.</p>
                    </div>
                `;
                
                contextualSection.innerHTML = `
                    <div class="no-ztf-notice">
                        <h4>🏠 Host Galaxy Information Not Available</h4>
                        <p>Host galaxy analysis requires data from Lasair's Sherlock classifier, which processes ZTF survey objects. Since ${transient.name} is not from ZTF, this information is not available through the current broker network.</p>
                    </div>
                `;
                
                detectionSection.innerHTML = `
                    <div class="no-ztf-notice">
                        <h4>📊 Detection Statistics Not Available</h4>
                        <p>Detection statistics require photometric data from ZTF-based brokers. Since ${transient.name} was discovered by other surveys (${transient.internal_names}), these statistics are not available.</p>
                        <p>Basic discovery information is available in the Discovery Information section above.</p>
                    </div>
                `;
            }
            
            // Fetch multi-wavelength data with callbacks to update semantic sections
            fetchALeRCEData(alerceSearchName, raDecimal, decDecimal, alerceContainer, () => {
                updateSemanticSections();
            });
            fetchAntaresData(snName, raDecimal, decDecimal, antaresContainer, () => {
                updateSemanticSections();
            });
            fetchFinkData(ztfId, raDecimal, decDecimal, finkContainer, () => {
                updateSemanticSections();
            });
            fetchLasairData(ztfId, raDecimal, decDecimal, lasairContainer, () => {
                updateSemanticSections();
            });
            
            // Populate external links
            populateBrokerFooter(transient, raDecimal, decDecimal);
            
            // After validating coordinates, always show the Aladin viewer
            if (raDecimal !== null && decDecimal !== null) {
                showAladinViewer(raDecimal, decDecimal);
            } else {
                console.warn('[DEBUG] No valid coordinates for Aladin viewer:', { raDecimal, decDecimal });
                document.getElementById('aladin-lite-div').innerHTML = '<div class="alert alert-warning">No coordinates available for Aladin viewer.</div>';
            }
            
            // Clear the status message
            showStatus('');
            
            // --- Light Curve Plotting ---
            // Plot light curve directly here with the correct ZTF ID to avoid state issues
            if (hasZtfId && ztfId) {
                
                // Make sure the lightcurve section is visible
                const lightcurveSection = document.querySelector('.lightcurve-stats-section');
                if (lightcurveSection) {
                    lightcurveSection.style.display = 'block';
                    lightcurveSection.classList.remove('collapsed');
                    
                    // Find and make the content visible too  
                    const content = lightcurveSection.querySelector('.lightcurve-stats-content');
                    if (content) {
                        content.style.display = 'block';
                    }
                    
                    // Also ensure the collapse indicator is in the right state
                    const indicator = lightcurveSection.querySelector('.collapse-indicator');
                    if (indicator) {
                        indicator.style.transform = 'rotate(0deg)';
                    }
                }
                
                // Plot the light curve with the correct ZTF ID
                plotAlerceLightcurve(ztfId);
            } else {
                const lightcurvePlot = document.getElementById('lightcurvePlot');
                if (lightcurvePlot) {
                    lightcurvePlot.innerHTML = 
                        '<div class="alert alert-info"><h4>📈 Light Curve Not Available</h4><p>This object does not have a ZTF identifier and was likely discovered by other surveys (PanSTARRS, ATLAS, etc.). Light curve data is only available for ZTF survey objects.</p></div>';
                }
            }
            
        } catch (error) {
            console.error('Error:', error);
            showStatus('Error searching for transient: ' + error.message, 'error');
        }
    }

    // Form submission handler
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get the transient name from the input
        const transientName = document.getElementById('transient-name').value.trim();
        
            // Search for the transient using the new function
        await searchTransient(transientName);
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (event) => {
        const transientName = getTransientFromURL();
        if (transientName) {
            // Update search input and search for the transient
            document.getElementById('transient-name').value = transientName;
            searchTransient(transientName);
        } else {
            // Clear results and navigate to home
            clearResults();
            document.getElementById('transient-name').value = '';
            showStatus('');
        }
    });

    // Check URL on page load for direct transient links
    const urlTransient = getTransientFromURL();
    if (urlTransient) {
        // Pre-fill the search box and search automatically
        document.getElementById('transient-name').value = urlTransient;
        // Wait for init to complete first
        setTimeout(() => {
            if (tnsCache) {
                searchTransient(urlTransient);
            } else {
                // If cache isn't ready yet, try again after a short delay
                const checkCache = setInterval(() => {
                    if (tnsCache) {
                        clearInterval(checkCache);
                        searchTransient(urlTransient);
                    }
                }, 500);
            }
        }, 100);
    }

    // Handle home link clicks
    document.querySelector('header h1 a').addEventListener('click', (e) => {
        e.preventDefault();
        // Clear search input and results
        document.getElementById('transient-name').value = '';
        clearResults();
        showStatus('');
        navigateToHome();
    });
    
    // Function to show status messages
    function showStatus(message, type = '') {
        searchStatus.textContent = message;
        searchStatus.className = type || '';
    }
    
    // Function to clear previous results
    function clearResults() {
        // Clear old elements (for backward compatibility)
        const coordinatesInfo = document.getElementById('coordinates-info');
        if (coordinatesInfo) coordinatesInfo.innerHTML = '';
        
        // Clear new semantic layout elements
        const objectHeader = document.getElementById('object-header');
        const contextDescSection = document.getElementById('context-description-section');
        const primaryClassification = document.getElementById('primary-classification');
        const mlClassifications = document.getElementById('ml-classifications');
        const contextualAnalysis = document.getElementById('contextual-analysis');
        const detectionStats = document.getElementById('detection-stats');
        const discoveryInfo = document.getElementById('discovery-info');
        const tagsAnnotations = document.getElementById('tags-annotations');
        const crossmatchData = document.getElementById('crossmatch-data');
        
        // Get light curve plot container but DON'T clear it to preserve any existing plot
        const lightcurvePlot = document.getElementById('lightcurvePlot');
        
        // Clear hidden broker containers
        const alerceContainer = document.getElementById('alerce-container');
        const antaresContainer = document.getElementById('antares-container');
        const finkContainer = document.getElementById('fink-container');
        const lasairContainer = document.getElementById('lasair-container');
        // Hide footer
        const footer = document.getElementById('page-footer');
        
        if (objectHeader) objectHeader.innerHTML = '';
        if (contextDescSection) contextDescSection.style.display = 'none';
        if (primaryClassification) primaryClassification.innerHTML = '';
        if (mlClassifications) mlClassifications.innerHTML = '';
        if (contextualAnalysis) contextualAnalysis.innerHTML = '';
        if (detectionStats) detectionStats.innerHTML = '';
        if (discoveryInfo) discoveryInfo.innerHTML = '';
        if (tagsAnnotations) tagsAnnotations.innerHTML = '';
        if (crossmatchData) crossmatchData.innerHTML = '';
        
        // Only clear light curve if there's an error message, not if there's a plot
        if (lightcurvePlot) {
            const hasPlot = lightcurvePlot.querySelector('.js-plotly-plot') || lightcurvePlot._fullLayout;
            if (!hasPlot) {
                lightcurvePlot.innerHTML = '';
            }
        }
        
        if (alerceContainer) alerceContainer.innerHTML = '';
        if (antaresContainer) antaresContainer.innerHTML = '';
        if (finkContainer) finkContainer.innerHTML = '';
        if (lasairContainer) lasairContainer.innerHTML = '';
        if (footer) footer.style.display = 'none';
        
        resultsContainer.style.display = 'none';
    }
    
    // Function to populate object header
    function populateObjectHeader(transient) {
        const objectHeader = document.getElementById('object-header');
        const contextDescSection = document.getElementById('context-description-section');
        objectHeader.innerHTML = `
            <div class="object-name">${transient.name}</div>
            <div class="object-coordinates">RA: ${transient.ra} | Dec: ${transient.declination}</div>
        `;
    }
    
    // Function to populate primary classification section
    function populatePrimaryClassification(transient) {
        const primarySection = document.getElementById('primary-classification');
        
        let html = '<div class="primary-classification-display">';
        
        // Large spectroscopic type and redshift
        if (transient.type) {
            html += `<div class="primary-type">
                <div class="type-label">Spectroscopic Type</div>
                <div class="type-value">${transient.type}</div>
            </div>`;
        }
        
        if (transient.redshift && transient.redshift !== 'null' && transient.redshift !== '') {
            html += `<div class="primary-redshift">
                <div class="redshift-label">Redshift</div>
                <div class="redshift-value">z = ${transient.redshift}</div>
            </div>`;
        }
        
        html += '</div>';
        primarySection.innerHTML = html;
    }
    
    // Function to populate discovery information section
    function populateDiscoveryInformation(transient) {
        const discoverySection = document.getElementById('discovery-info');
        
        let html = '<div class="discovery-info-grid">';
        
        // Basic discovery info
        html += '<div class="discovery-card basic-discovery">';
        html += '<h4>📅 Discovery Details</h4>';
        html += '<dl class="discovery-list">';
        
        if (transient.discoverydate && transient.discoverydate !== 'null') {
            html += `<dt>Discovery Date</dt><dd>${transient.discoverydate}</dd>`;
        }
        if (transient.discoverymag && transient.discoverymag !== 'null') {
            html += `<dt>Discovery Magnitude</dt><dd>${transient.discoverymag}`;
            if (transient.filter && transient.filter !== 'null') {
                html += ` (${transient.filter})`;
            }
            html += '</dd>';
        }
        if (transient.reporting_group && transient.reporting_group !== 'null') {
            html += `<dt>Reporting Group</dt><dd>${transient.reporting_group}</dd>`;
        }
        if (transient.source_group && transient.source_group !== 'null') {
            html += `<dt>Source Group</dt><dd>${transient.source_group}</dd>`;
        }
        
        html += '</dl></div>';
        
        // References and IDs
        html += '<div class="discovery-card references">';
        html += '<h4>📚 References & IDs</h4>';
        html += '<dl class="discovery-list">';
        
        if (transient.internal_names && transient.internal_names !== 'null') {
            html += `<dt>Internal Names</dt><dd>${transient.internal_names}</dd>`;
        }
        if (transient.Discovery_ADS_bibcode && transient.Discovery_ADS_bibcode !== 'null') {
            html += `<dt>Discovery Reference</dt><dd>${transient.Discovery_ADS_bibcode}</dd>`;
        }
        if (transient.Class_ADS_bibcodes && transient.Class_ADS_bibcodes !== 'null') {
            html += `<dt>Classification Reference</dt><dd>${transient.Class_ADS_bibcodes}</dd>`;
        }
        
        html += '</dl></div>';
        html += '</div>';
        
        discoverySection.innerHTML = html;
    }
    
    // Function to populate classification details from all brokers
    function populateMachineLearningClassifications() {
        const mlSection = document.getElementById('ml-classifications');
        const finkContainer = document.getElementById('fink-container');
        const lasairContainer = document.getElementById('lasair-container');
        const alerceContainer = document.getElementById('alerce-container');
        

        
        let html = '<div class="ml-classifications-grid">';
        
        const sherlockData = extractSherlockClassification(lasairContainer);
        if (sherlockData) {
            html += `<div class="ml-source-card sherlock-classification">
                <h4>🕵️ Sherlock Contextual Classification</h4>
                ${sherlockData}
            </div>`;
        }
        
        const finkData = extractFinkMLData(finkContainer);
        if (finkData) {
            html += `<div class="ml-source-card fink-ml">
                <h4>🤖 Fink Neural Networks</h4>
                ${finkData}
            </div>`;
        }
        
        const alerceData = extractAlerceClassifications(alerceContainer);
        if (alerceData) {
            html += `<div class="ml-source-card alerce-ml">
                <h4>🎯 ALeRCE Classifications</h4>
                ${alerceData}
            </div>`;
        }
        
        html += '</div>';
        
        if (html === '<div class="ml-classifications-grid"></div>') {
            const existingContent = mlSection.innerHTML;
            if (existingContent.includes('no-ztf-notice')) {
                return;
            }
            html = '<p class="no-data">Classification details will appear here once broker data is loaded.</p>';
        }
        
        mlSection.innerHTML = html;
    }
    
    function extractAlerceDetectionStats(alerceContainer) {
        if (!alerceContainer || !alerceContainer.innerHTML) return null;
        
        const alerceHTML = alerceContainer.innerHTML;
        
        // Extract key detection statistics from new format
        const detCountMatch = alerceHTML.match(/<dt>Detection Count<\/dt><dd>(\d+)<\/dd>/);
        const histDetMatch = alerceHTML.match(/<dt>Historical Detections<\/dt><dd>([^<]+)<\/dd>/);
        const durationMatch = alerceHTML.match(/<dt>Activity Duration<\/dt><dd>([\d.]+) days<\/dd>/);
        const colorMatch = alerceHTML.match(/<dt>Mean g-r Color<\/dt><dd>([\d.-]+) mag<\/dd>/);
        const maxColorMatch = alerceHTML.match(/<dt>Max g-r Color<\/dt><dd>([\d.-]+) mag<\/dd>/);
        
        if (!detCountMatch && !histDetMatch && !durationMatch && !colorMatch && !maxColorMatch) return null;
        
        let html = '<dl class="stats-data-list">';
        
        if (detCountMatch) {
            html += `<dt>Detection Count</dt><dd>${detCountMatch[1]}</dd>`;
        }
        if (histDetMatch) {
            html += `<dt>Historical Detections</dt><dd>${histDetMatch[1]}</dd>`;
        }
        if (durationMatch) {
            html += `<dt>Activity Duration</dt><dd>${durationMatch[1]} days</dd>`;
        }
        if (colorMatch) {
            html += `<dt>Mean g-r Color</dt><dd>${colorMatch[1]} mag</dd>`;
        }
        if (maxColorMatch) {
            html += `<dt>Max g-r Color</dt><dd>${maxColorMatch[1]} mag</dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    function extractAntaresDetectionStats(antaresContainer) {
        if (!antaresContainer || !antaresContainer.innerHTML) return null;
        
        const antaresHTML = antaresContainer.innerHTML;
        
        // Extract brightness and temporal analysis from new format
        const totalAlertsMatch = antaresHTML.match(/<dt>Total Alerts<\/dt><dd>(\d+)<\/dd>/);
        const peakBrightnessMatch = antaresHTML.match(/<dt>Peak Brightness<\/dt><dd>([\d.]+) mag<\/dd>/);
        const latestMagMatch = antaresHTML.match(/<dt>Latest Magnitude<\/dt><dd>([\d.]+) mag<\/dd>/);
        const timeSpanMatch = antaresHTML.match(/<dt>Activity Span<\/dt><dd>([\d.]+) days<\/dd>/);
        const ztfIdMatch = antaresHTML.match(/<dt>ZTF Object ID<\/dt><dd>([^<]+)<\/dd>/);
        
        if (!totalAlertsMatch && !peakBrightnessMatch && !latestMagMatch && !timeSpanMatch) return null;
        
        let html = '<dl class="stats-data-list">';
        
        if (totalAlertsMatch) {
            html += `<dt>Total Alerts</dt><dd>${totalAlertsMatch[1]}</dd>`;
        }
        if (peakBrightnessMatch) {
            html += `<dt>Peak Brightness</dt><dd>${peakBrightnessMatch[1]} mag</dd>`;
        }
        if (latestMagMatch) {
            html += `<dt>Latest Magnitude</dt><dd>${latestMagMatch[1]} mag</dd>`;
        }
        if (timeSpanMatch) {
            html += `<dt>Activity Span</dt><dd>${timeSpanMatch[1]} days</dd>`;
        }
        if (ztfIdMatch) {
            html += `<dt>ZTF Object ID</dt><dd>${ztfIdMatch[1]}</dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    function extractLasairDetectionStats(lasairContainer) {
        if (!lasairContainer || !lasairContainer.innerHTML) return null;
        
        const lasairHTML = lasairContainer.innerHTML;
        
        // Extract object information section from new format
        const latestDetMatch = lasairHTML.match(/<dt>Latest Detection<\/dt><dd>([^<]+)<\/dd>/);
        const latestMagMatch = lasairHTML.match(/<dt>Latest Magnitude<\/dt><dd>([\d.±\s]+)<\/dd>/);
        const totalDetMatch = lasairHTML.match(/<dt>Total Detections<\/dt><dd>(\d+)<\/dd>/);
        
        if (!latestDetMatch && !latestMagMatch && !totalDetMatch) return null;
        
        let html = '<dl class="stats-data-list">';
        
        if (latestDetMatch) {
            let dateValue = latestDetMatch[1].trim();
            // Check if the date is "Invalid Date" and handle it
            if (dateValue === 'Invalid Date' || dateValue === 'null' || dateValue === '') {
                dateValue = 'Not available';
            }
            html += `<dt>Latest Detection</dt><dd>${dateValue}</dd>`;
        }
        if (latestMagMatch) {
            html += `<dt>Latest Magnitude</dt><dd>${latestMagMatch[1]}</dd>`;
        }
        if (totalDetMatch) {
            html += `<dt>Total Detections</dt><dd>${totalDetMatch[1]}</dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    function extractAntaresTags(antaresContainer) {
        if (!antaresContainer || !antaresContainer.innerHTML) return null;
        
        const antaresHTML = antaresContainer.innerHTML;
        
        // Extract tags section from new format
        const tagsMatch = antaresHTML.match(/<dt>Tags<\/dt><dd><div class="tag-container">(.*?)<\/div><\/dd>/s);
        
        if (!tagsMatch) return null;
        
        return `<div class="tag-container">${tagsMatch[1]}</div>`;
    }
    
    function extractLasairAnnotations(lasairContainer) {
        if (!lasairContainer || !lasairContainer.innerHTML) return null;
        
        const lasairHTML = lasairContainer.innerHTML;
        
        // Extract context description from new format
        const contextMatch = lasairHTML.match(/<dt>Context Description<\/dt><dd class="context-description">([^<]+)<\/dd>/);
        
        if (!contextMatch) return null;
        
        return `<div class="context-description">${contextMatch[1]}</div>`;
    }
    
    // Function to populate footer with broker links
    function populateBrokerFooter(transient, raDecimal, decDecimal) {
        const footer = document.getElementById('page-footer');
        const brokerLinksContainer = document.getElementById('broker-links');
        
        if (!transient || raDecimal === null || decDecimal === null) {
            footer.style.display = 'none';
            return;
        }
        
        const brokerLinks = [];
        
        // TNS Link
        const tnsUrl = `https://www.wis-tns.org/object/${encodeURIComponent(transient.name)}`;
        brokerLinks.push({
            name: 'TNS',
            fullName: 'Transient Name Server',
            url: tnsUrl,
            description: 'Official transient registry',
            color: '#1e293b'
        });
        
        // ALeRCE Link
        const alerceUrl = `https://alerce.online/object/${encodeURIComponent(transient.name)}?ra=${raDecimal}&dec=${decDecimal}&radius=60`;
        brokerLinks.push({
            name: 'ALeRCE',
            fullName: 'Automatic Learning for the Rapid Classification of Events',
            url: alerceUrl,
            description: 'ML classifications',
            color: '#059669'
        });
        
        // Antares Link
        const antaresUrl = `https://antares.noirlab.edu/search?ra=${raDecimal}&dec=${decDecimal}&radius=0.05`;
        brokerLinks.push({
            name: 'Antares',
            fullName: 'Arizona-NOIRLab Temporal Analysis and Response to Events System',
            url: antaresUrl,
            description: 'Alert stream analysis',
            color: '#dc2626'
        });
        
        // Fink Link (only if we have a ZTF ID)
        let ztfId = null;
        if (transient.internal_names) {
            const internalNames = transient.internal_names.split(/[,;]\s*/);
            const ztfPattern = /^ZTF[0-9]{2}[a-z]{7}$/i;
            const foundZtfId = internalNames.find(name => ztfPattern.test(name.trim()));
            if (foundZtfId) {
                ztfId = foundZtfId.trim();
            }
        }
        
        if (ztfId) {
            const finkUrl = `https://fink-portal.org/object/${encodeURIComponent(ztfId)}`;
            brokerLinks.push({
                name: 'Fink',
                fullName: 'Fink Broker',
                url: finkUrl,
                description: 'Real-time analysis',
                color: '#7c3aed'
            });
        }
        
        // Lasair Link
        const lasairUrl = ztfId ? 
            `https://lasair-ztf.lsst.ac.uk/object/${encodeURIComponent(ztfId)}` :
            `https://lasair-ztf.lsst.ac.uk/conesearch/?ra=${raDecimal}&dec=${decDecimal}&radius=3`;
        brokerLinks.push({
            name: 'Lasair',
            fullName: 'Lasair: LSST:UK Transient Broker',
            url: lasairUrl,
            description: 'Contextual analysis',
            color: '#ea580c'
        });
        
        // SNAD Link
        const snadUrl = `https://snad.space/transients/?ra=${raDecimal}&dec=${decDecimal}&r=0.05&name=${encodeURIComponent(transient.name)}`;
        brokerLinks.push({
            name: 'SNAD',
            fullName: 'Transient Anomaly Detection',
            url: snadUrl,
            description: 'Anomaly detection',
            color: '#6366f1'
        });
        
        // Generate HTML for broker links
        let html = '';
        brokerLinks.forEach(broker => {
            html += `
                <div class="broker-link-card">
                    <a href="${broker.url}" target="_blank" class="broker-link-anchor" style="border-left-color: ${broker.color};">
                        <div class="broker-link-header">
                            <span class="broker-name" style="color: ${broker.color};">${broker.name}</span>
                            <span class="broker-full-name">${broker.fullName}</span>
                        </div>
                        <div class="broker-description">${broker.description}</div>
                        <div class="external-link-icon">↗</div>
                    </a>
                </div>
            `;
        });
        
        brokerLinksContainer.innerHTML = html;
        footer.style.display = 'block';
    }

    // Function to populate context description section
    function populateContextDescription() {
        const contextDescSection = document.getElementById('context-description-section');
        const contextDesc = document.getElementById('context-description');
        const lasairContainer = document.getElementById('lasair-container');
        
        // Extract the main context description from Sherlock in new format
        if (lasairContainer && lasairContainer.innerHTML) {
            const lasairHTML = lasairContainer.innerHTML;
            const descMatch = lasairHTML.match(/<dt>Description<\/dt><dd[^>]*>(.*?)<\/dd>/s);
            
            if (descMatch && descMatch[1]) {
                const description = descMatch[1].trim();
                contextDesc.innerHTML = `
                    <div class="context-summary-content">
                        <h3>🔍 Contextual Summary</h3>
                        <div class="summary-text">${description}</div>
                    </div>
                `;
                contextDescSection.style.display = 'block';
                return;
            }

            // Try alternative extraction patterns
            const summaryMatch = lasairHTML.match(/<dt>Summary<\/dt><dd[^>]*>(.*?)<\/dd>/s);
            if (summaryMatch && summaryMatch[1]) {
                const summary = summaryMatch[1].trim();
                contextDesc.innerHTML = `
                    <div class="context-summary-content">
                        <h3>🔍 Contextual Summary</h3>
                        <div class="summary-text">${summary}</div>
                    </div>
                `;
                contextDescSection.style.display = 'block';
                return;
            }
        }
        
        // If Lasair fails, try to extract context from other brokers
        const antaresContainer = document.getElementById('antares-container');
        const alerceContainer = document.getElementById('alerce-container');
        const finkContainer = document.getElementById('fink-container');
        
        // Try Antares tags for context
        if (antaresContainer && antaresContainer.innerHTML) {
            const antaresHTML = antaresContainer.innerHTML;
            const tagsMatch = antaresHTML.match(/<dt>Tags<\/dt><dd[^>]*>.*?<\/dd>/s);
            if (tagsMatch) {
                const tagsHTML = tagsMatch[0];
                if (tagsHTML.includes('extragalactic') || tagsHTML.includes('transient')) {
                    contextDesc.innerHTML = `
                        <div class="context-summary-content">
                            <h3>🔍 Contextual Summary</h3>
                            <div class="summary-text">
                                This object has been classified as an ${tagsHTML.includes('extragalactic') ? 'extragalactic' : ''} 
                                ${tagsHTML.includes('transient') ? 'transient' : 'astronomical object'} 
                                ${tagsHTML.includes('high_amplitude') ? 'with high amplitude variability' : ''}.
                                Based on automated analysis of its photometric and positional properties.
                            </div>
                        </div>
                    `;
                    contextDescSection.style.display = 'block';
                    return;
                }
            }
        }
        
        // Try Fink classification for context
        if (finkContainer && finkContainer.innerHTML) {
            const finkHTML = finkContainer.innerHTML;
            const classMatch = finkHTML.match(/<dt>CDS Cross-match<\/dt><dd[^>]*><strong>(.*?)<\/strong><\/dd>/);
            if (classMatch && classMatch[1] && classMatch[1] !== 'Fail') {
                const classification = classMatch[1];
                contextDesc.innerHTML = `
                    <div class="context-summary-content">
                        <h3>🔍 Contextual Summary</h3>
                        <div class="summary-text">
                            This object has been cross-matched with known astronomical catalogs and classified as: <strong>${classification}</strong>. 
                            This classification is based on positional coincidence with cataloged sources and photometric analysis.
                        </div>
                    </div>
                `;
                contextDescSection.style.display = 'block';
                return;
            }
        }
        
    }
    
    // Function to update all semantic sections when broker data loads
    function updateSemanticSections() {
        populateContextDescription();
        populateMachineLearningClassifications();
        populateContextualAnalysis();
        populateDetectionStatistics();
        populateTagsAndAnnotations();
        populateCrossmatchData();
        
        // Re-initialize collapsible sections after data updates
        initializeCollapsibleSections();
        
        // Light curve plotting is now handled directly from the main search function
        // to avoid issues with object selection
    }
    
    // Function to populate contextual analysis section (now host galaxy metadata)
    function populateContextualAnalysis() {
        const contextualSection = document.getElementById('contextual-analysis');
        const lasairContainer = document.getElementById('lasair-container');
        
        const existingContent = contextualSection.innerHTML;
        if (existingContent.includes('no-ztf-notice')) {
            return;
        }
        
        let html = '<div class="host-galaxy-metadata">';
        
        // Extract host galaxy information from raw Lasair data stored in the container
        if (lasairContainer && lasairContainer.lasairData && 
            typeof lasairContainer.lasairData === 'object' && 
            !Array.isArray(lasairContainer.lasairData) &&
            lasairContainer.lasairData.sherlock_classifications) {
            const sherlockData = lasairContainer.lasairData.sherlock_classifications[0];
            
            // Extract galaxy name from catalogue_object_id or description
            let galaxyName = null;
            if (sherlockData.catalogue_object_id) {
                if (sherlockData.catalogue_object_id.includes('MESSIER')) {
                    const num = sherlockData.catalogue_object_id.match(/MESSIER(\d+)/i);
                    if (num) galaxyName = `Messier ${num[1]} (M${num[1]})`;
                } else if (sherlockData.catalogue_object_id.includes('NGC')) {
                    const num = sherlockData.catalogue_object_id.match(/NGC\s*(\d+)/i);
                    if (num) galaxyName = `NGC ${num[1]}`;
                } else {
                    galaxyName = sherlockData.catalogue_object_id;
                }
            }
            
            // Extract properties from the raw data
            const brightness = sherlockData.Mag && sherlockData.MagFilter ? 
                              `${sherlockData.MagFilter}=${sherlockData.Mag} mag` : null;
            const distance = sherlockData.distance ? `${sherlockData.distance} Mpc` : null;
            const redshift = sherlockData.z || sherlockData.photoZ;
            const angularSize = sherlockData.major_axis_arcsec ? `${sherlockData.major_axis_arcsec}"` : null;
            const physicalSeparation = sherlockData.physical_separation_kpc ? `${sherlockData.physical_separation_kpc} kpc` : null;
            const angularSeparation = sherlockData.separationArcsec ? `${sherlockData.separationArcsec}"` : null;
            const catalogTable = sherlockData.catalogue_table_name;
            const reliability = sherlockData.classificationReliability;
            

            
            if (galaxyName || distance || brightness || redshift || angularSize || physicalSeparation) {
                // Host galaxy name as header
                if (galaxyName && galaxyName !== 'Unknown' && galaxyName !== 'null') {
                    html += `<div class="host-galaxy-name">${galaxyName}</div>`;
                } else {
                    html += '<div class="host-galaxy-name">Host Galaxy</div>';
                }
                
                html += '<h4>📡 Galaxy Properties</h4>';
                html += '<dl class="host-data-list">';
                
                // Primary properties
                if (brightness) {
                    html += `<dt>Brightness</dt><dd><strong>${brightness}</strong></dd>`;
                }
                if (angularSize) {
                    html += `<dt>Angular Size</dt><dd><strong>${angularSize}</strong></dd>`;
                }
                if (redshift) {
                    html += `<dt>Redshift</dt><dd><strong>z = ${redshift}</strong></dd>`;
                }
                if (distance) {
                    html += `<dt>Distance</dt><dd><strong>${distance}</strong></dd>`;
                }
                if (catalogTable) {
                    html += `<dt>Catalog</dt><dd><strong>${catalogTable}</strong></dd>`;
                }
                if (reliability) {
                    html += `<dt>Classification Reliability</dt><dd><strong>${reliability}%</strong></dd>`;
                }
                
                // Separation information
                if (angularSeparation) {
                    html += `<dt>Angular Separation</dt><dd><strong>${angularSeparation}</strong></dd>`;
                }
                if (physicalSeparation) {
                    html += `<dt>Physical Separation</dt><dd><strong>${physicalSeparation}</strong></dd>`;
                }
                
                html += '</dl>';
            }
        }
        
        html += '</div>';
        
        if (html === '<div class="host-galaxy-metadata"></div>') {
            html = '<p class="no-data">Host galaxy information will appear here once Lasair data is loaded.</p>';
        }
        
        contextualSection.innerHTML = html;
    }
    
    // Function to populate detection statistics
    function populateDetectionStatistics() {
        const detectionSection = document.getElementById('detection-stats');
        const alerceContainer = document.getElementById('alerce-container');
        const antaresContainer = document.getElementById('antares-container');
        const lasairContainer = document.getElementById('lasair-container');
        
        let html = '<div class="detection-stats-grid">';
        
        // Extract detection statistics from different brokers
        const alerceStats = extractAlerceDetectionStats(alerceContainer);
        if (alerceStats) {
            html += `<div class="stats-card alerce-stats">
                <h4>🔍 ALeRCE Statistics</h4>
                ${alerceStats}
            </div>`;
        }
        
        const antaresStats = extractAntaresDetectionStats(antaresContainer);
        if (antaresStats) {
            html += `<div class="stats-card antares-stats">
                <h4>📡 Antares Statistics</h4>
                ${antaresStats}
            </div>`;
        }
        
        const lasairStats = extractLasairDetectionStats(lasairContainer);
        if (lasairStats) {
            html += `<div class="stats-card lasair-stats">
                <h4>🌟 Lasair Statistics</h4>
                ${lasairStats}
            </div>`;
        }
        
        html += '</div>';
        
        if (html === '<div class="detection-stats-grid"></div>') {
            const existingContent = detectionSection.innerHTML;
            if (existingContent.includes('no-ztf-notice')) {
                return;
            }
            html = '<p class="no-data">Detection statistics will appear here once broker data is loaded.</p>';
        }
        
        detectionSection.innerHTML = html;
    }
    
    // Function to populate tags and annotations
    function populateTagsAndAnnotations() {
        const tagsSection = document.getElementById('tags-annotations');
        const antaresContainer = document.getElementById('antares-container');
        const lasairContainer = document.getElementById('lasair-container');
        
        let html = '<div class="tags-annotations-grid">';
        
        // Extract tags from Antares
        const antaresTags = extractAntaresTags(antaresContainer);
        if (antaresTags) {
            html += `<div class="tags-card antares-tags">
                <h4>🏷️ Antares Tags</h4>
                ${antaresTags}
            </div>`;
        }
        
        // Extract annotations from Lasair
        const lasairAnnotations = extractLasairAnnotations(lasairContainer);
        if (lasairAnnotations) {
            html += `<div class="tags-card lasair-annotations">
                <h4>📝 Lasair Annotations</h4>
                ${lasairAnnotations}
            </div>`;
        }
        
        html += '</div>';
        
        if (html === '<div class="tags-annotations-grid"></div>') {
            html = '<p class="no-data">Tags and annotations will appear here once broker data is loaded.</p>';
        }
        
        tagsSection.innerHTML = html;
    }
    
    // Function to populate cross-match data
    async function populateCrossmatchData() {
        const crossmatchSection = document.getElementById('crossmatch-data');
        
        // Show loading state
        crossmatchSection.innerHTML = '<div class="crossmatch-loading">Loading catalog cross-matches...</div>';
        
        // Get coordinates from the object header or transient data
        const coordinatesElement = document.querySelector('.object-coordinates');
        if (!coordinatesElement) {
            crossmatchSection.innerHTML = '<div class="crossmatch-no-data">No coordinates available for cross-match queries.</div>';
            return;
        }
        
        // Extract RA and Dec from coordinates display
        const coordText = coordinatesElement.textContent;
        const raMatch = coordText.match(/RA:\s*([0-9.-]+)/);
        const decMatch = coordText.match(/Dec:\s*([0-9.-]+)/);
        
        if (!raMatch || !decMatch) {
            crossmatchSection.innerHTML = '<div class="crossmatch-no-data">Invalid coordinates for cross-match queries.</div>';
            return;
        }
        
        const ra = parseFloat(raMatch[1]);
        const dec = parseFloat(decMatch[1]);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/alerce/crossmatch?ra=${ra}&dec=${dec}&radius=2`);
            
            if (response.ok) {
                const crossmatchData = await response.json();
                displayCrossmatchData(crossmatchData, crossmatchSection);
            } else {
                const errorData = await response.text();
                console.error('Cross-match error response:', errorData);
                crossmatchSection.innerHTML = '<div class="crossmatch-no-data">Failed to load cross-match data.</div>';
            }
        } catch (error) {
            console.error('Cross-match fetch error:', error);
            crossmatchSection.innerHTML = '<div class="crossmatch-no-data">Network error loading cross-match data.</div>';
        }
    }
    
    // Function to display cross-match data
    function displayCrossmatchData(data, container) {
        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = '<div class="crossmatch-no-data">No catalog cross-matches found within 2 arcseconds.</div>';
            return;
        }
        
        const catalogCount = Object.keys(data).length;
        const totalMatches = Object.values(data).reduce((sum, catalog) => sum + Object.keys(catalog).length, 0);
        
        let html = `
            <div class="crossmatch-summary">
                <h4>Cross-match Summary</h4>
                <div class="crossmatch-summary-stats">
                    <span>Catalogs matched: ${catalogCount}</span>
                    <span>Total attributes: ${totalMatches}</span>
                    <span>Search radius: 2 arcseconds</span>
                </div>
            </div>
            <div class="crossmatch-grid">
        `;
        
        // Sort catalogs by name for consistent display
        const sortedCatalogs = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
        
        for (const [catalogName, catalogData] of sortedCatalogs) {
            const attributeCount = Object.keys(catalogData).length;
            const distance = catalogData.dist_arcsec || catalogData.distance || catalogData.separation;
            
            // Get the catalog class name for styling
            const catalogClass = catalogName.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            html += `
                <div class="crossmatch-catalog" data-catalog="${catalogName}">
                    <div class="crossmatch-catalog-header ${catalogClass}">
                        <div>
                            <span class="catalog-name">${catalogName}</span>
                            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 2px;">
                                ${attributeCount} attributes
                            </div>
                        </div>
                        <div>
                            ${distance ? `<span class="distance-badge">${distance.toFixed(2)}"</span>` : ''}
                            <svg class="collapse-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 10l5 5 5-5z"/>
                            </svg>
                        </div>
                    </div>
                    <div class="crossmatch-catalog-content">
                        <dl class="crossmatch-data-list">
            `;
            
            // Sort attributes for consistent display
            const sortedAttributes = Object.entries(catalogData).sort(([a], [b]) => a.localeCompare(b));
            
            for (const [key, value] of sortedAttributes) {
                if (value !== null && value !== undefined && value !== '') {
                    // Format the key to be more readable with proper astronomical terms
                    let formattedKey = key.replace(/_/g, ' ')
                                        .replace(/([A-Z])/g, ' $1')
                                        .trim();
                    
                    // Fix common astronomical abbreviations and terms
                    formattedKey = formattedKey
                        .replace(/\bR A\b/g, 'RA')
                        .replace(/\bDec\b/g, 'Dec')
                        .replace(/\bI D\b/g, 'ID')
                        .replace(/\bM J D\b/g, 'MJD')
                        .replace(/\bCat s H T M\b/g, 'CatsHTM')
                        .replace(/\bmag\b/g, 'Mag')
                        .replace(/\baper\b/g, 'Aper')
                        .replace(/\bauto\b/g, 'Auto')
                        .replace(/\bkron\b/g, 'Kron')
                        .replace(/\bwave length\b/g, 'Wavelength')
                        .replace(/\bexposure time\b/g, 'Exposure Time')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    
                    // Format the value based on type and context
                    let formattedValue = value;
                    if (typeof value === 'number') {
                        // Handle different types of astronomical data appropriately
                        if (key.toLowerCase().includes('mag') && !key.toLowerCase().includes('id')) {
                            // Magnitudes: 2-3 decimal places
                            formattedValue = value.toFixed(2) + ' mag';
                        } else if (key.toLowerCase().includes('dist') || key.toLowerCase().includes('separation')) {
                            // Distances/separations in arcseconds
                            formattedValue = value.toFixed(2) + '"';
                        } else if (key.toLowerCase().includes('id') || key.toLowerCase().includes('detector')) {
                            // IDs should be integers, not scientific notation
                            formattedValue = Math.round(value).toString();
                        } else if (key.toLowerCase().includes('mjd')) {
                            // MJD values
                            formattedValue = value.toFixed(1);
                        } else if (key.toLowerCase().includes('ra') || key.toLowerCase().includes('dec')) {
                            // Coordinates: 6 decimal places (arcsecond precision)
                            formattedValue = value.toFixed(6) + '°';
                        } else if (key.toLowerCase().includes('radius') || key.toLowerCase().includes('kron')) {
                            // Small measurements
                            formattedValue = value.toFixed(3);
                        } else if (key.toLowerCase().includes('wavelength')) {
                            // Wavelengths
                            formattedValue = value.toFixed(0) + ' Å';
                        } else if (key.toLowerCase().includes('time') && value > 100) {
                            // Exposure times
                            formattedValue = value.toFixed(0) + ' s';
                        } else if (value > 100000) {
                            // Large numbers: use integer format
                            formattedValue = Math.round(value).toLocaleString();
                        } else if (value > 10) {
                            // Medium numbers: 1-2 decimal places
                            formattedValue = value.toFixed(1);
                        } else if (value > 0.01) {
                            // Small numbers: 3 decimal places
                            formattedValue = value.toFixed(3);
                        } else if (value > 0) {
                            // Very small numbers: scientific notation
                            formattedValue = value.toExponential(2);
                        } else {
                            formattedValue = value.toString();
                        }
                    }
                    
                    html += `<dt>${formattedKey}</dt><dd>${formattedValue}</dd>`;
                }
            }
            
            html += `
                        </dl>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        
        container.innerHTML = html;
        
        // Add click handlers for collapsible catalogs
        const catalogHeaders = container.querySelectorAll('.crossmatch-catalog-header');
        catalogHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const catalog = header.closest('.crossmatch-catalog');
                catalog.classList.toggle('expanded');
            });
        });
        
        // Expand the first few catalogs by default
        const catalogs = container.querySelectorAll('.crossmatch-catalog');
        catalogs.forEach((catalog, index) => {
            if (index < 3) { // Expand first 3 catalogs
                catalog.classList.add('expanded');
            }
        });
    }
    
    // Helper functions for extracting classification data
    function extractSherlockClassification(lasairContainer) {
        if (!lasairContainer || !lasairContainer.innerHTML) {
            return null;
        }
        
        const lasairHTML = lasairContainer.innerHTML;
        const classMatch = lasairHTML.match(/<span class="classification-badge">([^<]+)<\/span>/);
        const reliabilityMatch = lasairHTML.match(/<dt>Reliability<\/dt><dd>([^<]+)%<\/dd>/);
        
        
        if (!classMatch && !reliabilityMatch) return null;
        
        let html = '<dl class="ml-data-list">';
        
        if (classMatch) {
            html += `<dt>Classification</dt><dd><strong>${classMatch[1]}</strong></dd>`;
        }
        if (reliabilityMatch) {
            html += `<dt>Reliability</dt><dd><strong>${reliabilityMatch[1]}%</strong></dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    function extractFinkMLData(finkContainer) {
        if (!finkContainer || !finkContainer.innerHTML) return null;
        
        const finkHTML = finkContainer.innerHTML;
        
        // Look for SNIa probability and cross-match in new format
        const sniaMatch = finkHTML.match(/<dt>SNIa Probability<\/dt><dd><strong>([^<]+)%<\/strong><\/dd>/);
        const crossMatch = finkHTML.match(/<dt>CDS Cross-match<\/dt><dd><strong>([^<]+)<\/strong><\/dd>/);
        const rfSniaMatch = finkHTML.match(/<dt>RF SNIa Probability<\/dt><dd><strong>([^<]+)%<\/strong><\/dd>/);
        
        if (!sniaMatch && !crossMatch && !rfSniaMatch) return null;
        
        let html = '<dl class="ml-data-list">';
        
        if (crossMatch) {
            html += `<dt>Cross-match Classification</dt><dd><strong>${crossMatch[1]}</strong></dd>`;
        }
        if (sniaMatch) {
            html += `<dt>SNIa Probability</dt><dd><strong>${sniaMatch[1]}%</strong></dd>`;
        }
        if (rfSniaMatch) {
            html += `<dt>RF SNIa Probability</dt><dd><strong>${rfSniaMatch[1]}%</strong></dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    function extractAlerceClassifications(alerceContainer) {
        if (!alerceContainer || !alerceContainer.innerHTML) return null;
        
        const alerceHTML = alerceContainer.innerHTML;
        
        // Look for classifier and stellar classification in new format
        const classifierMatch = alerceHTML.match(/<dt>Classifier<\/dt><dd><strong>([^<]+)<\/strong><\/dd>/);
        const classMatch = alerceHTML.match(/<dt>Primary Class<\/dt><dd><strong>([^<]+)<\/strong><\/dd>/);
        const confidenceMatch = alerceHTML.match(/<dt>Confidence<\/dt><dd>([^<]+)%<\/dd>/);
        const stellarMatch = alerceHTML.match(/<dt>Stellar Classification<\/dt><dd>([^<]+)<\/dd>/);
        
        if (!classifierMatch && !classMatch && !confidenceMatch && !stellarMatch) return null;
        
        let html = '<dl class="ml-data-list">';
        
        if (classifierMatch) {
            html += `<dt>Classifier</dt><dd><strong>${classifierMatch[1]}</strong></dd>`;
        }
        if (classMatch) {
            html += `<dt>Primary Class</dt><dd><strong>${classMatch[1]}</strong></dd>`;
        }
        if (confidenceMatch) {
            html += `<dt>Confidence</dt><dd><strong>${confidenceMatch[1]}%</strong></dd>`;
        }
        if (stellarMatch) {
            html += `<dt>Stellar Classification</dt><dd><strong>${stellarMatch[1]}</strong></dd>`;
        }
        
        html += '</dl>';
        return html;
    }
    
    // Function to fetch data from ALeRCE
    async function fetchALeRCEData(objectName, ra, dec, container, callback) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/proxy/alerce?name=${encodeURIComponent(objectName)}&ra=${ra}&dec=${dec}`);
            
            if (response.ok) {
                const data = await response.json();
                // Convert raw JSON data to formatted HTML
                const formattedHTML = formatAlerceDataToHTML(data);
                container.innerHTML = formattedHTML;
            } else {
                const errorData = await response.text();
                console.error('ALeRCE error response:', errorData);
                container.innerHTML = `<div class="data-error">ALeRCE: ${errorData}</div>`;
            }
        } catch (error) {
            console.error('ALeRCE fetch error:', error);
            container.innerHTML = '<div class="data-error">ALeRCE: Network error</div>';
        }
        
        if (callback) callback();
    }
    
    // Function to fetch data from Antares
    async function fetchAntaresData(objectName, ra, dec, container, callback) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/proxy/antares?name=${encodeURIComponent(objectName)}&ra=${ra}&dec=${dec}`);
            
            if (response.ok) {
                const data = await response.json();
                // Convert raw JSON data to formatted HTML
                const formattedHTML = formatAntaresDataToHTML(data);
                container.innerHTML = formattedHTML;
            } else {
                const errorData = await response.text();
                console.error('Antares error response:', errorData);
                container.innerHTML = `<div class="data-error">Antares: ${errorData}</div>`;
            }
        } catch (error) {
            console.error('Antares fetch error:', error);
            container.innerHTML = '<div class="data-error">Antares: Network error</div>';
        }
        
        if (callback) callback();
    }
    
    // Function to fetch data from Fink
    async function fetchFinkData(ztfId, ra, dec, container, callback) {
        try {
            if (!ztfId) {
                container.innerHTML = '<div class="data-info">Fink: No ZTF ID available</div>';
                if (callback) callback();
                return;
            }
            
            const response = await fetch(`${API_BASE_URL}/api/proxy/fink?name=${encodeURIComponent(ztfId)}&ra=${ra}&dec=${dec}`);
            
            if (response.ok) {
                const data = await response.json();
                // Convert raw JSON data to formatted HTML
                const formattedHTML = formatFinkDataToHTML(data);
                container.innerHTML = formattedHTML;
            } else {
                const errorData = await response.text();
                console.error('Fink error response:', errorData);
                container.innerHTML = `<div class="data-error">Fink: ${errorData}</div>`;
            }
        } catch (error) {
            console.error('Fink fetch error:', error);
            container.innerHTML = '<div class="data-error">Fink: Network error</div>';
        }
        
        if (callback) callback();
    }
    
    // Function to fetch data from Lasair
    async function fetchLasairData(ztfId, ra, dec, container, callback) {
        try {
            refreshCredentials(); // Make sure we have the latest token
            
            const params = new URLSearchParams({
                ra: ra.toString(),
                dec: dec.toString()
            });
            
            if (ztfId) {
                params.append('name', ztfId);
            }
            
            if (API_CREDENTIALS.lasair) {
                params.append('token', API_CREDENTIALS.lasair);
            }
            
            const response = await fetch(`${API_BASE_URL}/api/proxy/lasair?${params.toString()}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (Array.isArray(data) && data.length === 0) {
                    container.lasairData = [];
                    container.innerHTML = '<div class="data-info">Lasair: No data found for this object (likely not in ZTF survey)</div>';
                } else if (Array.isArray(data) && data.length > 0) {
                    container.lasairData = data[0];
                    const formattedHTML = formatLasairDataToHTML(data[0]);
                    container.innerHTML = formattedHTML;
                } else if (data && typeof data === 'object') {
                    container.lasairData = data;
                    const formattedHTML = formatLasairDataToHTML(data);
                    container.innerHTML = formattedHTML;
                } else {
                    container.lasairData = null;
                    container.innerHTML = '<div class="data-error">Lasair: Unexpected data format</div>';
                }
            } else {
                const errorData = await response.text();
                console.error('Lasair error response:', errorData);
                container.innerHTML = `<div class="data-error">Lasair: ${errorData}</div>`;
            }
        } catch (error) {
            console.error('Lasair fetch error:', error);
            container.innerHTML = '<div class="data-error">Lasair: Network error</div>';
        }
        
        if (callback) callback();
    }
    
    // Function to show Aladin viewer
    function showAladinViewer(ra, dec) {
        try {
            const aladinDiv = document.getElementById('aladin-lite-div');
            if (!aladinDiv) {
                console.error('Aladin div not found');
                return;
            }
            
            // Clear any existing Aladin instance
            aladinDiv.innerHTML = '';
            
            // Try to create Aladin instance with better error handling
            try {
                // Create new Aladin instance with more reliable configuration
                const aladin = A.aladin(aladinDiv, {
                    survey: 'P/PanSTARRS/DR1/color-z-zg-g', // Use PanSTARRS DR1 color composite
                    fov: 0.2,
                    target: `${ra} ${dec}`,
                    showReticle: true,
                    showZoomControl: true,
                    showFullscreenControl: true,
                    showLayersControl: true,
                    showGotoControl: true,
                    showShareControl: false,
                    showCatalog: true,
                    showFrame: true,
                    showCooGrid: false, // Disable coordinate grid
                    cooFrame: 'J2000'
                });
                
                // Add a marker at the target position with a slight delay to ensure Aladin is ready
                setTimeout(() => {
                    try {
                        const catalog = A.catalog({name: 'Target', sourceSize: 12, color: 'red'});
                        catalog.addSources([A.source(ra, dec, {name: 'Transient'})]);
                        aladin.addCatalog(catalog);
                    } catch (catalogError) {
                        console.warn('Could not add catalog marker:', catalogError);
                    }
                }, 1000);
                
            } catch (aladinError) {
                console.error('Error creating Aladin instance:', aladinError);
                throw aladinError;
            }
            
        } catch (error) {
            console.error('Error initializing Aladin viewer:', error);
            // Provide a more informative fallback message
            document.getElementById('aladin-lite-div').innerHTML = `
                <div class="alert alert-warning" style="padding: 20px; text-align: center;">
                    <h4>Sky Viewer Unavailable</h4>
                    <p>The sky viewer cannot load due to network restrictions.</p>
                    <p><strong>Coordinates:</strong> RA ${ra}°, Dec ${dec}°</p>
                    <p><a href="https://aladin.u-strasbg.fr/AladinLite/?target=${ra}+${dec}&fov=0.2&survey=P%2FDSS2%2Fcolor" target="_blank">View in external Aladin →</a></p>
                </div>
            `;
        }
    }
    
    // Function to plot ALeRCE light curve with ATLAS data
    async function plotAlerceLightcurve(ztfId) {
        try {
            if (!ztfId) {
                document.getElementById('lightcurvePlot').innerHTML = 
                    '<div class="alert alert-info"><h4>📈 Light Curve Not Available</h4><p>This object does not have a ZTF identifier and was likely discovered by other surveys (PanSTARRS, ATLAS, etc.). Light curve data is only available for ZTF survey objects.</p></div>';
                return;
            }
            
            
            // Ensure the plot container is properly set up
            const plotContainer = document.getElementById('lightcurvePlot');
            if (!plotContainer) {
                console.error('[LIGHTCURVE] Plot container not found');
                return;
            }
            
            
            // Force container to be visible and have dimensions
            plotContainer.style.display = 'block';
            plotContainer.style.width = '100%';
            plotContainer.style.height = '480px';
            plotContainer.style.minHeight = '480px';
            plotContainer.style.position = 'relative';
            plotContainer.style.zIndex = '1';
            
            // Clear any existing Plotly plots
            if (window.Plotly && plotContainer._fullLayout) {
                await Plotly.purge(plotContainer);
            }
            
            // Fetch ZTF data from ALeRCE
            const response = await fetch(`${API_BASE_URL}/api/alerce/lightcurve?ztf_id=${encodeURIComponent(ztfId)}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch ZTF light curve data');
            }
            
            const lightcurveData = await response.json();
            
            // Handle different response formats
            let photometryData = lightcurveData;
            
            // If the response is an object with a data property, use that
            if (lightcurveData && typeof lightcurveData === 'object' && lightcurveData.data) {
                photometryData = lightcurveData.data;
            }
            
            // If it's still not an array, try to extract from different possible structures
            if (!Array.isArray(photometryData)) {
                // Try different possible keys where the array might be
                const possibleKeys = ['detections', 'lightcurve', 'photometry', 'data', 'alerts'];
                for (const key of possibleKeys) {
                    if (photometryData[key] && Array.isArray(photometryData[key])) {
                        photometryData = photometryData[key];
                        break;
                    }
                }
            }
            
            
            if (!Array.isArray(photometryData) || photometryData.length === 0) {
                plotContainer.innerHTML = '<div class="alert alert-info">No ZTF photometry data available for this object.</div>';
                return;
            }
            
            // Process ZTF data for Plotly
            const gFilter = photometryData.filter(d => d.fid === 1);
            const rFilter = photometryData.filter(d => d.fid === 2);
            
            // Try to fetch ATLAS data if credentials are available
            let atlasData = [];
            if (API_CREDENTIALS.atlas_username && API_CREDENTIALS.atlas_password) {
                try {
                    // Get coordinates from the current transient
                    const transientNameInput = document.getElementById('transient-name');
                    if (transientNameInput && transientNameInput.value && tnsCache) {
                        const searchName = transientNameInput.value.trim().toLowerCase().replace(/^sn\s+/, '');
                        let transient = tnsCache.find(obj => {
                            const objName = obj.name.toLowerCase().replace(/^sn\s+/, '');
                            return objName === searchName || 
                                   (obj.internal_names && obj.internal_names.toLowerCase().includes(searchName));
                        });
                        
                        if (!transient) {
                            transient = getFallbackTransientData(searchName);
                        }
                        
                        if (transient && transient.ra && transient.declination) {
                            const { raDecimal, decDecimal } = convertToDecimal(transient.ra, transient.declination);
                            
                            console.log('Fetching ATLAS data for:', transient.name, 'at', raDecimal, decDecimal);
                            if (transient.discoverydate) {
                                console.log('Using discovery date:', transient.discoverydate);
                            }
                            plotContainer.innerHTML = '<div class="loading-message">Loading ZTF and ATLAS photometry...</div>';
                            
                            // Build ATLAS URL with discovery date if available
                            let atlasUrl = `${API_BASE_URL}/api/atlas/photometry?ra=${raDecimal}&dec=${decDecimal}&username=${encodeURIComponent(API_CREDENTIALS.atlas_username)}&password=${encodeURIComponent(API_CREDENTIALS.atlas_password)}`;
                            if (transient.discoverydate && transient.discoverydate !== 'null') {
                                atlasUrl += `&discovery_date=${encodeURIComponent(transient.discoverydate)}`;
                            }
                            
                            const atlasResponse = await fetch(atlasUrl);
                            
                            if (atlasResponse.ok) {
                                const atlasResult = await atlasResponse.json();
                                if (atlasResult.success && atlasResult.data) {
                                    atlasData = atlasResult.data;
                                    console.log(`Found ${atlasData.length} ATLAS detections`);
                                    // Debug: show first few ATLAS data points
                                    if (atlasData.length > 0) {
                                        console.log('First 3 ATLAS data points:', atlasData.slice(0, 3));
                                        console.log('ATLAS MJD range:', Math.min(...atlasData.map(d => d.mjd)), 'to', Math.max(...atlasData.map(d => d.mjd)));
                                        console.log('ATLAS filters found:', [...new Set(atlasData.map(d => d.filter))]);
                                    }
                                } else {
                                    console.warn('ATLAS query succeeded but no data:', atlasResult.message || atlasResult.error);
                                }
                            } else {
                                console.warn('Failed to fetch ATLAS data - will show ZTF only');
                            }
                        }
                    }
                } catch (atlasError) {
                    console.warn('Error fetching ATLAS data:', atlasError);
                    // Continue with ZTF-only plot
                }
            }
            
            // Clear the loading message and prepare for plot
            plotContainer.innerHTML = '';
            
            

            
            const traces = [];
            
            // Add ZTF data traces
            if (gFilter.length > 0) {
                traces.push({
                    x: gFilter.map(d => d.mjd),
                    y: gFilter.map(d => d.mag),
                    error_y: {
                        type: 'data',
                        array: gFilter.map(d => d.e_mag),
                        visible: true
                    },
                    mode: 'markers',
                    name: 'ZTF g-band',
                    marker: { color: 'green', size: 10 }
                });
            }
            
            if (rFilter.length > 0) {
                traces.push({
                    x: rFilter.map(d => d.mjd),
                    y: rFilter.map(d => d.mag),
                    error_y: {
                        type: 'data',
                        array: rFilter.map(d => d.e_mag),
                        visible: true
                    },
                    mode: 'markers',
                    name: 'ZTF r-band',
                    marker: { color: 'red', size: 10 }
                });
            }
            
            // Add ATLAS data traces
            if (atlasData.length > 0) {
                const atlasOFilter = atlasData.filter(d => d.filter === 'o');
                const atlasCFilter = atlasData.filter(d => d.filter === 'c');
                
                console.log(`ATLAS o-filter: ${atlasOFilter.length} points`);
                console.log(`ATLAS c-filter: ${atlasCFilter.length} points`);
                
                if (atlasOFilter.length > 0) {
                    console.log('ATLAS o-filter MJDs:', atlasOFilter.slice(0, 3).map(d => d.mjd));
                    traces.push({
                        x: atlasOFilter.map(d => d.mjd),
                        y: atlasOFilter.map(d => d.mag),
                        error_y: {
                            type: 'data',
                            array: atlasOFilter.map(d => d.e_mag),
                            visible: true
                        },
                        mode: 'markers',
                        name: 'ATLAS o-band',
                        marker: { color: 'orange', size: 8, symbol: 'square' }
                    });
                }
                
                if (atlasCFilter.length > 0) {
                    console.log('ATLAS c-filter MJDs:', atlasCFilter.slice(0, 3).map(d => d.mjd));
                    traces.push({
                        x: atlasCFilter.map(d => d.mjd),
                        y: atlasCFilter.map(d => d.mag),
                        error_y: {
                            type: 'data',
                            array: atlasCFilter.map(d => d.e_mag),
                            visible: true
                        },
                        mode: 'markers',
                        name: 'ATLAS c-band',
                        marker: { color: 'cyan', size: 8, symbol: 'square' }
                    });
                }
            }
            
            const plotData = traces;
            
            // Calculate y-axis range: force between 10-23 mag, but allow dynamic scaling within this range
            let allMags = [];
            traces.forEach(trace => {
                if (trace.y && trace.y.length > 0) {
                    allMags = allMags.concat(trace.y.filter(mag => !isNaN(mag) && mag !== null));
                }
            });
            
            let yMin = 23;  // Faintest (highest magnitude)
            let yMax = 10;  // Brightest (lowest magnitude)
            
            if (allMags.length > 0) {
                const dataMin = Math.max(10, Math.min(...allMags) - 0.5);  // Don't go below 10 mag
                const dataMax = Math.min(23, Math.max(...allMags) + 0.5);  // Don't go above 23 mag
                yMin = dataMax;  // Remember: magnitudes are reversed
                yMax = dataMin;
            }
            
            const layout = {
                title: {
                    text: `Light Curve for ${ztfId}${atlasData.length > 0 ? ' (ZTF + ATLAS)' : ' (ZTF only)'}`,
                    font: { size: 18 }
                },
                xaxis: {
                    title: {
                        text: 'Modified Julian Date (MJD)',
                        font: { size: 16 }
                    },
                    type: 'linear',
                    tickformat: '.1f',
                    tickfont: { size: 14 }
                },
                yaxis: {
                    title: {
                        text: 'Magnitude',
                        font: { size: 16 }
                    },
                    range: [yMin, yMax],  // Force y-axis limits (reversed for magnitudes)
                    tickfont: { size: 14 }
                },
                showlegend: true,
                legend: {
                    font: { size: 14 }
                },
                margin: { l: 70, r: 30, t: 60, b: 70 },
                height: 480,
                width: null,
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                font: { size: 14 }
            };
            
            const config = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                doubleClick: 'reset'
            };
            
            plotContainer.innerHTML = '';
            await Plotly.newPlot(plotContainer, plotData, layout, config);
            
        } catch (error) {
            const plotContainer = document.getElementById('lightcurvePlot');
            if (plotContainer) {
                plotContainer.innerHTML = '<div class="alert alert-danger">Error loading light curve data: ' + error.message + '</div>';
            }
        }
    }
    
    // Functions to format raw JSON data to HTML
    function formatAlerceDataToHTML(data) {
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return '<div class="data-info">No ALeRCE data available</div>';
        }
        
        // Handle nested response structure - data[0].items[0]
        let objData = null;
        if (Array.isArray(data) && data.length > 0) {
            if (data[0].items && Array.isArray(data[0].items) && data[0].items.length > 0) {
                objData = data[0].items[0];
            } else {
                objData = data[0];
            }
        } else {
            objData = data;
        }
        
        let html = '<div class="data-source-card alerce">';
        html += '<div class="data-source-header alerce">🎯 ALeRCE Broker</div>';
        html += '<div class="data-source-content">';
        
        if (objData) {
            html += '<dl class="data-list">';
            
            // Basic object info
            if (objData.oid) html += `<dt>Object ID</dt><dd>${objData.oid}</dd>`;
            if (objData.ndet) html += `<dt>Detection Count</dt><dd>${objData.ndet}</dd>`;
            if (objData.ndethist) html += `<dt>Historical Detections</dt><dd>${objData.ndethist}</dd>`;
            if (objData.lastmjd) {
                const lastDate = new Date((objData.lastmjd - 40587) * 86400000);
                html += `<dt>Last Detection</dt><dd>${lastDate.toISOString().split('T')[0]}</dd>`;
            }
            if (objData.firstmjd) {
                const firstDate = new Date((objData.firstmjd - 40587) * 86400000);
                html += `<dt>First Detection</dt><dd>${firstDate.toISOString().split('T')[0]}</dd>`;
            }
            if (objData.meanra && objData.meandec) {
                html += `<dt>Mean Position</dt><dd>RA: ${objData.meanra.toFixed(6)}, Dec: ${objData.meandec.toFixed(6)}</dd>`;
            }
            
            // Additional fields that might be present
            if (objData.deltajd) html += `<dt>Activity Duration</dt><dd>${objData.deltajd.toFixed(1)} days</dd>`;
            if (objData.stellar !== undefined) {
                html += `<dt>Stellar Classification</dt><dd>${objData.stellar ? 'Stellar' : 'Non-stellar'}</dd>`;
            }
            if (objData.g_r_mean !== undefined && objData.g_r_mean !== null) {
                html += `<dt>Mean g-r Color</dt><dd>${objData.g_r_mean.toFixed(3)} mag</dd>`;
            }
            if (objData.g_r_max !== undefined && objData.g_r_max !== null) {
                html += `<dt>Max g-r Color</dt><dd>${objData.g_r_max.toFixed(3)} mag</dd>`;
            }
            
            // Classification info - check various possible field names
            if (objData.classifier) html += `<dt>Classifier</dt><dd><strong>${objData.classifier}</strong></dd>`;
            if (objData.class) html += `<dt>Primary Class</dt><dd><strong>${objData.class}</strong></dd>`;
            if (objData.probability) html += `<dt>Confidence</dt><dd>${(objData.probability * 100).toFixed(1)}%</dd>`;
            
            html += '</dl>';
        }
        
        html += '</div></div>';
        return html;
    }
    
    function formatAntaresDataToHTML(data) {
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return '<div class="data-info">No Antares data available</div>';
        }
        
        // Handle array response (extract first object)
        const objData = Array.isArray(data) ? data[0] : data;
        
        let html = '<div class="data-source-card antares">';
        html += '<div class="data-source-header antares">📡 Antares Broker</div>';
        html += '<div class="data-source-content">';
        
        if (objData) {
            html += '<dl class="data-list">';
            
            // Basic object info
            if (objData.locus_id) html += `<dt>Locus ID</dt><dd>${objData.locus_id}</dd>`;
            if (objData.ra && objData.dec) {
                html += `<dt>Position</dt><dd>RA: ${objData.ra.toFixed(6)}, Dec: ${objData.dec.toFixed(6)}</dd>`;
            }
            
            // Properties analysis
            if (objData.properties) {
                const props = objData.properties;
                if (props.num_alerts) html += `<dt>Total Alerts</dt><dd>${props.num_alerts}</dd>`;
                if (props.brightest_alert_magnitude) html += `<dt>Peak Brightness</dt><dd>${props.brightest_alert_magnitude.toFixed(2)} mag</dd>`;
                if (props.newest_alert_magnitude) html += `<dt>Latest Magnitude</dt><dd>${props.newest_alert_magnitude.toFixed(2)} mag</dd>`;
                if (props.oldest_alert_observation_time && props.newest_alert_observation_time) {
                    const span = props.newest_alert_observation_time - props.oldest_alert_observation_time;
                    html += `<dt>Activity Span</dt><dd>${span.toFixed(1)} days</dd>`;
                }
                if (props.ztf_object_id) html += `<dt>ZTF Object ID</dt><dd>${props.ztf_object_id}</dd>`;
            }
            
            // Add tags if available
            if (objData.tags && objData.tags.length > 0) {
                html += '<dt>Tags</dt><dd><div class="tag-container">';
                objData.tags.forEach(tag => {
                    html += `<span class="antares-tag">${tag}</span>`;
                });
                html += '</div></dd>';
            }
            
            html += '</dl>';
        }
        
        html += '</div></div>';
        return html;
    }
    
    function formatFinkDataToHTML(data) {
        if (!data) {
            return '<div class="data-info">No Fink data available</div>';
        }
        
        let html = '<div class="data-source-card fink">';
        html += '<div class="data-source-header fink">🤖 Fink Broker</div>';
        html += '<div class="data-source-content">';
        
        if (data.summary) {
            html += '<div class="value-section">';
            html += '<h5>📊 Object Summary</h5>';
            html += '<dl class="data-list">';
            
            const summary = data.summary;
            if (summary.objectId) html += `<dt>Object ID</dt><dd>${summary.objectId}</dd>`;
            if (summary.num_alerts) html += `<dt>Total Alerts</dt><dd>${summary.num_alerts}</dd>`;
            
            // Classifications from the classifications object
            if (summary.classifications) {
                const classifications = summary.classifications;
                if (classifications.cdsxmatch) html += `<dt>CDS Cross-match</dt><dd><strong>${classifications.cdsxmatch}</strong></dd>`;
                if (classifications.snn_snia_vs_nonia !== undefined) {
                    const sniaProb = (classifications.snn_snia_vs_nonia * 100).toFixed(1);
                    html += `<dt>SNIa Probability</dt><dd><strong>${sniaProb}%</strong></dd>`;
                }
                if (classifications.rf_snia_vs_nonia !== undefined) {
                    const rfProb = (classifications.rf_snia_vs_nonia * 100).toFixed(1);
                    html += `<dt>RF SNIa Probability</dt><dd><strong>${rfProb}%</strong></dd>`;
                }
            }
            
            // Photometry summary
            if (summary.photometry_summary) {
                const phot = summary.photometry_summary;
                if (phot.brightest_mag) html += `<dt>Brightest Magnitude</dt><dd>${phot.brightest_mag.toFixed(2)}</dd>`;
                if (phot.faintest_mag) html += `<dt>Faintest Magnitude</dt><dd>${phot.faintest_mag.toFixed(2)}</dd>`;
                if (phot.mean_mag) html += `<dt>Mean Magnitude</dt><dd>${phot.mean_mag.toFixed(2)}</dd>`;
                if (phot.num_valid_detections) html += `<dt>Valid Detections</dt><dd>${phot.num_valid_detections}</dd>`;
            }
            
            html += '</dl></div>';
        }
        
        if (data.full_data && data.full_data.length > 0) {
            html += '<div class="value-section">';
            html += `<h5>📈 Recent Detections (${data.full_data.length} alerts)</h5>`;
            html += '<dl class="data-list">';
            
            const latest = data.full_data[0];
            if (latest) {
                if (latest['i:jd']) {
                    const date = new Date((latest['i:jd'] - 2440587.5) * 86400000);
                    html += `<dt>Latest Detection</dt><dd>${date.toISOString().split('T')[0]}</dd>`;
                }
                if (latest['i:magpsf']) {
                    const mag = latest['i:magpsf'].toFixed(2);
                    const err = latest['i:sigmapsf'] ? latest['i:sigmapsf'].toFixed(2) : 'N/A';
                    html += `<dt>Latest Magnitude</dt><dd>${mag} ± ${err}</dd>`;
                }
                if (latest['i:fid']) {
                    const filter = latest['i:fid'] === 1 ? 'g' : latest['i:fid'] === 2 ? 'r' : 'i';
                    html += `<dt>Filter</dt><dd>${filter}</dd>`;
                }
                if (latest['d:cdsxmatch']) html += `<dt>Cross-match</dt><dd>${latest['d:cdsxmatch']}</dd>`;
                if (latest['d:snn_sn_vs_all'] !== undefined) {
                    html += `<dt>SN vs All Score</dt><dd>${(latest['d:snn_sn_vs_all'] * 100).toFixed(1)}%</dd>`;
                }
            }
            
            html += '</dl></div>';
        }
        
        html += '</div></div>';
        return html;
    }
    
    function formatLasairDataToHTML(data) {
        if (!data) {
            return '<div class="data-info">No Lasair data available</div>';
        }
        
        let html = '<div class="data-source-card lasair">';
        html += '<div class="data-source-header lasair">🌟 Lasair Broker</div>';
        html += '<div class="data-source-content">';
        
        // Object Information
        if (data.objectId) {
            html += '<div class="value-section">';
            html += '<h5>🆔 Object Information</h5>';
            html += '<dl class="data-list">';
            
            html += `<dt>Object ID</dt><dd>${data.objectId}</dd>`;
            if (data.candidates && data.candidates.length > 0) {
                const latestCandidate = data.candidates[0];
                if (latestCandidate.jd) {
                    const date = new Date((latestCandidate.jd - 2440587.5) * 86400000);
                    html += `<dt>Latest Detection</dt><dd>${date.toISOString().split('T')[0]}</dd>`;
                }
                if (latestCandidate.magpsf) {
                    html += `<dt>Latest Magnitude</dt><dd>${latestCandidate.magpsf.toFixed(2)} ± ${latestCandidate.sigmapsf ? latestCandidate.sigmapsf.toFixed(2) : 'N/A'}</dd>`;
                }
                html += `<dt>Total Detections</dt><dd>${data.candidates.length}</dd>`;
            }
            
            html += '</dl></div>';
        }
        
        // Sherlock Classifications
        if (data.sherlock_classifications && data.sherlock_classifications.length > 0) {
            html += '<div class="value-section">';
            html += '<h5>🕵️ Sherlock Contextual Classifications</h5>';
            
            data.sherlock_classifications.forEach((classification, index) => {
                html += '<div class="sherlock-section">';
                html += '<dl class="data-list">';
                
                if (classification.classification) {
                    html += `<dt>Classification</dt><dd><span class="classification-badge">${classification.classification}</span></dd>`;
                }
                if (classification.reliability) {
                    html += `<dt>Reliability</dt><dd>${classification.reliability}%</dd>`;
                }
                if (classification.context_description) {
                    const cleanedDescription = fixMalformedLinks(classification.context_description);
                    html += `<dt>Context Description</dt><dd class="context-description">${cleanedDescription}</dd>`;
                }
                if (classification.distance) {
                    html += `<dt>Distance</dt><dd>${classification.distance} Mpc</dd>`;
                }
                if (classification.magnitude) {
                    html += `<dt>Host Magnitude</dt><dd>${classification.magnitude}</dd>`;
                }
                if (classification.separation) {
                    html += `<dt>Separation</dt><dd>${classification.separation} arcsec</dd>`;
                }
                if (classification.physical_separation_kpc) {
                    html += `<dt>Physical Separation</dt><dd>${classification.physical_separation_kpc} kpc</dd>`;
                }
                
                if (classification.description) {
                    const cleanedDescription = fixMalformedLinks(classification.description);
                    html += `<dt>Description</dt><dd class="context-description">${cleanedDescription}</dd>`;
                }
                if (classification.summary) {
                    const cleanedSummary = fixMalformedLinks(classification.summary);
                    html += `<dt>Summary</dt><dd class="context-description">${cleanedSummary}</dd>`;
                }
                
                html += '</dl></div>';
            });
            
            html += '</div>';
        }
        

        if (data.sherlock && Object.keys(data.sherlock).length > 0) {
            html += '<div class="value-section">';
            html += '<h5>📝 Additional Sherlock Data</h5>';
            html += '<dl class="data-list">';
            
            Object.entries(data.sherlock).forEach(([key, value]) => {
                if (value && value !== 'null' && value !== '') {
                    const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    
                    if (typeof value === 'object' && value !== null) {
                        html += `<dt>${displayKey}</dt><dd>`;
                        if (Array.isArray(value)) {
                            html += value.join(', ');
                        } else {
                            const entries = Object.entries(value);
                            if (entries.length > 0) {
                                html += entries.map(([k, v]) => {
                                    if (typeof v === 'object') {
                                        return `${k}: [Complex Data]`;
                                    }
                                    return `${k}: ${v}`;
                                }).join(', ');
                            } else {
                                html += '[Empty Object]';
                            }
                        }
                        html += '</dd>';
                    } else if (typeof value === 'string' || typeof value === 'number') {
                        html += `<dt>${displayKey}</dt><dd>${value}</dd>`;
                    }
                }
            });
            
            html += '</dl></div>';
        }
        
        html += '</div></div>';
        return html;
    }
    
    // Function to download photometry data as CSV (ZTF + ATLAS)
    async function downloadPhotometry() {
        try {
            // Get the current transient information
            const transientNameInput = document.getElementById('transient-name');
            if (!transientNameInput || !transientNameInput.value) {
                alert('Please search for a transient first');
                return;
            }
            
            const searchName = transientNameInput.value.trim().toLowerCase().replace(/^sn\s+/, '');
            let transient = tnsCache.find(obj => {
                const objName = obj.name.toLowerCase().replace(/^sn\s+/, '');
                return objName === searchName || 
                       (obj.internal_names && obj.internal_names.toLowerCase().includes(searchName));
            });
            
            if (!transient) {
                transient = getFallbackTransientData(searchName);
            }
            
            if (!transient) {
                alert('Transient not found. Please search for a valid transient first.');
                return;
            }
            
            let allPhotometryData = [];
            let hasZtfData = false;
            let hasAtlasData = false;
            
            // Try to get ZTF data
            if (transient.internal_names) {
                const internalNames = transient.internal_names.split(/[,;]\s*/);
                const ztfPattern = /^ZTF[0-9]{2}[a-z]{7}$/i;
                const ztfId = internalNames.find(name => ztfPattern.test(name.trim()));
                
                if (ztfId) {
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/alerce/lightcurve?ztf_id=${encodeURIComponent(ztfId.trim())}`);
                        
                        if (response.ok) {
                            const lightcurveData = await response.json();
                            
                            // Handle different response formats
                            let photometryData = lightcurveData;
                            if (lightcurveData && typeof lightcurveData === 'object' && lightcurveData.data) {
                                photometryData = lightcurveData.data;
                            }
                            
                            if (!Array.isArray(photometryData)) {
                                const possibleKeys = ['detections', 'lightcurve', 'photometry', 'data', 'alerts'];
                                for (const key of possibleKeys) {
                                    if (photometryData[key] && Array.isArray(photometryData[key])) {
                                        photometryData = photometryData[key];
                                        break;
                                    }
                                }
                            }
                            
                            if (Array.isArray(photometryData) && photometryData.length > 0) {
                                // Convert ZTF data to standardized format
                                photometryData.forEach(point => {
                                    const filter = point.fid === 1 ? 'g' : point.fid === 2 ? 'r' : 'i';
                                    allPhotometryData.push({
                                        mjd: point.mjd || '',
                                        mag: point.mag || '',
                                        e_mag: point.e_mag || '',
                                        filter: filter,
                                        survey: 'ZTF',
                                        fid: point.fid || ''
                                    });
                                });
                                hasZtfData = true;
                            }
                        }
                    } catch (ztfError) {
                        console.warn('Failed to fetch ZTF data:', ztfError);
                    }
                }
            }
            
            // Try to get ATLAS data if credentials are available
            if (API_CREDENTIALS.atlas_username && API_CREDENTIALS.atlas_password && transient.ra && transient.declination) {
                try {
                    const { raDecimal, decDecimal } = convertToDecimal(transient.ra, transient.declination);
                    
                    // Build ATLAS URL with discovery date if available
                    let atlasUrl = `${API_BASE_URL}/api/atlas/photometry?ra=${raDecimal}&dec=${decDecimal}&username=${encodeURIComponent(API_CREDENTIALS.atlas_username)}&password=${encodeURIComponent(API_CREDENTIALS.atlas_password)}`;
                    if (transient.discoverydate && transient.discoverydate !== 'null') {
                        atlasUrl += `&discovery_date=${encodeURIComponent(transient.discoverydate)}`;
                    }
                    
                    const atlasResponse = await fetch(atlasUrl);
                    
                    if (atlasResponse.ok) {
                        const atlasResult = await atlasResponse.json();
                        if (atlasResult.success && atlasResult.data && atlasResult.data.length > 0) {
                            // Convert ATLAS data to standardized format
                            atlasResult.data.forEach(point => {
                                allPhotometryData.push({
                                    mjd: point.mjd || '',
                                    mag: point.mag || '',
                                    e_mag: point.e_mag || '',
                                    filter: point.filter || '',  // 'o' or 'c'
                                    survey: 'ATLAS',
                                    flux_ujy: point.flux_ujy || '',
                                    flux_err_ujy: point.flux_err_ujy || ''
                                });
                            });
                            hasAtlasData = true;
                        }
                    }
                } catch (atlasError) {
                    console.warn('Failed to fetch ATLAS data:', atlasError);
                }
            }
            
            if (allPhotometryData.length === 0) {
                alert('No photometry data available for download. Make sure the object has a ZTF ID or provide ATLAS credentials.');
                return;
            }
            
            // Sort by MJD
            allPhotometryData.sort((a, b) => parseFloat(a.mjd) - parseFloat(b.mjd));
            
            // Create CSV content
            const csvHeaders = ['mjd', 'mag', 'e_mag', 'filter', 'survey', 'fid', 'flux_ujy', 'flux_err_ujy'];
            const csvRows = [csvHeaders.join(',')];
            
            allPhotometryData.forEach(point => {
                const row = [
                    point.mjd,
                    point.mag,
                    point.e_mag,
                    point.filter,
                    point.survey,
                    point.fid || '',
                    point.flux_ujy || '',
                    point.flux_err_ujy || ''
                ];
                csvRows.push(row.join(','));
            });
            
            const csvContent = csvRows.join('\n');
            
            // Create filename with current MJD
            const currentDate = new Date();
            const mjd0 = new Date(1858, 10, 17); // November 17, 1858 (month is 0-indexed)
            const currentMJD = Math.floor((currentDate - mjd0) / (1000 * 60 * 60 * 24));
            
            const surveys = [];
            if (hasZtfData) surveys.push('ZTF');
            if (hasAtlasData) surveys.push('ATLAS');
            const filename = `${transient.name.replace(/\s+/g, '_')}_${surveys.join('_')}_photometry_MJD${currentMJD}.csv`;
            
            // Create and trigger download
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            console.log(`Downloaded ${allPhotometryData.length} photometry points from ${surveys.join(' + ')}`);
            
        } catch (error) {
            console.error('Error downloading photometry:', error);
            alert('Error downloading photometry data: ' + error.message);
        }
    }
});
