#!/usr/bin/env python3
import sys
import json
import requests
from alerce.core import Alerce
from antares_client.search import get_by_ztf_object_id, get_by_id, cone_search
from astropy.coordinates import SkyCoord, Angle
import astropy.units as u

def is_ztf_id(name):
    """Check if a name appears to be a ZTF ID."""
    return name and (name.startswith('ZTF') or name.startswith('ztf'))

def query_alerce(ra=None, dec=None, ztf_id=None):
    try:
        alerce_client = Alerce()
        # Always try name/ID search if provided
        if ztf_id:
            try:
                print(f"ALeRCE: Attempting direct ID query for {ztf_id}", file=sys.stderr)
                result = alerce_client.query_objects(oid=[ztf_id], format="json")
                if result and len(result) > 0:
                    print(f"ALeRCE: Found object by ID {ztf_id}", file=sys.stderr)
                    return {"success": True, "data": result if isinstance(result, list) else [result]}
                print(f"ALeRCE: No results for ID {ztf_id}", file=sys.stderr)
            except Exception as e:
                print(f"ALeRCE: ID query failed: {str(e)}", file=sys.stderr)
        # If name/ID search failed or wasn't possible, try coordinates
        if ra is not None and dec is not None and ra != '' and dec != '':
            try:
                print(f"ALeRCE: Attempting coordinate search at RA={ra}, Dec={dec}", file=sys.stderr)
                result = alerce_client.query_objects(
                    ra=float(ra),
                    dec=float(dec),
                    radius=3/3600.0,  # 3 arcsec in degrees
                    format="json"
                )
                if result and len(result) > 0:
                    print(f"ALeRCE: Found {len(result)} objects by coordinates", file=sys.stderr)
                    return {"success": True, "data": result if isinstance(result, list) else [result]}
                print("ALeRCE: No results from coordinate search", file=sys.stderr)
            except Exception as e:
                print(f"ALeRCE: Coordinate query failed: {str(e)}", file=sys.stderr)
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "No valid search criteria provided or no results found"}
    except Exception as e:
        print(f"ALeRCE: Query error: {str(e)}", file=sys.stderr)
        return {"success": False, "error": str(e)}

def query_antares(ra=None, dec=None, ztf_id=None):
    try:
        # Always try name/ID search if provided
        if ztf_id:
            try:
                print(f"Antares: Attempting direct ID query for {ztf_id}", file=sys.stderr)
                result = get_by_ztf_object_id(ztf_id)
                if result:
                    print(f"Antares: Found object by ID {ztf_id}", file=sys.stderr)
                    return {"success": True, "data": {
                        "locus_id": result.locus_id,
                        "ra": result.ra,
                        "dec": result.dec,
                        "properties": result.properties,
                        "tags": result.tags
                    }}
                print(f"Antares: No results for ID {ztf_id}", file=sys.stderr)
            except Exception as e:
                print(f"Antares: ID query failed: {str(e)}", file=sys.stderr)
        # If name/ID search failed or wasn't possible, try coordinates
        if ra is not None and dec is not None and ra != '' and dec != '':
            try:
                print(f"Antares: Attempting coordinate search at RA={ra}, Dec={dec}", file=sys.stderr)
                # RA and Dec are already in decimal degrees
                center = SkyCoord(ra=float(ra)*u.deg, dec=float(dec)*u.deg)
                radius = Angle("3s")  # 3 arcsec
                results = [result for result in cone_search(center, radius)]
                if results:
                    print(f"Antares: Found {len(results)} objects by coordinates", file=sys.stderr)
                    formatted_results = []
                    for result in results:
                        formatted_results.append({
                            "locus_id": result.locus_id,
                            "ra": result.ra,
                            "dec": result.dec,
                            "properties": result.properties,
                            "tags": result.tags
                        })
                    return {"success": True, "data": formatted_results}
                print("Antares: No results from coordinate search", file=sys.stderr)
                return {"success": True, "data": []}
            except Exception as e:
                print(f"Antares: Coordinate query failed: {str(e)}", file=sys.stderr)
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "No valid search criteria provided or no results found"}
    except Exception as e:
        print(f"Antares: Query error: {str(e)}", file=sys.stderr)
        return {"success": False, "error": str(e)}

