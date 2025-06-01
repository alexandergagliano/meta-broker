"""
TNS Data API handler for the Transient Meta-Broker.

Docker deployment handler to get TNS data with persistent file caching.
"""

import json
import csv
import os
from urllib.parse import parse_qs

# Define paths relative to project root
CACHE_FILE = 'tns_cache.json'

def handler(event, context=None):
    """
    Handler function to get TNS data from cache or demo data.
    Returns cached TNS data if available, otherwise returns demo dataset.
    """
    
    # CORS headers for browser compatibility
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    if event.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        # Try to read from cache file
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, 'r') as f:
                tns_data = json.load(f)
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(tns_data)
            }
        
        # If no cache, return demo data (fallback)
        demo_data = [
            {
                "name": "SN2024abc",
                "ra": "12.34567",
                "dec": "56.78901",
                "internal_names": "ZTF24aaabcde",
                "object_type": "SN Ia",
                "redshift": "0.045",
                "discovery_date": "2024-01-15",
                "host_name": "NGC 1234",
                "discoverer": "ZTF",
                "source_group": "Public ESO Survey"
            }
        ]
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(demo_data)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        } 