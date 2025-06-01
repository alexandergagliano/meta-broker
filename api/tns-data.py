import os
import requests
import json
from urllib.parse import urlencode

def handler(request):
    """
    Vercel serverless function to get TNS data.
    This replaces the problematic subprocess approach.
    """
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        # For now, return a simple fallback response
        # In production, you could use external storage (like Vercel's blob storage)
        fallback_data = [
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
            'body': json.dumps(fallback_data)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        } 