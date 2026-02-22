// Utility to silently pre-fetch map tiles for UTM campus so the ServiceWorker caches them
export const precacheMapTiles = async () => {
    // UTM bounding box approx
    const minLat = 1.550;
    const maxLat = 1.575;
    const minLon = 103.625;
    const maxLon = 103.650;

    const zooms = [14, 15, 16]; // Cache these zoom levels

    // Helper to convert lat/lon to tile X/Y
    const lon2tile = (lon, zoom) => (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
    const lat2tile = (lat, zoom) => (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));

    // Check if we've already cached them recently to avoid spamming the network on every refresh
    const CACHE_FLAG = 'utm_tiles_precached_v1';
    const CACHE_TS = localStorage.getItem(CACHE_FLAG);
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    if (CACHE_TS && (Date.now() - parseInt(CACHE_TS, 10) < ONE_WEEK)) {
        return; // Already cached recently
    }

    const urlsToFetch = [];

    zooms.forEach(z => {
        const minX = lon2tile(minLon, z);
        const maxX = lon2tile(maxLon, z);
        // Note: lat2tile returns larger Y for smaller Lat
        const minY = lat2tile(maxLat, z);
        const maxY = lat2tile(minLat, z);

        // Limit the number of tiles to prevent overwhelming the browser
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                // OpenStreetMap generic tile URL
                const domainOptions = ['a', 'b', 'c'];
                const s = domainOptions[(x + y) % 3];
                const url = `https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
                urlsToFetch.push(url);
            }
        }
    });

    // Execute fetches in small batches so we don't block the main thread or hit strict rate limits
    const batchSize = 10;
    for (let i = 0; i < urlsToFetch.length; i += batchSize) {
        const batch = urlsToFetch.slice(i, i + batchSize);
        await Promise.allSettled(
            batch.map(url => fetch(url, { mode: 'no-cors' }).catch(() => { }))
        );
        // tiny delay
        await new Promise(r => setTimeout(r, 100));
    }

    localStorage.setItem(CACHE_FLAG, Date.now().toString());
    console.log(`[UTM Move] Pre-cached ${urlsToFetch.length} map tiles for offline use.`);
};
