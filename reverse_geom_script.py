import json

FILE_PATH = 'Backend/route_geometries.json'
KEY_TO_REVERSE = 'Route E(N24) : To K9/10'

def fix_geometry():
    try:
        with open(FILE_PATH, 'r') as f:
            data = json.load(f)
        
        if KEY_TO_REVERSE in data:
            print(f"Found key: {KEY_TO_REVERSE}")
            coords = data[KEY_TO_REVERSE]['coordinates']
            reversed_coords = coords[::-1]
            data[KEY_TO_REVERSE]['coordinates'] = reversed_coords
            print("Reversed coordinates.")
            
            with open(FILE_PATH, 'w') as f:
                json.dump(data, f, indent=4)
            print("Successfully saved file.")
        else:
            print(f"Key {KEY_TO_REVERSE} not found!")
            print("Available keys:", list(data.keys()))
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_geometry()
