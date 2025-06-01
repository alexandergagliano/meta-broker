# Transient Meta-Broker

A containerized web application for searching and analyzing astronomical transients across multiple broker services. Built for researchers who need access to the complete TNS database and comprehensive broker integrations.

## Features

- **Full TNS Database**: Complete access to 100,000+ transients with persistent caching
- **Multi-broker Integration**: Unified data from ALeRCE, Antares, Fink, and Lasair
- **Interactive Visualizations**: Aladin Lite sky viewer and Plotly light curves  
- **Advanced Classifications**: ML classifications, Sherlock contextual analysis
- **Host Galaxy Analysis**: Automated cross-matching and catalog associations
- **Research-Grade Export**: Download photometry and metadata in standard formats
- **Docker Deployment**: Production-ready containerization for reliable hosting

## Architecture

- **Backend**: Node.js/Express with Python broker clients
- **Frontend**: Vanilla JavaScript with modern astronomical libraries
- **Database**: TNS CSV cache with intelligent refresh mechanisms
- **Deployment**: Docker containers with nginx reverse proxy
- **Storage**: Persistent volumes for cache and configuration data

## Quick Start (Docker)

```bash
# Clone and setup
git clone https://github.com/yourusername/supernova-meta-broker.git
cd supernova-meta-broker
mkdir -p data logs ssl

# Deploy with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

Visit http://localhost:3000 to access the application.

## Production Deployment

### Requirements
- **Server**: 2GB+ RAM, 20GB+ storage (Linode/DigitalOcean/AWS)
- **Domain**: DNS pointed to your server
- **SSL**: Let's Encrypt or custom certificates

### Full HTTPS Deployment
```bash
# Configure domain
sed -i 's/your-domain.com/your-actual-domain.com/g' docker-compose.yml nginx.conf

# Get SSL certificate
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/*.pem ./ssl/

# Deploy with reverse proxy
docker-compose --profile nginx up -d
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete production setup instructions.

## TNS Integration

### Credentials Setup
1. Create account at [wis-tns.org](https://www.wis-tns.org/)
2. Find your TNS ID and username in your profile
3. Enter credentials in the web interface
4. Download complete database (~100MB, 100,000+ objects)

### Database Management
- **Automatic refresh**: Configure daily updates via cron
- **Persistent cache**: Survives container restarts
- **Memory optimization**: Efficient parsing and storage

## API Integration

| Service | Purpose | Authentication |
|---------|---------|---------------|
| **TNS** | Official transient registry | TNS ID + Username |
| **ALeRCE** | ML classifications, photometry | Public API |
| **Antares** | Alert stream analysis | Public API |
| **Fink** | Real-time processing | Public API |
| **Lasair** | Sherlock contextual analysis | API Token (optional) |

## Development

```bash
# Local development
npm install
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
npm run dev
```

## Resource Requirements

### Minimum Production
- **CPU**: 1 core
- **RAM**: 2GB  
- **Storage**: 20GB SSD
- **Network**: 1Gbps

### Recommended Production  
- **CPU**: 2+ cores
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Backup**: Daily automated backups

## Security Features

- **No credential caching**: User credentials never stored server-side
- **Secure transmission**: All API calls via authenticated server proxies
- **Rate limiting**: nginx-based request throttling
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
