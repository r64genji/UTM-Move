# Your own GPS walks

Drop `.gpx` files here (one or more `<trk>` with timestamped `<trkpt>`), then run `npm run gps:shortcuts`.
Each file counts as a separate track in the evidence (`gpx-<file name>`), next to the public OSM traces.
Only stretches at walking speed (2-8 km/h) are used, so a walk with a bus ride in it is fine.
Untimed points are ignored.
