import json

file_path = r"c:\Users\tabe2\OneDrive\Desktop\UTM move\Backend\schedule.json"

print(f"Reverting changes in {file_path}...")

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

count_merged = 0
count_removed = 0

for route in data.get('routes', []):
    services = route.get('services', [])
    
    # Check if we have a WEEKDAY service and a FRIDAY service
    weekday_service = next((s for s in services if s.get('service_id') == 'WEEKDAY'), None)
    friday_service = next((s for s in services if s.get('service_id') == 'FRIDAY'), None)
    
    if weekday_service:
        # If Friday is missing from Weekday, add it back
        if 'friday' not in weekday_service.get('days', []):
            weekday_service['days'].append('friday')
            print(f"Added 'friday' back to WEEKDAY in route: {route.get('name')}")
            count_merged += 1
    
    # Remove FRIDAY service if it exists
    if friday_service:
        route['services'] = [s for s in services if s.get('service_id') != 'FRIDAY']
        print(f"Removed FRIDAY service from route: {route.get('name')}")
        count_removed += 1

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print(f"Done. Merged {count_merged} services. Removed {count_removed} services.")
