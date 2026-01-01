import json
from collections import OrderedDict

file_path = r"c:\Users\tabe2\OneDrive\Desktop\UTM move\Backend\schedule.json"

print(f"Processing {file_path}...")

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

count = 0
for route in data.get('routes', []):
    for service in route.get('services', []):
        for trip in service.get('trips', []):
            times = trip.get('times', [])
            # Use OrderedDict to remove duplicates while preserving order
            deduped_times = list(OrderedDict.fromkeys(times))
            
            if len(times) != len(deduped_times):
                print(f"cleaned {len(times) - len(deduped_times)} duplicates from {route.get('name')} - {trip.get('headsign')}")
                trip['times'] = deduped_times
                count += 1

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print(f"Done. Modified {count} trip time arrays.")
