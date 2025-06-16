# Transient Meta-Broker

A web application for searching and analyzing astronomical transients across multiple broker services. Provides unified access to TNS, ALeRCE, Antares, Fink, and Lasair data.

## Features

- **Direct URL Access**: Individual transient pages via clean URLs like `themetabroker.org/2011fe`
- **TNS Database Integration**: Access to 100,000+ transients with daily staging of TNS data
- **Multi-broker Support**: Unified data access from ALeRCE, Antares, Fink, and Lasair
- **Enhanced Light Curves**: 
  - ZTF photometry from ALeRCE (g-band, r-band)
  - ATLAS forced photometry (o-band ~560nm, c-band ~460nm) with optional credentials
  - Combined ZTF+ATLAS visualization with proper color coding
  - Intelligent caching to avoid re-downloading ATLAS data
- **Classification Analysis**: ML classifications and Sherlock contextual analysis
- **Host Galaxy Analysis**: Automated cross-matching and catalog associations
- **Interactive Visualizations**: Aladin sky viewer and enhanced Plotly light curves
- **Data Export**: Download combined ZTF+ATLAS photometry and metadata in CSV/JSON formats
- **Docker Deployment**: Containerized deployment with SSL and reverse proxy

### Local Development
```bash
npm install && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && npm start
```

## Architecture & Deployment

**Tech Stack**: Node.js/Express backend, Python broker clients, vanilla JavaScript frontend
**Production**: Docker containers with nginx, SSL, and persistent storage
**Requirements**: 2GB+ RAM, 20GB+ storage

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete production setup instructions.

## URL Routing & Sharing

Access any transient directly via clean URLs:
- `themetabroker.org/2011fe` → SN 2011fe
- `themetabroker.org/2020oi` → SN 2020oi  
- `themetabroker.org/1987A` → SN 1987A

Supports shareable links, browser navigation, bookmarkable pages, and SEO optimization.

## Setup & Usage

### TNS Credentials (Recommended)
1. Create account at [wis-tns.org](https://www.wis-tns.org/)
2. Enter your TNS ID and username in the web interface
3. Download the complete database (100,000+ transients)

### ATLAS Credentials (Optional - Enhanced Light Curves)
1. Request account at [fallingstar-data.com/forcedphot](https://fallingstar-data.com/forcedphot)
2. Wait for approval from the ATLAS team
3. Enter your username and password in the web interface
4. Enjoy enhanced light curves with o-band (orange) and c-band (cyan) data
5. ATLAS data is automatically cached for 7 days to improve performance

### Quick Start
```bash
git clone https://github.com/yourusername/supernova-meta-broker.git
cd supernova-meta-broker
./deploy.sh  # One-command deployment with SSL
```

## Broker Integration

| Service | Purpose | Authentication |
|---------|---------|---------------|
| **TNS** | Official transient registry | TNS ID + Username |
| **ALeRCE** | ML classifications, ZTF photometry | Public API |
| **ATLAS** | Forced photometry (o-band, c-band) | Username + Password (optional) |
| **Antares** | Alert stream analysis | Public API |
| **Fink** | Real-time processing | Public API |
| **Lasair** | Sherlock contextual analysis | API Token (optional) |

## Security & Privacy

- **No credential caching**: User credentials never stored server-side
- **Secure transmission**: All API calls via authenticated server proxies  
- **SSL termination**: Full HTTPS support with modern ciphers

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Test with Docker (`docker-compose up -d`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push and create Pull Request

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md) for setup
- **Issues**: Use GitHub issues for bug reports
- **TNS Problems**: Check [wis-tns.org](https://www.wis-tns.org/) status
- **Broker Status**: Verify individual broker service availability
