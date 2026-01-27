#!/usr/bin/env python3
"""
UTM Campus POI Extractor - Using Custom Polygon

This script extracts POIs within the UTM campus using the user-provided
campus boundary polygon from 'utm polygon.geojson'.
"""

import requests
import json
import time
import re
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
POLYGON_FILE = DATA_DIR / "utm polygon.geojson"
OUTPUT_FILE = DATA_DIR / "campus_pois_final.json"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def load_polygon_from_geojson():
    """Load the campus boundary polygon from user's GeoJSON file"""
    print(f"Loading polygon from: {POLYGON_FILE}")
    
    with open(POLYGON_FILE, "r", encoding="utf-8") as f:
        geojson = json.load(f)
    
    # Extract coordinates from the first feature's polygon
    coords = geojson["features"][0]["geometry"]["coordinates"][0]
    
    # Convert from [lon, lat] arrays to (lon, lat) tuples
    polygon = [(point[0], point[1]) for point in coords]
    
    print(f"Loaded polygon with {len(polygon)} vertices")
    return polygon


def point_in_polygon(point, polygon):
    """Ray casting algorithm for point-in-polygon test"""
    x, y = point  # lon, lat
    n = len(polygon)
    inside = False
    
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside


def get_bbox_from_polygon(polygon):
    """Get bounding box from polygon with padding"""
    lons = [p[0] for p in polygon]
    lats = [p[1] for p in polygon]
    padding = 0.002  # Small padding around the polygon
    return f"{min(lats)-padding},{min(lons)-padding},{max(lats)+padding},{max(lons)+padding}"


def extract_pois(bbox):
    """Extract all POIs from the campus bounding box"""
    print(f"Using bounding box: {bbox}")
    
    query = f"""
    [out:json][timeout:180];
    
    (
      // All buildings
      way["building"]({bbox});
      relation["building"]({bbox});
      
      // All amenities (cafes, restaurants, banks, etc.)
      node["amenity"]({bbox});
      way["amenity"]({bbox});
      
      // All shops
      node["shop"]({bbox});
      way["shop"]({bbox});
      
      // Leisure/sports facilities
      node["leisure"]({bbox});
      way["leisure"]({bbox});
      
      // Offices
      node["office"]({bbox});
      way["office"]({bbox});
      
      // Transit (bus stops)
      node["highway"="bus_stop"]({bbox});
      node["public_transport"]({bbox});
      
      // Tourism (info points, attractions)
      node["tourism"]({bbox});
      way["tourism"]({bbox});
      
      // Healthcare
      node["healthcare"]({bbox});
      way["healthcare"]({bbox});
    );
    
    out center tags;
    """
    
    print("Querying Overpass API...")
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=180)
        if response.status_code == 200:
            data = response.json()
            print(f"Retrieved {len(data.get('elements', []))} raw elements")
            return data.get("elements", [])
        else:
            print(f"Error: HTTP {response.status_code}")
            print(response.text[:500])
    except Exception as e:
        print(f"Request failed: {e}")
    
    return []


def categorize_poi(tags, name=""):
    """Categorize POI based on OSM tags and name"""
    building = tags.get("building", "")
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")
    leisure = tags.get("leisure", "")
    name_lower = name.lower()
    
    # RESIDENTIAL / HOSTELS
    if building in ["dormitory", "hostel", "residential"]:
        return "residential"
    if any(x in name_lower for x in ["kolej", "hostel", "asrama", "ktf", "ktr", "ktho", "ktdi", "ktc", "kdse"]):
        return "residential"
    
    # ACADEMIC - Only for actual academic buildings (faculties, lecture halls, etc.)
    if building in ["university", "college", "school", "academic"]:
        return "academic"
    if amenity in ["university", "college", "library"]:
        return "academic"
    if any(x in name_lower for x in ["fakulti", "faculty", "dewan", "lecture", "tutorial"]):
        return "academic"
    
    # LIBRARY
    if amenity == "library" or "perpustakaan" in name_lower or "psz" in name_lower:
        return "library"
    
    # DINING
    if amenity in ["cafe", "restaurant", "fast_food", "food_court"]:
        return "dining"
    if any(x in name_lower for x in ["cafe", "kafe", "arked", "restoran", "kantin", "cafeteria", "mcd", "mcdonald", "burger king", "kfc"]):
        return "dining"
    
    # SHOPPING / CONVENIENCE
    if shop in ["convenience", "supermarket", "general", "kiosk", "mall"]:
        return "shopping"
    if any(x in name_lower for x in ["mart", "kedai", "shop", "store", "7-eleven", "99 speedmart"]):
        return "shopping"
    
    # SPORTS / RECREATION
    if leisure in ["sports_centre", "stadium", "swimming_pool", "pitch", "track", "fitness_centre"]:
        return "sports"
    if any(x in name_lower for x in ["stadium", "gym", "kolam", "pool", "court", "padang", "fitness"]):
        return "sports"
    
    # RELIGIOUS
    if amenity == "place_of_worship":
        return "religious"
    if any(x in name_lower for x in ["masjid", "surau", "mosque", "musolla", "chapel", "temple"]):
        return "religious"
    
    # HEALTHCARE
    if amenity in ["clinic", "hospital", "pharmacy", "doctors"]:
        return "healthcare"
    if any(x in name_lower for x in ["klinik", "clinic", "hospital", "farmasi", "pharmacy", "health"]):
        return "healthcare"
    
    # BANKING
    if amenity in ["bank", "atm"]:
        return "banking"
    if any(x in name_lower for x in ["bank", "atm", "cimb", "maybank", "rhb"]):
        return "banking"
    
    # TRANSIT
    if tags.get("highway") == "bus_stop" or tags.get("public_transport"):
        return "transit"
    
    # ADMINISTRATIVE
    if tags.get("office") or any(x in name_lower for x in ["pejabat", "office", "admin", "canselori", "bursary"]):
        return "administrative"
    
    # PARKING
    if amenity == "parking":
        return "parking"
    
    # DEFAULT
    if building:
        return "building"
    
    return "other"


