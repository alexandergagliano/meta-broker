#!/bin/bash

# Transient Meta-Broker Deployment Script for Linode
# This script handles complete deployment including SSL, Docker, and configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
APP_NAME="meta-broker"
APP_DIR="/opt/${APP_NAME}"
DOMAIN=""
EMAIL=""
GITHUB_REPO="https://github.com/yourusername/supernova-meta-broker.git"

echo -e "${BLUE}🚀 Transient Meta-Broker Deployment Script${NC}"
echo "================================================"

# Function to print colored output
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Function to check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Please do not run this script as root. Use a regular user with sudo privileges."
        exit 1
    fi
}

# Function to get user input
get_user_input() {
    echo
    log_info "We need some information to configure your deployment:"
    echo
    
    # Get domain
    while [ -z "$DOMAIN" ]; do
        read -p "Enter your domain name (e.g., themetabroker.org): " DOMAIN
        if [ -z "$DOMAIN" ]; then
            log_warning "Domain is required!"
        fi
    done
    
    # Get email for SSL
    while [ -z "$EMAIL" ]; do
        read -p "Enter your email for SSL certificate (Let's Encrypt): " EMAIL
        if [ -z "$EMAIL" ]; then
            log_warning "Email is required for SSL certificate!"
        fi
    done
    
    # Get GitHub repo if different
    read -p "GitHub repository URL [$GITHUB_REPO]: " repo_input
    if [ ! -z "$repo_input" ]; then
        GITHUB_REPO="$repo_input"
    fi
    
    echo
    log_info "Configuration:"
    echo "  Domain: $DOMAIN"
    echo "  Email: $EMAIL"
    echo "  Repository: $GITHUB_REPO"
    echo
    read -p "Proceed with deployment? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled."
        exit 0
    fi
}

# Function to update system
update_system() {
    log_info "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    log_success "System updated successfully"
}

# Function to install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log_success "Docker already installed"
        return
    fi
    
    log_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    log_success "Docker installed successfully"
}

# Function to install Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        log_success "Docker Compose already installed"
        return
    fi
    
    log_info "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    log_success "Docker Compose installed successfully"
}

# Function to install additional tools
install_tools() {
    log_info "Installing additional tools..."
    sudo apt install -y curl wget git certbot nginx-common ufw
    log_success "Additional tools installed"
}

# Function to configure firewall
setup_firewall() {
    log_info "Configuring firewall..."
    sudo ufw --force reset
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw --force enable
    log_success "Firewall configured"
}

# Function to clone and setup application
setup_application() {
    log_info "Setting up application in $APP_DIR..."
    
    # Create application directory
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    
    # Clone repository
    if [ -d "$APP_DIR/.git" ]; then
        log_info "Updating existing repository..."
        cd $APP_DIR
        git pull origin main
    else
        log_info "Cloning repository..."
        git clone $GITHUB_REPO $APP_DIR
        cd $APP_DIR
    fi
    
    # Create required directories
    mkdir -p data logs ssl
    
    log_success "Application setup complete"
}

# Function to configure domain settings
configure_domain() {
    log_info "Configuring domain settings..."
    
    # Update docker-compose.yml
    sed -i "s/your-domain.com/$DOMAIN/g" docker-compose.yml
    
    # Update nginx.conf
    sed -i "s/your-domain.com/$DOMAIN/g" nginx.conf
    
    log_success "Domain configuration updated"
}

