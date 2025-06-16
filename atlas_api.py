#!/usr/bin/env python3
"""
ATLAS Forced Photometry API Client
Handles authentication, queuing, and data retrieval from ATLAS forced photometry service
"""
import os
import re
import sys
import time
from io import StringIO
import json
import hashlib
from datetime import datetime, timedelta

import pandas as pd
import requests

BASEURL = "https://fallingstar-data.com/forcedphot"
CACHE_DIR = "atlas_cache"
CACHE_DURATION = 7  # Cache data for 7 days

def ensure_cache_dir():
    """Ensure the cache directory exists"""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

def get_cache_key(ra, dec, mjd_min):
    """Generate a cache key for the given parameters"""
    key_string = f"{ra:.6f}_{dec:.6f}_{mjd_min:.1f}"
    return hashlib.md5(key_string.encode()).hexdigest()

def is_cache_valid(cache_file):
    """Check if cache file exists and is still valid"""
    if not os.path.exists(cache_file):
        return False
    
    # Check if cache is older than CACHE_DURATION days
    cache_time = os.path.getmtime(cache_file)
    cache_date = datetime.fromtimestamp(cache_time)
    if datetime.now() - cache_date > timedelta(days=CACHE_DURATION):
        return False
    
    return True

def load_from_cache(cache_file):
    """Load cached ATLAS data"""
    try:
        with open(cache_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading cache: {e}", file=sys.stderr)
        return None

def save_to_cache(cache_file, data):
    """Save ATLAS data to cache"""
    ensure_cache_dir()
    try:
        with open(cache_file, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error saving to cache: {e}", file=sys.stderr)

def get_atlas_token(username, password):
    """Get authentication token from ATLAS API"""
    if not username or not password:
        return {"success": False, "error": "ATLAS credentials not provided"}
    
    data = {"username": username, "password": password}
    
    try:
        resp = requests.post(url=f"{BASEURL}/api-token-auth/", data=data, timeout=30)
        
        if resp.status_code == 200:
            token = resp.json()["token"]
            return {"success": True, "token": token}
        else:
            error_msg = f"Authentication failed: HTTP {resp.status_code}"
            if resp.text:
                try:
                    error_data = resp.json()
                    if "non_field_errors" in error_data:
                        error_msg = f"Authentication failed: {error_data['non_field_errors'][0]}"
                except:
                    error_msg += f" - {resp.text}"
            return {"success": False, "error": error_msg}
            
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Authentication request timed out"}
    except Exception as e:
        return {"success": False, "error": f"Authentication error: {str(e)}"}

def queue_atlas_job(token, ra, dec, mjd_min):
    """Queue an ATLAS forced photometry job"""
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
    
    queue_data = {
        "ra": ra,
        "dec": dec,
        "mjd_min": mjd_min
    }
    
    task_url = None
    max_retries = 5
    retry_count = 0
    
    while not task_url and retry_count < max_retries:
        try:
            with requests.Session() as s:
                resp = s.post(f"{BASEURL}/queue/", headers=headers, data=queue_data, timeout=30)
                
                if resp.status_code == 201:  # successfully queued
                    task_url = resp.json()["url"]
                    return {"success": True, "task_url": task_url}
                    
                elif resp.status_code == 429:  # throttled
                    message = resp.json().get("detail", "Rate limited")
                    print(f"Rate limited: {message}", file=sys.stderr)
                    
                    # Extract wait time from message
                    t_sec = re.findall(r"available in (\d+) seconds", message)
                    t_min = re.findall(r"available in (\d+) minutes", message)
                    
                    if t_sec:
                        waittime = int(t_sec[0])
                    elif t_min:
                        waittime = int(t_min[0]) * 60
                    else:
                        waittime = 10
                    
                    print(f"Waiting {waittime} seconds before retry", file=sys.stderr)
                    time.sleep(waittime)
                    retry_count += 1
                    
                else:
                    error_msg = f"Queue request failed: HTTP {resp.status_code}"
                    if resp.text:
                        error_msg += f" - {resp.text}"
                    return {"success": False, "error": error_msg}
                    
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Queue request timed out"}
        except Exception as e:
            return {"success": False, "error": f"Queue error: {str(e)}"}
    
    return {"success": False, "error": "Max retries exceeded for queueing job"}

def wait_for_results(token, task_url, max_wait_time=300):
    """Wait for ATLAS job to complete and return results URL"""
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
    
    result_url = None
    taskstarted_printed = False
    start_time = time.time()
    
    while not result_url:
        if time.time() - start_time > max_wait_time:
            return {"success": False, "error": f"Job timed out after {max_wait_time} seconds"}
        
        try:
            with requests.Session() as s:
                resp = s.get(task_url, headers=headers, timeout=30)
                
                if resp.status_code == 200:
                    job_data = resp.json()
                    
                    if job_data.get("finishtimestamp"):
                        result_url = job_data["result_url"]
                        return {"success": True, "result_url": result_url}
                        
                    elif job_data.get("starttimestamp"):
                        if not taskstarted_printed:
                            print(f"Job started at {job_data['starttimestamp']}", file=sys.stderr)
                            taskstarted_printed = True
                        time.sleep(2)
                        
                    else:
                        print(f"Job queued at {job_data.get('timestamp', 'unknown time')}", file=sys.stderr)
                        time.sleep(4)
                        
                else:
                    error_msg = f"Status check failed: HTTP {resp.status_code}"
                    if resp.text:
                        error_msg += f" - {resp.text}"
                    return {"success": False, "error": error_msg}
                    
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Status check timed out"}
        except Exception as e:
            return {"success": False, "error": f"Status check error: {str(e)}"}

def download_atlas_results(token, result_url):
    """Download and parse ATLAS photometry results"""
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
    
    try:
        with requests.Session() as s:
            resp = s.get(result_url, headers=headers, timeout=60)
            
            if resp.status_code == 200:
                textdata = resp.text
                
                # Parse the CSV data
                try:
                    df = pd.read_csv(StringIO(textdata), sep=r"\s+")
                    df = df.rename({"###MJD": "MJD"}, axis="columns")
                    
                    # Convert to list of dictionaries for JSON serialization
                    photometry_data = []
                    for _, row in df.iterrows():
                        # Only include valid detections (not upper limits)
                        if pd.notna(row.get('m')) and pd.notna(row.get('dm')):
                            photometry_data.append({
                                'mjd': float(row['MJD']),
                                'mag': float(row['m']),
                                'e_mag': float(row['dm']),
                                'filter': str(row['F']),  # 'o' or 'c'
                                'flux_ujy': float(row.get('uJy', 0)) if pd.notna(row.get('uJy')) else 0,
                                'flux_err_ujy': float(row.get('duJy', 0)) if pd.notna(row.get('duJy')) else 0,
                                'ra': float(row.get('RA', 0)) if pd.notna(row.get('RA')) else 0,
                                'dec': float(row.get('Dec', 0)) if pd.notna(row.get('Dec')) else 0
                            })
                    
                    return {"success": True, "data": photometry_data, "raw_csv": textdata}
                    
                except Exception as parse_error:
                    return {"success": False, "error": f"Error parsing CSV data: {str(parse_error)}"}
                    
            else:
                error_msg = f"Download failed: HTTP {resp.status_code}"
                if resp.text:
                    error_msg += f" - {resp.text}"
                return {"success": False, "error": error_msg}
                
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Download timed out"}
    except Exception as e:
        return {"success": False, "error": f"Download error: {str(e)}"}

def get_atlas_photometry(username, password, ra, dec, mjd_min=None):
    """
    Main function to get ATLAS forced photometry with caching
    
    Args:
        username: ATLAS username
        password: ATLAS password
        ra: Right ascension in decimal degrees
        dec: Declination in decimal degrees
        mjd_min: Minimum MJD (defaults to 3 years ago)
    
    Returns:
        Dict with success status and data or error message
    """
    # Set default mjd_min to 3 years ago if not specified
    if mjd_min is None:
        three_years_ago = datetime.now() - timedelta(days=3*365)
        mjd_min = (three_years_ago - datetime(1858, 11, 17)).days + 40587
    
    # Check cache first
    cache_key = get_cache_key(ra, dec, mjd_min)
    cache_file = os.path.join(CACHE_DIR, f"atlas_{cache_key}.json")
    
    if is_cache_valid(cache_file):
        print(f"Loading ATLAS data from cache for RA={ra}, Dec={dec}", file=sys.stderr)
        cached_data = load_from_cache(cache_file)
        if cached_data:
            return cached_data
    
    print(f"Fetching fresh ATLAS data for RA={ra}, Dec={dec}, MJD_min={mjd_min}", file=sys.stderr)
    
    # Get authentication token
    token_result = get_atlas_token(username, password)
    if not token_result["success"]:
        return token_result
    
    token = token_result["token"]
    
    # Queue the job
    queue_result = queue_atlas_job(token, ra, dec, mjd_min)
    if not queue_result["success"]:
        return queue_result
    
    task_url = queue_result["task_url"]
    
    # Wait for results
    wait_result = wait_for_results(token, task_url)
    if not wait_result["success"]:
        return wait_result
    
    result_url = wait_result["result_url"]
    
    # Download results
    download_result = download_atlas_results(token, result_url)
    if not download_result["success"]:
        return download_result
    
    # Save to cache
    cache_data = {
        "success": True,
        "data": download_result["data"],
        "cached_at": datetime.now().isoformat(),
        "parameters": {
            "ra": ra,
            "dec": dec, 
            "mjd_min": mjd_min
        }
    }
    save_to_cache(cache_file, cache_data)
    
    return cache_data

if __name__ == "__main__":
    # Command line interface for testing and integration
    if len(sys.argv) != 2:
        print("Usage: python atlas_api.py '<json_args>'")
        sys.exit(1)
    
    try:
        args = json.loads(sys.argv[1])
        username = args.get('username')
        password = args.get('password')
        ra = args.get('ra')
        dec = args.get('dec')
        mjd_min = args.get('mjd_min')
        
        result = get_atlas_photometry(username, password, ra, dec, mjd_min)
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {"success": False, "error": f"Script error: {str(e)}"}
        print(json.dumps(error_result)) 