import json
import copy

file_path = r"c:\Users\tabe2\OneDrive\Desktop\UTM move\Backend\schedule.json"

print(f"Processing {file_path}...")

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

count_split = 0
count_filtered = 0

for route in data.get('routes', []):
    # First, handle splitting WEEKDAY services if they contain friday
    services_to_add = []
    
    for service in route.get('services', []):
        if service.get('service_id') == 'WEEKDAY' and 'friday' in service.get('days', []):
            print(f"Splitting Friday from WEEKDAY in route: {route.get('name')}")
            
            # Remove friday from original service
            service['days'] = [d for d in service['days'] if d != 'friday']
            
            # Create new FRIDAY service
            new_friday_service = copy.deepcopy(service)
            new_friday_service['service_id'] = 'FRIDAY'
            new_friday_service['days'] = ['friday']
            services_to_add.append(new_friday_service)
            count_split += 1

    route['services'].extend(services_to_add)

    # Now go through ALL FRIDAY services (newly added and existing) and filter times
    for service in route.get('services', []):
        if service.get('service_id') == 'FRIDAY':
            for trip in service.get('trips', []):
                original_times = trip.get('times', [])
                # Keep times strictly LESS THAN 12:40 OR GREATER THAN OR EQUAL TO 14:00
                # User request: "1240=<times<1400 are removed"
                # So we KEEP: time < "12:40" OR time >= "14:00"
                filtered_times = [t for t in original_times if t < "12:40" or t >= "14:00"]
                
                if len(original_times) != len(filtered_times):
                    removed_count = len(original_times) - len(filtered_times)
                    print(f"  Removed {removed_count} trips from {route.get('name')} (Friday) - {trip.get('headsign')}")
                    trip['times'] = filtered_times
                    count_filtered += 1

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print(f"Done. Split {count_split} services. Filtered times in {count_filtered} trip lists.")