# Function to setup SSL certificate
setup_ssl() {
    log_info "Setting up SSL certificate with Let's Encrypt..."
    
    # Stop any running web servers
    sudo systemctl stop nginx 2>/dev/null || true
    sudo docker-compose down 2>/dev/null || true
    
    # Get certificate
    sudo certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email $EMAIL \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    # Copy certificates
    sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ./ssl/cert.pem
    sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ./ssl/key.pem
    sudo chown $USER:$USER ./ssl/*.pem
    sudo chmod 644 ./ssl/cert.pem
    sudo chmod 600 ./ssl/key.pem
    
    log_success "SSL certificate configured"
}

# Function to build and deploy application
deploy_application() {
    log_info "Building and deploying application..."
    
    # Build and start services
    docker-compose build --no-cache
    docker-compose --profile nginx up -d
    
    # Wait for services to start
    log_info "Waiting for services to start..."
    sleep 30
    
    log_success "Application deployed successfully"
}

# Function to setup automatic SSL renewal
setup_ssl_renewal() {
    log_info "Setting up automatic SSL certificate renewal..."
    
    # Create renewal script
    cat > /tmp/renew-ssl.sh << 'EOF'
#!/bin/bash
# Renew SSL certificates and restart nginx
certbot renew --quiet --pre-hook "docker-compose -f /opt/meta-broker/docker-compose.yml stop nginx" --post-hook "docker-compose -f /opt/meta-broker/docker-compose.yml start nginx"
EOF
    
    sudo mv /tmp/renew-ssl.sh /usr/local/bin/renew-ssl.sh
    sudo chmod +x /usr/local/bin/renew-ssl.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * 0 /usr/local/bin/renew-ssl.sh") | crontab -
    
    log_success "SSL auto-renewal configured"
}

# Function to setup log rotation
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    sudo tee /etc/logrotate.d/meta-broker > /dev/null << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
    
    log_success "Log rotation configured"
}

# Function to create systemd service for auto-restart
setup_systemd_service() {
    log_info "Setting up systemd service..."
    
    sudo tee /etc/systemd/system/meta-broker.service > /dev/null << EOF
[Unit]
Description=Transient Meta-Broker
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose --profile nginx up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable meta-broker
    
    log_success "Systemd service configured"
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if containers are running
    if ! docker-compose ps | grep -q "Up"; then
        log_error "Some containers are not running!"
        docker-compose logs
        return 1
    fi
    
    # Check HTTP endpoint
    if curl -f -s http://localhost:3000/ > /dev/null; then
        log_success "HTTP endpoint responding"
    else
        log_warning "HTTP endpoint not responding"
    fi
    
    # Check HTTPS endpoint
    if curl -f -s https://$DOMAIN/ > /dev/null; then
        log_success "HTTPS endpoint responding"
    else
        log_warning "HTTPS endpoint not responding (may need DNS propagation)"
    fi
    
    # Check API endpoints
    if curl -f -s https://$DOMAIN/api/tns-cache-info > /dev/null; then
        log_success "API endpoints responding"
    else
        log_warning "API endpoints not responding"
    fi
    
    log_success "Deployment verification complete"
}

# Function to display post-deployment info
show_completion_info() {
    echo
    echo "================================================"
    log_success "🎉 Deployment Complete!"
    echo "================================================"
    echo
    echo "Your Transient Meta-Broker is now running at:"
    echo "  📍 https://$DOMAIN"
    echo "  📍 http://$DOMAIN (redirects to HTTPS)"
    echo
    echo "API Endpoints:"
    echo "  📊 TNS Cache Info: https://$DOMAIN/api/tns-cache-info"
    echo "  🔄 Update TNS:     https://$DOMAIN/api/update-tns"
    echo
    echo "Management Commands:"
    echo "  📋 View logs:      docker-compose logs -f"
    echo "  🔄 Restart:        docker-compose restart"
    echo "  ⏹️  Stop:           docker-compose down"
    echo "  🚀 Start:          docker-compose --profile nginx up -d"
    echo
    echo "Important Files:"
    echo "  📁 Application:    $APP_DIR"
    echo "  💾 TNS Cache:      $APP_DIR/data/tns_cache.json"
    echo "  📝 Logs:           $APP_DIR/logs/"
    echo "  🔐 SSL Certs:      $APP_DIR/ssl/"
    echo
    echo "Next Steps:"
    echo "  1. Visit https://$DOMAIN and enter your TNS credentials"
    echo "  2. Download the full TNS database (may take 2-5 minutes)"
    echo "  3. Start searching for transients!"
    echo
    log_warning "Note: If the domain doesn't work immediately, DNS propagation may take up to 24 hours."
    echo
}

# Main deployment function
main() {
    check_root
    get_user_input
    
    log_info "Starting deployment process..."
    
    update_system
    install_docker
    install_docker_compose
    install_tools
    setup_firewall
    setup_application
    configure_domain
    setup_ssl
    deploy_application
    setup_ssl_renewal
    setup_log_rotation
    setup_systemd_service
    verify_deployment
    show_completion_info
    
    echo
    log_success "🚀 Deployment successful! Your Meta-Broker is ready to use."
    log_info "You may need to log out and back in for Docker group changes to take effect."
}

# Run main function
main "$@" 