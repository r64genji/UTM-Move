import json
import re

def validate_schedule(file_path):
    print(f"Validating {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"FATAL: Invalid JSON format: {e}")
        return

    stops = {s['id'] for s in data.get('stops', [])}
    print(f"Found {len(stops)} stops definitions.")
    
    routes = data.get('routes', [])
    print(f"Found {len(routes)} routes.")
    
    issues = []
    
    stop_ids_seen = set()
    for s in data.get('stops', []):
        if s['id'] in stop_ids_seen:
            issues.append(f"Duplicate stop ID definition: {s['id']}")
        stop_ids_seen.add(s['id'])

    for route in routes:
        route_name = route.get('name', 'Unknown Route')
        for service in route.get('services', []):
            service_id = service.get('service_id', 'Unknown Service')
            for trip in service.get('trips', []):
                headsign = trip.get('headsign', 'Unknown Headsign')
                sequence = trip.get('stops_sequence', [])
                times = trip.get('times', [])
                
                # Check for stop validity
                for stop_id in sequence:
                    if stop_id not in stops:
                        issues.append(f"Route '{route_name}' Trip '{headsign}': Stop ID '{stop_id}' not found in stops list.")
                
                # Check time format
                for time in times:
                    if not re.match(r'^\d{2}:\d{2}$', time):
                        issues.append(f"Route '{route_name}' Trip '{headsign}': Invalid time format '{time}'.")
                
                # Check sorted times (optional but usually expected for trip start times list)
                # Actually, strictly strictly speaking, they should be sorted if they represent a list of departure times for a frequency-based schedule.
                # If they are just "available times", they should also be sorted for readability.
                if times != sorted(times):
                     issues.append(f"Route '{route_name}' Trip '{headsign}': Times are not sorted chronologically.")

    if issues:
        print("\nISSUES FOUND:")
        for issue in issues:
            print(f"- {issue}")
    else:
        print("\nNo structural issues found.")

if __name__ == "__main__":
    validate_schedule(r"c:\Users\tabe2\OneDrive\Desktop\UTM move\Backend\schedule.json")