def process_elements(elements, polygon):
    """Process OSM elements and filter by campus boundary polygon"""
    pois = []
    stats = {"total": 0, "in_campus": 0, "filtered_out": 0}
    
    for elem in elements:
        stats["total"] += 1
        
        # Get coordinates
        lat, lon = None, None
        if elem["type"] == "node":
            lat = elem.get("lat")
            lon = elem.get("lon")
        elif elem["type"] in ["way", "relation"] and "center" in elem:
            lat = elem["center"].get("lat")
            lon = elem["center"].get("lon")
        
        if lat is None or lon is None:
            continue
        
        # Check if within campus polygon
        if not point_in_polygon((lon, lat), polygon):
            stats["filtered_out"] += 1
            continue
        
        stats["in_campus"] += 1
        
        tags = elem.get("tags", {})
        name = tags.get("name", tags.get("name:en", ""))
        category = categorize_poi(tags, name)
        
        # Skip ONLY unnamed parking lots (keep all buildings)
        if category == "parking" and not name:
            continue
        
        # Skip unnamed "other" category items that aren't buildings
        if category == "other" and not name and not tags.get("building"):
            continue
        
        # Create POI object
        poi = {
            "id": f"{elem['type']}_{elem['id']}",
            "osmId": elem["id"],
            "osmType": elem["type"],
            "name": name if name else f"Unnamed {category}",
            "category": category,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
        }
        
        # Add useful tags
        if tags.get("amenity"):
            poi["amenity"] = tags["amenity"]
        if tags.get("building"):
            poi["building"] = tags["building"]
        if tags.get("cuisine"):
            poi["cuisine"] = tags["cuisine"]
        if tags.get("shop"):
            poi["shop"] = tags["shop"]
        if tags.get("leisure"):
            poi["leisure"] = tags["leisure"]
        
        # Generate keywords for search
        poi["keywords"] = generate_keywords(name)
        
        pois.append(poi)
    
    print(f"Stats: {stats}")
    return pois


def generate_keywords(name):
    """Generate search keywords from name"""
    if not name or name.startswith("Unnamed"):
        return []
    
    # Split on spaces and special chars
    words = re.split(r'[\s/,\-()]+', name)
    keywords = [w.lower() for w in words if w and len(w) > 1]
    
    # Add acronym
    if len(words) > 1:
        acronym = ''.join(w[0].lower() for w in words if w)
        if len(acronym) > 1:
            keywords.append(acronym)
    
    return list(set(keywords))


def main():
    print("=" * 70)
    print("UTM Campus POI Extractor - Using Custom Polygon")
    print("=" * 70)
    
    # Step 1: Load polygon
    print("\n[Step 1] Loading campus boundary polygon...")
    try:
        polygon = load_polygon_from_geojson()
    except FileNotFoundError:
        print(f"ERROR: Polygon file not found: {POLYGON_FILE}")
        return
    except Exception as e:
        print(f"ERROR: Failed to load polygon: {e}")
        return
    
    # Step 2: Extract POIs
    print("\n[Step 2] Extracting POIs from OpenStreetMap...")
    bbox = get_bbox_from_polygon(polygon)
    elements = extract_pois(bbox)
    
    if not elements:
        print("ERROR: No elements retrieved. Check your internet connection.")
        return
    
    # Step 3: Process and filter
    print("\n[Step 3] Processing and filtering by campus boundary...")
    pois = process_elements(elements, polygon)
    
    print(f"Final count: {len(pois)} POIs within campus")
    
    # Step 4: Categorize
    print("\n[Step 4] POIs by Category:")
    categories = {}
    for poi in pois:
        cat = poi["category"]
        categories[cat] = categories.get(cat, 0) + 1
    
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    
    # Step 5: Save
    print(f"\n[Step 5] Saving to {OUTPUT_FILE}...")
    output = {
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "extracted_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_pois": len(pois),
            "campus": "Universiti Teknologi Malaysia (UTM) Johor Bahru",
            "boundary_source": str(POLYGON_FILE.name)
        },
        "categories": categories,
        "locations": pois
    }
    
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print("\n" + "=" * 70)
    print("DONE!")
    print("=" * 70)
    print(f"\nOutput: {OUTPUT_FILE}")
    
    # Sample output
    print("\nSample POIs by Category:")
    for cat in ["residential", "academic", "dining", "shopping", "religious"]:
        samples = [p for p in pois if p["category"] == cat][:3]
        if samples:
            print(f"\n{cat.upper()}:")
            for p in samples:
                print(f"  - {p['name']} ({p['lat']}, {p['lon']})")


if __name__ == "__main__":
    main()
