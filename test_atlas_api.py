#!/usr/bin/env python3
# Test script to understand ATLAS API data format
import os
import re
import sys
import time
from io import StringIO

import pandas as pd
import requests

BASEURL = "https://fallingstar-data.com/forcedphot"

# Test with dummy credentials first to see the data structure
# We'll use real credentials when integrating
print("Testing ATLAS API with test coordinates...")

# For testing, let's use a well-known supernova coordinate
# SN 2011fe: RA=14:03:05.810, Dec=+54:16:25.39
# Converting to decimal degrees: RA=210.774625, Dec=54.273719

test_ra = 210.774625  # SN 2011fe
test_dec = 54.273719
test_mjd_min = 55800.0  # Around 2011

# First, let's try to get a token (this will fail without real credentials)
# but we can still examine the API structure
data = {"username": "test_username", "password": "test_password"}

try:
    resp = requests.post(url=f"{BASEURL}/api-token-auth/", data=data)
    print(f"Token request status: {resp.status_code}")
    print(f"Token response: {resp.text}")
    
    if resp.status_code == 200:
        token = resp.json()["token"]
        print(f"Got token: {token}")
        
        headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
        
        # Test the queue endpoint
        queue_data = {
            "ra": test_ra,
            "dec": test_dec,
            "mjd_min": test_mjd_min
        }
        
        print(f"\nTesting queue with: RA={test_ra}, Dec={test_dec}, MJD_min={test_mjd_min}")
        
        with requests.Session() as s:
            resp = s.post(f"{BASEURL}/queue/", headers=headers, data=queue_data)
            print(f"Queue request status: {resp.status_code}")
            print(f"Queue response: {resp.text}")
            
    else:
        print("Authentication failed (expected with test credentials)")
        
except Exception as e:
    print(f"Error testing ATLAS API: {e}")

# Let's also examine what a typical ATLAS CSV might look like
print("\n" + "="*50)
print("Expected ATLAS CSV format based on documentation:")
print("="*50)

# Based on ATLAS documentation, the CSV should contain columns like:
expected_columns = [
    "###MJD",  # Modified Julian Date  
    "m",       # Magnitude
    "dm",      # Magnitude error
    "uJy",     # Flux in microJanskys
    "duJy",    # Flux error
    "F",       # Filter (o or c)
    "err",     # Error flags
    "chi/N",   # Chi-squared per DOF
    "RA",      # Right Ascension
    "Dec",     # Declination
    "x",       # Pixel x coordinate
    "y",       # Pixel y coordinate
    "maj",     # Major axis
    "min",     # Minor axis  
    "phi",     # Position angle
    "apfit",   # Aperture fit
    "Sky",     # Sky background
    "ZP",      # Zero point
    "Obs"      # Observatory
]

print("Expected columns:")
for i, col in enumerate(expected_columns, 1):
    print(f"{i:2d}. {col}")

print("\nKey columns for light curve plotting:")
print("- ###MJD: Time (Modified Julian Date)")
print("- m: Magnitude") 
print("- dm: Magnitude uncertainty")
print("- F: Filter (o=orange/orange filter, c=cyan/cyan filter)")
print("- uJy/duJy: Flux and flux uncertainty in microJanskys")

print("\nNote: ATLAS filters:")
print("- 'o' filter: ~560nm (orange/green), display in orange")  
print("- 'c' filter: ~460nm (cyan/blue), display in cyan") 