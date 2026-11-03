"""Downloads the data, library and font files shipped with the site."""
import json
import math
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
MAPLIBRE = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.23.0/dist/"
FONTS = "https://fonts.googleapis.com/css2?family=Bowlby+One&family=Barlow:wght@400;600;800&family=Shantell+Sans:wght@500&display=swap"
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
DEM_ZOOM = 11

# Keep centers in sync with js/data.js, which derives the same tile indexes.
RESORTS = {
    "alpe": {"center": (45.11, 6.09), "bbox": (45.04, 5.98, 45.16, 6.18)},
    "thorens": {"center": (45.30, 6.58), "bbox": (45.24, 6.46, 45.42, 6.68)},
    "cervinia": {"center": (45.93, 7.65), "bbox": (45.85, 7.58, 46.03, 7.79)},
}


def get(url, data=None):
    # Only Google Fonts needs a browser user agent, to serve woff2.
    agent = BROWSER_UA if "googleapis" in url else "ski-trip-app/1.0 (personal trip planner)"
    req = urllib.request.Request(url, data=data, headers={"User-Agent": agent, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=90) as res:
        return res.read()


def missing(rel):
    return not (ROOT / rel).exists()


def save(rel, content):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    print(f"{rel} {len(content) // 1024} KB")


def tile_index(lat, lon):
    n = 2 ** DEM_ZOOM
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def fetch_dem(name, center):
    cx, cy = tile_index(*center)
    for x in range(cx - 1, cx + 2):
        for y in range(cy - 1, cy + 2):
            rel = f"data/dem/{name}/{x}_{y}.png"
            if missing(rel):
                save(rel, get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{DEM_ZOOM}/{x}/{y}.png"))


def fetch_pistes(name, bbox):
    query = f'[out:json][timeout:120];way["piste:type"="downhill"]{bbox};out geom;'
    body = urllib.parse.urlencode({"data": query}).encode()
    for server in OVERPASS * 3:
        try:
            raw = get(server, body)
            break
        except OSError as error:
            print(f"{server}: {error}")
            time.sleep(10)
    else:
        raise RuntimeError(f"Overpass unavailable for {name}")
    features = []
    for way in json.loads(raw)["elements"]:
        coords = [[round(p["lon"], 4), round(p["lat"], 4)] for p in way.get("geometry", [])]
        if len(coords) > 1:
            features.append({
                "type": "Feature",
                "properties": {"d": way["tags"].get("piste:difficulty", "")},
                "geometry": {"type": "LineString", "coordinates": coords},
            })
    collection = {"type": "FeatureCollection", "features": features}
    save(f"data/pistes-{name}.geojson", json.dumps(collection, separators=(",", ":")).encode())


def fetch_fonts():
    css = get(FONTS).decode()
    kept = []
    for comment, block in re.findall(r"/\* ([\w-]+) \*/\s*(@font-face \{.*?\})", css, re.S):
        if comment != "latin":
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        family = re.search(r"font-family: '([^']+)'", block).group(1).replace(" ", "")
        weight = re.search(r"font-weight: (\d+)", block).group(1)
        rel = f"fonts/{family}-{weight}.woff2"
        save(rel, get(url))
        kept.append(block.replace(url, f"../{rel}"))
    save("css/fonts.css", "\n".join(kept).encode())


def main():
    for file in ("maplibre-gl.js", "maplibre-gl-csp-worker.js", "maplibre-gl.css"):
        save(f"vendor/{file}", get(MAPLIBRE + file))
    fetch_fonts()
    for name, resort in RESORTS.items():
        fetch_dem(name, resort["center"])
    for name, resort in RESORTS.items():
        if missing(f"data/pistes-{name}.geojson"):
            fetch_pistes(name, resort["bbox"])
            time.sleep(5)  # Overpass rate limit


if __name__ == "__main__":
    main()
