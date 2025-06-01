import json
import requests
import sys
from urllib.parse import urlencode

def handler(request):
    """
    Vercel serverless function to handle broker API requests.
    Replaces the subprocess broker_client.py calls.
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
        # Parse broker and parameters from query string
        broker = request.args.get('broker', '')
        ra = request.args.get('ra', '')
        dec = request.args.get('dec', '')
        name = request.args.get('name', '')
        ztf_id = request.args.get('ztf_id', '')
        mode = request.args.get('mode', '')
        radius = request.args.get('radius', '2')
        
        # For now, return mock data structure that matches expected format
        if broker == 'alerce':
            if mode == 'crossmatch':
                mock_data = {
                    "success": True,
                    "data": {
                        "matches": [
                            {
                                "catalog": "GAIA/DR2",
                                "distance_arcsec": 0.5,
                                "ra": float(ra) if ra else 0,
                                "dec": float(dec) if dec else 0,
                                "g_mean_mag": 19.2
                            }
                        ]
                    }
                }
            elif mode == 'lightcurve':
                mock_data = {
                    "success": True,
                    "data": {
                        "detections": [
                            {"mjd": 59000.5, "mag": 19.5, "magerr": 0.1, "fid": 1},
                            {"mjd": 59001.5, "mag": 19.3, "magerr": 0.1, "fid": 2}
                        ]
                    }
                }
            else:
                mock_data = {
                    "success": True,
                    "data": {
                        "oid": ztf_id or name,
                        "ra": float(ra) if ra else 0,
                        "dec": float(dec) if dec else 0,
                        "class": "SN Ia",
                        "probability": 0.85
                    }
                }
        elif broker == 'antares':
            mock_data = {
                "success": True,
                "data": {
                    "objectId": name,
                    "ra": float(ra) if ra else 0,
                    "dec": float(dec) if dec else 0,
                    "tags": ["SN", "variable"],
                    "alerts": 15
                }
            }
        elif broker == 'fink':
            mock_data = {
                "success": True,
                "data": {
                    "objectId": ztf_id or name,
                    "alerts": [
                        {"jd": 2459000.5, "magpsf": 19.2, "sigmapsf": 0.1, "fid": 1}
                    ],
                    "class": "SN Ia"
                }
            }
        elif broker == 'lasair':
            mock_data = {
                "success": True,
                "data": {
                    "objectId": ztf_id or name,
                    "ra": float(ra) if ra else 0,
                    "dec": float(dec) if dec else 0,
                    "sherlock_classifications": [
                        {
                            "classification": "SN",
                            "context_description": "Stellar source detected in host galaxy",
                            "distance": 0.8
                        }
                    ]
                }
            }
        else:
            mock_data = {
                "success": False,
                "error": f"Unknown broker: {broker}"
            }
        
        return {
            'statusCode': 200 if mock_data.get('success') else 404,
            'headers': headers,
            'body': json.dumps(mock_data)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        } 