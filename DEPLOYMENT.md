# Deployment Guide for themetabroker.org

This guide covers deploying The Meta-Broker to production at themetabroker.org.

## Quick Start for Production

1. **Set up your server environment:**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env file to set production values
   # Set NODE_ENV=production
   # Set DOMAIN=themetabroker.org
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Python environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt  # You'll need to create this if it doesn't exist
   ```

4. **Start in production mode:**
   ```bash
   # Option 1: Use the production script
   ./start-production.sh
   
   # Option 2: Set environment variables manually
   NODE_ENV=production DOMAIN=themetabroker.org PORT=80 node server.js
   ```

## Environment Configuration

The application automatically detects its environment and configures itself accordingly:

- **Development**: Allows localhost origins, shows detailed error messages
- **Production**: Restricts origins to your domain, minimal error exposure

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for live deployment |
| `DOMAIN` | `themetabroker.org` | Your domain name |
| `PORT` | `3000` | Server port (hosting providers usually set this) |

## Hosting Provider Setup

### Generic Linux Server / VPS

1. **Install Node.js and Python:**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm python3 python3-pip python3-venv
   
   # CentOS/RHEL
   sudo yum install nodejs npm python3 python3-pip
   ```

2. **Clone your code and set up:**
   ```bash
   git clone <your-repo> /var/www/themetabroker
   cd /var/www/themetabroker
   npm install
   python3 -m venv venv
   source venv/bin/activate
   pip install alerce requests pandas numpy astropy
   ```

3. **Set up reverse proxy (Nginx example):**
   ```nginx
   server {
       listen 80;
       server_name themetabroker.org www.themetabroker.org;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Set up systemd service:**
   ```ini
   # /etc/systemd/system/metabroker.service
   [Unit]
   Description=The Meta-Broker
   After=network.target
   
   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/themetabroker
   Environment=NODE_ENV=production
   Environment=DOMAIN=themetabroker.org
   Environment=PORT=3000
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   
   [Install]
   WantedBy=multi-user.target
   ```

### Heroku

1. **Create Procfile:**
   ```
   web: NODE_ENV=production DOMAIN=themetabroker.org node server.js
   ```

2. **Set buildpacks:**
   ```bash
   heroku buildpacks:add heroku/nodejs
   heroku buildpacks:add heroku/python
   ```

3. **Configure domain:**
   ```bash
   heroku domains:add themetabroker.org
   heroku domains:add www.themetabroker.org
   ```

### Vercel

1. **Create vercel.json:**
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "/server.js"
       }
     ],
     "env": {
       "NODE_ENV": "production",
       "DOMAIN": "themetabroker.org"
     }
   }
   ```

### DigitalOcean App Platform

1. **Create .do/app.yaml:**
   ```yaml
   name: metabroker
   services:
   - name: web
     source_dir: /
     github:
       repo: <your-repo>
       branch: main
     run_command: NODE_ENV=production DOMAIN=themetabroker.org node server.js
     environment_slug: node-js
     instance_count: 1
     instance_size_slug: basic-xxs
     domains:
     - domain: themetabroker.org
     - domain: www.themetabroker.org
   ```

## DNS Configuration

Point your domain to your hosting provider:

1. **For server/VPS hosting:**
   - A record: `themetabroker.org` → `YOUR_SERVER_IP`
   - CNAME record: `www.themetabroker.org` → `themetabroker.org`

2. **For platform hosting (Heroku, Vercel, etc.):**
   - Follow your platform's DNS configuration guide
   - Usually involves CNAME records pointing to platform subdomains

## SSL Certificate

Most hosting providers offer automatic SSL. For manual setup:

```bash
# Using Certbot/Let's Encrypt
sudo certbot --nginx -d themetabroker.org -d www.themetabroker.org
```

## Application Features

The application automatically handles:
- **CORS configuration**: Allows your domain in production, localhost in development
- **API endpoints**: All API calls use relative URLs that work on any domain
- **Static file serving**: CSS, JS, and assets served correctly
- **Error handling**: Production-appropriate error messages

## Monitoring

Check server status:
```bash
# View logs
tail -f /var/log/nginx/access.log
journalctl -u metabroker -f

# Check if server is running
curl -I https://themetabroker.org
```

## Troubleshooting

### Common Issues

1. **CORS errors**: Check that `DOMAIN` environment variable matches your actual domain
2. **Python broker errors**: Ensure Python dependencies are installed in the virtual environment
3. **Port conflicts**: Make sure your chosen port isn't used by another service
4. **File permissions**: Ensure the application can read/write the TNS cache file

### Debug Mode

To run with debug output:
```bash
NODE_ENV=development DOMAIN=themetabroker.org node server.js
```

This enables additional console logging and more detailed error messages.

## Security Notes

- User credentials are never stored on the server - only in browser localStorage
- API tokens are transmitted securely to official broker APIs only
- Production mode limits error message exposure
- All external API calls go through server-side proxies

## Support

For issues with deployment, check:
1. Server logs for Node.js errors
2. Browser console for client-side errors  
3. Network tab for API call failures
4. DNS propagation for domain issues 