def get_alerce_lightcurve(ztf_id):
    try:
        alerce_client = Alerce()
        detections_raw = alerce_client.query_detections(oid=ztf_id, format="json")
        non_detections_raw = alerce_client.query_non_detections(oid=ztf_id, format="json")
        # Format detections
        detections = []
        for d in detections_raw:
            detections.append({
                "mjd": d.get("mjd"),
                "mag": d.get("magpsf"),
                "e_mag": d.get("sigmapsf"),
                "fid": d.get("fid")
            })
        non_detections = []
        for nd in non_detections_raw:
            non_detections.append({
                "mjd": nd.get("mjd"),
                "diffmaglim": nd.get("diffmaglim"),
                "fid": nd.get("fid")
            })
        result = {
            "detections": detections,
            "non_detections": non_detections
        }
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_alerce_crossmatch(ra=None, dec=None, radius=20):
    """Query ALeRCE crossmatch API for catalog cross-matches."""
    try:
        alerce_client = Alerce()
        
        # Validate coordinates
        if ra is None or dec is None:
            return {"success": False, "error": "RA and Dec coordinates are required"}
        
        print(f"ALeRCE Crossmatch: Querying RA={ra}, Dec={dec}, radius={radius} arcsec", file=sys.stderr)
        
        # Query crossmatch for all catalogs
        crossmatch_data = alerce_client.catshtm_crossmatch(
            ra=float(ra),
            dec=float(dec),
            radius=float(radius),
            catalog_name='all',
            format='pandas'
        )
        
        # Convert pandas DataFrames to serializable dictionaries
        result = {}
        if crossmatch_data:
            for catalog_name, df in crossmatch_data.items():
                if df is not None and not df.empty:
                    # Convert to dict and clean up data types
                    if hasattr(df, 'to_frame'):
                        # Handle pandas Series (1D)
                        catalog_dict = df.to_dict()
                    else:
                        # Handle pandas DataFrame (2D)
                        catalog_dict = df.to_dict(orient='records')[0] if len(df) > 0 else {}
                    
                    # Clean the data for JSON serialization
                    cleaned_catalog = {}
                    for key, value in catalog_dict.items():
                        if value is not None and str(value) != 'nan' and str(value) != 'None':
                            try:
                                # Convert various types to JSON-serializable formats
                                if hasattr(value, 'item'):
                                    # Handle numpy types
                                    value = value.item()
                                elif hasattr(value, 'dtype'):
                                    # Handle pandas/numpy types
                                    if 'int' in str(value.dtype):
                                        value = int(value)
                                    elif 'float' in str(value.dtype):
                                        value = float(value)
                                    else:
                                        value = str(value)
                                elif isinstance(value, (int, float, bool)):
                                    # Keep native Python types as-is
                                    pass
                                else:
                                    # Convert everything else to string
                                    value = str(value)
                                
                                # Final check for valid values
                                if str(value) not in ['nan', 'None', '']:
                                    cleaned_catalog[key] = value
                                    
                            except Exception as e:
                                print(f"ALeRCE Crossmatch: Skipping key {key} due to conversion error: {e}", file=sys.stderr)
                                continue
                    
                    if cleaned_catalog:  # Only include non-empty matches
                        result[catalog_name] = cleaned_catalog
                        print(f"ALeRCE Crossmatch: Found match in {catalog_name} with {len(cleaned_catalog)} attributes", file=sys.stderr)
        
        print(f"ALeRCE Crossmatch: Found matches in {len(result)} catalogs total", file=sys.stderr)
        
        return {"success": True, "data": result}
        
    except Exception as e:
        print(f"ALeRCE Crossmatch error: {str(e)}", file=sys.stderr)
        return {"success": False, "error": str(e)}

