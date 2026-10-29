// ---------- ROUTE SNAPPING (OSRM, foot profile) ----------
let routeEnabled = false;
let leafletRouteLine = null;

async function fetchOSRMRoute(pts){
  const chunkSize = 25; // keep each request small and reliable
  let allCoords = [];
  for(let i=0; i<pts.length-1; i+=chunkSize-1){
    const chunk = pts.slice(i, i+chunkSize);
    if(chunk.length<2) break;
    const coordStr = chunk.map(p=>`${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson`;
    try{
      const res = await fetch(url);
      const data = await res.json();
      if(data.code==='Ok' && data.routes && data.routes[0]){
        const segLatLngs = data.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
        if(allCoords.length>0) segLatLngs.shift(); // avoid duplicate joint point
        allCoords = allCoords.concat(segLatLngs);
      } else {
        return {error:'no walking route found near one of the posts'};
      }
    } catch(err){
      return {error:'network request failed (' + err.message + ')'};
    }
  }
  return {coords: allCoords};
}

async function updateRoute(){
  if(!routeEnabled || !leafletMap || posts.length<2) return;
  document.getElementById('route-status').textContent = 'Fetching walking route from OpenStreetMap (OSRM)…';
  const result = await fetchOSRMRoute(posts);
  if(leafletRouteLine){ leafletMap.removeLayer(leafletRouteLine); leafletRouteLine=null; }
  if(result.error){
    document.getElementById('route-status').textContent = 'Could not fetch a route: ' + result.error + '. Showing post-order line instead.';
    return;
  }
  leafletRouteLine = L.polyline(result.coords, {color:THEMES[currentTheme].dark, weight:4, opacity:0.9}).addTo(leafletMap);
  document.getElementById('route-status').textContent = 'Solid dark line = real routed path. Dashed orange = straight post order.';
}

document.getElementById('route-toggle').addEventListener('change', (e)=>{
  routeEnabled = e.target.checked;
  if(routeEnabled){
    updateRoute();
  } else {
    if(leafletRouteLine){ leafletMap.removeLayer(leafletRouteLine); leafletRouteLine=null; }
    document.getElementById('route-status').textContent = '';
  }
});

document.getElementById('mgmt-toggle').addEventListener('change', (e)=>{
  managementView = e.target.checked;
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles') renderTiles();
  if(mapMode==='image') renderImageMarkers();
  if(mapMode==='google') renderGoogle();
});

document.getElementById('marker-size-toggle').addEventListener('change', (e)=>{
  markerLarge = e.target.checked;
  document.body.classList.toggle('markers-large', markerLarge);
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles') renderTiles();
  if(mapMode==='image') renderImageMarkers();
  if(mapMode==='google') renderGoogle();
});

