# Transient Meta-Broker Deployment Guide

This guide covers deploying the Transient Meta-Broker application using Docker on a Linode server. The application requires persistent storage and sufficient resources to handle the full TNS database (~100MB CSV with 100,000+ transients).

## Prerequisites

- **Linode Server**: Minimum 2GB RAM, 20GB storage
- **Docker & Docker Compose**: Installed on your server
- **Domain Name**: Pointed to your server's IP address
- **SSL Certificate**: For HTTPS (optional but recommended)

## Quick Start

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes to take effect
```

### 2. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/yourusername/supernova-meta-broker.git
cd supernova-meta-broker

# Create required directories
mkdir -p data logs ssl

# Configure your domain in docker-compose.yml
sed -i 's/your-domain.com/your-actual-domain.com/g' docker-compose.yml
sed -i 's/your-domain.com/your-actual-domain.com/g' nginx.conf
```

### 3. SSL Certificate (Recommended)

#### Option A: Let's Encrypt (Recommended)
```bash
# Install certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
sudo chown $USER:$USER ./ssl/*.pem
```

#### Option B: Self-Signed (Development)
```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ./ssl/key.pem \
    -out ./ssl/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=your-domain.com"
```

### 4. Deploy

#### Simple Deployment (HTTP only)
```bash
# Build and start the application
docker-compose up -d meta-broker

# View logs
docker-compose logs -f meta-broker
```

#### Full Deployment (with HTTPS)
```bash
# Build and start with nginx reverse proxy
docker-compose --profile nginx up -d

# View logs
docker-compose logs -f
```

### 5. Verify Deployment

```bash
# Check application health
curl http://localhost:3000/

# Check with domain (if using nginx)
curl https://your-domain.com/

# Check TNS cache info
curl https://your-domain.com/api/tns-cache-info
```

## Configuration

### Environment Variables

Edit `docker-compose.yml` to customize:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DOMAIN=your-domain.com
```

### Resource Limits

The default configuration allocates:
- **Memory**: 2GB limit, 1GB reservation
- **Storage**: Persistent volumes for cache and logs

For high-traffic deployments, increase memory:

```yaml
deploy:
  resources:
    limits:
      memory: 4G
    reservations:
      memory: 2G
```

### Persistent Storage

Data is stored in:
- `./data/tns_cache.json`: TNS database cache
- `./logs/`: Application logs

## TNS Database Management

### Initial Download

1. Visit your deployed application
2. Enter your TNS credentials:
   - TNS ID: Your numeric TNS user ID
   - TNS Username: Your TNS username
3. Click "Save & Download Fresh Data"
4. Wait 2-5 minutes for the full database download (~100MB)

### Cache Management

```bash
# Check cache status
curl https://your-domain.com/api/tns-cache-info

# View cache file size
ls -lh ./data/tns_cache.json

# Clear cache (force fresh download)
rm ./data/tns_cache.json
docker-compose restart meta-broker
```

### Automatic Updates

Add to crontab for daily TNS updates:

```bash
# Edit crontab
crontab -e

# Add line for daily update at 2 AM
0 2 * * * curl -X POST -H "Content-Type: application/json" -d '{"tns_id":"YOUR_ID","tns_username":"YOUR_USERNAME"}' https://your-domain.com/api/update-tns
```

## Monitoring & Maintenance

### View Logs

```bash
# Application logs
docker-compose logs -f meta-broker

# Nginx logs (if using)
docker-compose logs -f nginx

# System resource usage
docker stats
```

### Health Checks

The application includes built-in health checks:

```bash
# Check container health
docker ps

# Manual health check
curl -f http://localhost:3000/ || echo "Health check failed"
```

### Backup

```bash
# Backup TNS cache
cp ./data/tns_cache.json ./data/tns_cache_backup_$(date +%Y%m%d).json

# Backup entire data directory
tar -czf meta-broker-backup-$(date +%Y%m%d).tar.gz ./data ./logs
```

## Troubleshooting

### Common Issues

#### 1. TNS Download Timeout
```bash
# Check logs for timeout errors
docker-compose logs meta-broker | grep -i timeout

# Increase timeout in server.js if needed
```

#### 2. Memory Issues
```bash
# Check memory usage
docker stats meta-broker

# Increase memory limit in docker-compose.yml
```

#### 3. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in ./ssl/cert.pem -text -noout

# Renew Let's Encrypt certificate
sudo certbot renew
```

#### 4. Permission Issues
```bash
# Fix data directory permissions
sudo chown -R $USER:$USER ./data ./logs

# Fix SSL permissions
sudo chmod 600 ./ssl/key.pem
sudo chmod 644 ./ssl/cert.pem
```

### Performance Optimization

#### 1. Enable SSD Storage (Linode)
- Use Linode's high-performance SSD storage
- Mount at `/var/lib/docker` for better container performance

#### 2. Optimize Memory
```yaml
# Add to docker-compose.yml
services:
  meta-broker:
    environment:
      - NODE_OPTIONS="--max-old-space-size=4096"
```

#### 3. Enable Nginx Caching
```nginx
# Add to nginx.conf
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cache:10m max_size=1g inactive=60m;
```

## Security

### Firewall Configuration

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Regular Updates

```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Update system packages
sudo apt update && sudo apt upgrade -y
```

### SSL Certificate Renewal

```bash
# Add to crontab for automatic renewal
0 0 1 * * sudo certbot renew --quiet && docker-compose restart nginx
```

## Production Checklist

- [ ] Server has sufficient resources (2GB+ RAM, 20GB+ storage)
- [ ] Domain DNS points to server IP
- [ ] SSL certificate installed and valid
- [ ] Firewall properly configured
- [ ] TNS credentials tested and working
- [ ] Database successfully downloaded and cached
- [ ] Health checks passing
- [ ] Backups configured
- [ ] Monitoring in place
- [ ] Log rotation configured

## Support

For issues specific to:
- **TNS Integration**: Check TNS status at https://www.wis-tns.org/
- **Broker APIs**: Verify broker service status (ALeRCE, Antares, Fink, Lasair)
- **Docker Issues**: Check Docker documentation and logs

## Resource Requirements

### Minimum
- **CPU**: 1 core
- **RAM**: 2GB
- **Storage**: 20GB SSD
- **Network**: 1Gbps connection

### Recommended
- **CPU**: 2+ cores  
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 1Gbps connection
- **Backup**: Automated daily backups

This setup provides a robust, scalable platform capable of handling the full TNS database and multiple concurrent users without the limitations of serverless platforms. 