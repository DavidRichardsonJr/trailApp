# Waypoint Grid — Trail Marker App

View trail markers from a CSV file on a grid, an uploaded image, or OpenStreetMap tiles. Shows distances, highlights gaps between markers, and exports the marker list.

## Run it

Open `index.html` in a browser, then load a CSV (try `sample/torres_trail.csv`).
OpenStreetMap tiles only load when the app is served over `https://` (for example GitHub Pages), not when opened as a local file.

## CSV format

```
id,lat,lon,action
1,26.7304,-80.2506,Paint
```

Optional columns: `group`, `sequence`, `highlightTo` (trail order and highlighted gaps).

## Project layout

```
index.html          the page
css/style.css       styling
js/state.js         shared app state
js/management.js    Management View (action colors and shapes)
js/location.js      device GPS ("my location")
js/helpers.js       small shared helpers
js/csv.js           CSV parsing
js/grid.js          Grid map mode
js/image.js         My Map (uploaded image) mode
js/tiles.js         OSM Tiles mode
js/routing.js       walking-route snapping
js/google.js        Google Maps mode
js/modes.js         switching between map modes
js/render.js        common rendering and gap analysis
js/export.js        downloads (map image, marker CSV)
js/startup.js       runs when the page loads
sample/             example data
```

The script files share one global scope and must load in the order listed in `index.html`.

## Publish on GitHub Pages

Upload the whole folder to a public repo, then Settings → Pages → Deploy from a branch → `main` / root.

Map data © OpenStreetMap contributors. Satellite imagery © Esri.