def query_fink(ra=None, dec=None, ztf_id=None):
    """Query Fink broker for object data."""
    try:
        # Fink primarily works with ZTF object IDs
        if ztf_id and is_ztf_id(ztf_id):
            try:
                print(f"Fink: Attempting query for ZTF ID {ztf_id}", file=sys.stderr)
                
                # Query Fink API
                response = requests.post(
                    "https://api.fink-portal.org/api/v1/objects",
                    json={
                        "objectId": ztf_id,
                        "output-format": "json",
                        "columns": "i:jd,i:magpsf,i:sigmapsf,i:fid,i:ra,i:dec,d:cdsxmatch,d:roid,d:mulens,d:snn_snia_vs_nonia,d:snn_sn_vs_all,d:rf_snia_vs_nonia,d:tag"
                    },
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        print(f"Fink: Found {len(data)} alerts for {ztf_id}", file=sys.stderr)
                        
                        # Process and summarize the data
                        summary = {
                            "objectId": ztf_id,
                            "num_alerts": len(data),
                            "first_detection": min(data, key=lambda x: x.get('i:jd', float('inf'))),
                            "latest_detection": max(data, key=lambda x: x.get('i:jd', 0)),
                            "classifications": {},
                            "photometry_summary": {}
                        }
                        
                        # Extract classifications
                        for alert in data:
                            if alert.get('d:cdsxmatch'):
                                summary['classifications']['cdsxmatch'] = alert['d:cdsxmatch']
                            if alert.get('d:snn_snia_vs_nonia') is not None:
                                summary['classifications']['snn_snia_vs_nonia'] = alert['d:snn_snia_vs_nonia']
                            if alert.get('d:rf_snia_vs_nonia') is not None:
                                summary['classifications']['rf_snia_vs_nonia'] = alert['d:rf_snia_vs_nonia']
                        
                        # Photometry summary
                        valid_photometry = [a for a in data if a.get('d:tag') == 'valid' and a.get('i:magpsf')]
                        if valid_photometry:
                            mags = [a['i:magpsf'] for a in valid_photometry]
                            summary['photometry_summary'] = {
                                'num_valid_detections': len(valid_photometry),
                                'brightest_mag': min(mags),
                                'faintest_mag': max(mags),
                                'mean_mag': sum(mags) / len(mags)
                            }
                        else:
                            # If no 'd:tag' == 'valid', use all data with magnitudes
                            all_photometry = [a for a in data if a.get('i:magpsf')]
                            if all_photometry:
                                mags = [a['i:magpsf'] for a in all_photometry]
                                summary['photometry_summary'] = {
                                    'num_valid_detections': len(all_photometry),
                                    'brightest_mag': min(mags),
                                    'faintest_mag': max(mags),
                                    'mean_mag': sum(mags) / len(mags)
                                }
                        
                        return {"success": True, "data": {"summary": summary, "full_data": data}}
                    else:
                        print(f"Fink: No data found for {ztf_id}", file=sys.stderr)
                        return {"success": True, "data": []}
                else:
                    print(f"Fink: HTTP {response.status_code} for {ztf_id}", file=sys.stderr)
                    return {"success": False, "error": f"HTTP {response.status_code}"}
                    
            except requests.exceptions.Timeout:
                print(f"Fink: Timeout querying {ztf_id}", file=sys.stderr)
                return {"success": False, "error": "Request timeout"}
            except Exception as e:
                print(f"Fink: Query failed for {ztf_id}: {str(e)}", file=sys.stderr)
                return {"success": False, "error": str(e)}
        else:
            print(f"Fink: No valid ZTF ID provided (got: {ztf_id})", file=sys.stderr)
            return {"success": False, "error": "Fink requires a valid ZTF object ID"}
            
    except Exception as e:
        print(f"Fink: General error: {str(e)}", file=sys.stderr)
        return {"success": False, "error": str(e)}

def query_lasair(ra=None, dec=None, ztf_id=None, api_token=None):
    """Query Lasair broker for object data."""
    try:
        base_url = "https://lasair-ztf.lsst.ac.uk/api"
        
        # Set up headers with API token if provided
        headers = {}
        if api_token:
            headers['Authorization'] = f'Token {api_token}'
            print(f"Lasair: Using API token for authentication", file=sys.stderr)
        else:
            print(f"Lasair: No API token provided - some queries may fail", file=sys.stderr)
        
        # Try object query first if we have a ZTF ID
        if ztf_id and is_ztf_id(ztf_id):
            try:
                print(f"Lasair: Attempting object query for ZTF ID {ztf_id}", file=sys.stderr)
                
                # Query specific object
                response = requests.get(
                    f"{base_url}/object/",
                    params={
                        "objectId": ztf_id,
                        "format": "json"
                    },
                    headers=headers,
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data and data.get('objectId'):
                        print(f"Lasair: Found object data for {ztf_id}", file=sys.stderr)
                        
                        # Get rich Sherlock and annotator data using SQL queries
                        try:
                            # Query sherlock_classifications table for detailed contextual data
                            sherlock_response = requests.get(
                                f"{base_url}/query/",
                                params={
                                    "selected": f"sherlock_classifications.objectId,sherlock_classifications.classification,sherlock_classifications.association_type,sherlock_classifications.catalogue_table_name,sherlock_classifications.catalogue_object_id,sherlock_classifications.catalogue_object_type,sherlock_classifications.separationArcsec,sherlock_classifications.northSeparationArcsec,sherlock_classifications.eastSeparationArcsec,sherlock_classifications.physical_separation_kpc,sherlock_classifications.direct_distance,sherlock_classifications.distance,sherlock_classifications.z,sherlock_classifications.photoZ,sherlock_classifications.photoZErr,sherlock_classifications.Mag,sherlock_classifications.MagFilter,sherlock_classifications.MagErr,sherlock_classifications.classificationReliability,sherlock_classifications.major_axis_arcsec,sherlock_classifications.description,sherlock_classifications.summary",
                                    "tables": "sherlock_classifications",
                                    "conditions": f"sherlock_classifications.objectId='{ztf_id}'",
                                    "format": "json"
                                },
                                headers=headers,
                                timeout=15
                            )
                            
                            if sherlock_response.status_code == 200:
                                sherlock_data = sherlock_response.json()
                                if sherlock_data and len(sherlock_data) > 0:
                                    data['sherlock_classifications'] = sherlock_data
                                    print(f"Lasair: Added detailed Sherlock classifications for {ztf_id}", file=sys.stderr)
                                else:
                                    print(f"Lasair: No sherlock_classifications data found for {ztf_id}", file=sys.stderr)
                            else:
                                print(f"Lasair: Sherlock classifications query HTTP {sherlock_response.status_code}", file=sys.stderr)
                            
                            # Note: Annotator table access seems to require special format, skipping for now
                            
                            # Also get the original Sherlock data for compatibility
                            sherlock_response = requests.get(
                                f"{base_url}/sherlock/object/",
                                params={
                                    "objectId": ztf_id,
                                    "format": "json"
                                },
                                headers=headers,
                                timeout=15
                            )
                            if sherlock_response.status_code == 200:
                                sherlock_legacy = sherlock_response.json()
                                data['sherlock'] = sherlock_legacy
                                print(f"Lasair: Added legacy Sherlock data for {ztf_id}", file=sys.stderr)
                                
                        except Exception as e:
                            print(f"Lasair: Enhanced data query failed: {str(e)}", file=sys.stderr)
                        
                        return {"success": True, "data": data}
                    else:
                        print(f"Lasair: No object data found for {ztf_id}", file=sys.stderr)
                elif response.status_code == 401:
                    print(f"Lasair: Authentication required (HTTP 401)", file=sys.stderr)
                    return {"success": False, "error": "Authentication required. Lasair API requires a token for most queries. Please visit https://lasair-ztf.lsst.ac.uk/ to get an API token."}
                else:
                    print(f"Lasair: Object query HTTP {response.status_code} for {ztf_id}", file=sys.stderr)
                    
            except requests.exceptions.Timeout:
                print(f"Lasair: Object query timeout for {ztf_id}", file=sys.stderr)
            except Exception as e:
                print(f"Lasair: Object query failed for {ztf_id}: {str(e)}", file=sys.stderr)
        
        # If object query failed or no ZTF ID, try cone search
        if ra is not None and dec is not None and ra != '' and dec != '':
            try:
                print(f"Lasair: Attempting cone search at RA={ra}, Dec={dec}", file=sys.stderr)
                
                response = requests.get(
                    f"{base_url}/cone/",
                    params={
                        "ra": float(ra),
                        "dec": float(dec),
                        "radius": 3.0,  # 3 arcseconds
                        "requestType": "all",
                        "format": "json"
                    },
                    headers=headers,
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        print(f"Lasair: Found {len(data)} objects by cone search", file=sys.stderr)
                        
                        # For each object found, try to get detailed information
                        detailed_objects = []
                        for obj in data[:3]:  # Limit to first 3 objects to avoid too many requests
                            try:
                                obj_id = obj.get('object')
                                if obj_id:
                                    obj_response = requests.get(
                                        f"{base_url}/object/",
                                        params={
                                            "objectId": obj_id,
                                            "format": "json"
                                        },
                                        headers=headers,
                                        timeout=5
                                    )
                                    if obj_response.status_code == 200:
                                        obj_data = obj_response.json()
                                        obj_data['separation'] = obj.get('separation')
                                        detailed_objects.append(obj_data)
                            except Exception as e:
                                print(f"Lasair: Failed to get details for {obj.get('object')}: {str(e)}", file=sys.stderr)
                                # Add basic info if detailed query fails
                                detailed_objects.append(obj)
                        
                        return {"success": True, "data": detailed_objects if detailed_objects else data}
                    else:
                        print("Lasair: No objects found by cone search", file=sys.stderr)
                        return {"success": True, "data": []}
                elif response.status_code == 401:
                    print(f"Lasair: Authentication required for cone search (HTTP 401)", file=sys.stderr)
                    return {"success": False, "error": "Authentication required. Lasair API requires a token for cone searches. Please visit https://lasair-ztf.lsst.ac.uk/ to get an API token."}
                else:
                    print(f"Lasair: Cone search HTTP {response.status_code}", file=sys.stderr)
                    return {"success": False, "error": f"HTTP {response.status_code}"}
                    
            except requests.exceptions.Timeout:
                print(f"Lasair: Cone search timeout", file=sys.stderr)
                return {"success": False, "error": "Request timeout"}
            except Exception as e:
                print(f"Lasair: Cone search failed: {str(e)}", file=sys.stderr)
                return {"success": False, "error": str(e)}
        
        return {"success": False, "error": "No valid search criteria provided or no results found"}
        
    except Exception as e:
        print(f"Lasair: General error: {str(e)}", file=sys.stderr)
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    args = json.loads(sys.argv[1])
    mode = args.get('mode', 'default')
    broker = args.get('broker')
    ra = args.get('ra')
    dec = args.get('dec')
    ztf_id = args.get('ztf_id')
    api_token = args.get('api_token')
    radius = args.get('radius', 20)
    
    if mode == 'lightcurve' and ztf_id:
        result = get_alerce_lightcurve(ztf_id)
    elif mode == 'crossmatch':
        result = get_alerce_crossmatch(ra, dec, radius)
    elif broker == 'alerce':
        result = query_alerce(ra, dec, ztf_id)
    elif broker == 'antares':
        result = query_antares(ra, dec, ztf_id)
    elif broker == 'fink':
        result = query_fink(ra, dec, ztf_id)
    elif broker == 'lasair':
        result = query_lasair(ra, dec, ztf_id, api_token)
    else:
        result = {"success": False, "error": f"Unknown broker: {broker}"}
    print(json.dumps(result)) 