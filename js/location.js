// ---------- MY LOCATION (device GPS cross-check) ----------
let myLocation = null; // {lat, lon, accuracy}
let watchId = null;
let leafletLocMarker=null, leafletLocCircle=null;
let googleLocMarker=null, googleLocCircle=null;
const LOC_COLOR = '#2979FF';

function toggleLocation(){
  if(watchId){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    myLocation = null;
    document.getElementById('loc-toggle').textContent = 'Show my location';
    document.getElementById('loc-status').textContent = "Uses your phone/browser's GPS as a cross-check — your posts remain the primary reference.";
    document.getElementById('loc-nearest').textContent = '';
    clearLocationMarkers();
    updateFromMeBearing();
    return;
  }
  if(!navigator.geolocation){
    document.getElementById('loc-status').textContent = 'Geolocation is not supported in this browser.';
    return;
  }
  document.getElementById('loc-status').textContent = 'Requesting location permission…';
  watchId = navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, {enableHighAccuracy:true, maximumAge:5000, timeout:15000});
  document.getElementById('loc-toggle').textContent = 'Stop sharing location';
}
document.getElementById('loc-toggle').addEventListener('click', toggleLocation);

function onLocationError(err){
  document.getElementById('loc-status').textContent = 'Could not get location: ' + err.message + ' (if this app is hosted online, it needs to be served over HTTPS).';
}

function simulateLocationAtPost(id){
  const p = posts.find(x=>x.id===id);
  if(!p) return;
  if(watchId){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    document.getElementById('loc-toggle').textContent = 'Show my location';
  }
  myLocation = { lat:p.lat, lon:p.lon, accuracy:5, simulated:true };
  document.getElementById('loc-status').innerHTML = `<b>Simulated</b> — standing at Post ${p.id} (not real GPS, for planning/demo).`;
  updateNearestPost();
  renderMyLocation();
  updateFromMeBearing();
}

function clearLocation(){
  if(watchId){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  myLocation = null;
  document.getElementById('loc-toggle').textContent = 'Show my location';
  document.getElementById('loc-status').textContent = "Uses your phone/browser's GPS as a cross-check — your posts remain the primary reference.";
  document.getElementById('loc-nearest').innerHTML = '';
  document.getElementById('sim-post-select').value = '';
  clearLocationMarkers();
  updateFromMeBearing();
}

document.getElementById('simulate-btn').addEventListener('click', ()=>{
  const id = document.getElementById('sim-post-select').value;
  if(!id){ document.getElementById('loc-status').textContent = 'Pick a post from the dropdown first.'; return; }
  simulateLocationAtPost(id);
});
document.getElementById('clear-sim-btn').addEventListener('click', clearLocation);

function onLocationUpdate(pos){
  myLocation = {lat:pos.coords.latitude, lon:pos.coords.longitude, accuracy:pos.coords.accuracy};
  document.getElementById('loc-status').textContent = 'Location active (±' + fmtDist(myLocation.accuracy) + ' accuracy).';
  updateNearestPost();
  renderMyLocation();
  updateFromMeBearing();
}

function updateNearestPost(){
  const el = document.getElementById('loc-nearest');
  if(!myLocation || posts.length===0){ el.innerHTML=''; return; }
  let bestIdx=-1, bestDist=Infinity;
  posts.forEach((p,i)=>{
    const d = haversine(myLocation, p);
    if(d<bestDist){ bestDist=d; bestIdx=i; }
  });
  const best = posts[bestIdx];
  const prev = bestIdx>0 ? posts[bestIdx-1] : null;
  const next = bestIdx<posts.length-1 ? posts[bestIdx+1] : null;
  let html = `<div>Nearest post: <b>#${best.id}</b> — ${fmtDist(bestDist)} away</div>`;
  if(prev){
    const d = haversine(myLocation, prev), b = bearing(myLocation, prev);
    html += `<div style="margin-top:4px;font-weight:400;">← Post ${prev.id}: ${fmtDist(d)}, head ${fmtBearing(b)}</div>`;
  }
  if(next){
    const d = haversine(myLocation, next), b = bearing(myLocation, next);
    html += `<div style="margin-top:2px;font-weight:400;">→ Post ${next.id}: ${fmtDist(d)}, head ${fmtBearing(b)}</div>`;
  }
  el.innerHTML = html;
}

function clearLocationMarkers(){
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles'){
    if(leafletLocMarker && leafletMap){ leafletMap.removeLayer(leafletLocMarker); leafletLocMarker=null; }
    if(leafletLocCircle && leafletMap){ leafletMap.removeLayer(leafletLocCircle); leafletLocCircle=null; }
  }
  if(mapMode==='google'){
    if(googleLocMarker){ googleLocMarker.setMap(null); googleLocMarker=null; }
    if(googleLocCircle){ googleLocCircle.setMap(null); googleLocCircle=null; }
  }
  if(mapMode==='image'){
    const el = document.getElementById('my-loc-marker');
    if(el) el.remove();
  }
}

function renderMyLocation(){
  if(!myLocation) return;
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles') renderTilesLocation();
  if(mapMode==='google') renderGoogleLocation();
  if(mapMode==='image') renderImageLocation();
}

function renderTilesLocation(){
  if(!leafletMap || !myLocation) return;
  if(leafletLocMarker) leafletMap.removeLayer(leafletLocMarker);
  if(leafletLocCircle) leafletMap.removeLayer(leafletLocCircle);
  leafletLocCircle = L.circle([myLocation.lat,myLocation.lon], {radius:myLocation.accuracy, color:LOC_COLOR, fillColor:LOC_COLOR, fillOpacity:0.15, weight:1}).addTo(leafletMap);
  leafletLocMarker = L.circleMarker([myLocation.lat,myLocation.lon], {radius:7, color:'#fff', weight:2, fillColor:LOC_COLOR, fillOpacity:1}).addTo(leafletMap);
}

function renderGoogleLocation(){
  if(!googleMap || !myLocation) return;
  if(googleLocMarker) googleLocMarker.setMap(null);
  if(googleLocCircle) googleLocCircle.setMap(null);
  googleLocMarker = new google.maps.Marker({
    position:{lat:myLocation.lat, lng:myLocation.lon}, map:googleMap, zIndex:999,
    icon:{ path: google.maps.SymbolPath.CIRCLE, scale:7, fillColor:LOC_COLOR, fillOpacity:1, strokeColor:'#fff', strokeWeight:2 }
  });
  googleLocCircle = new google.maps.Circle({
    center:{lat:myLocation.lat, lng:myLocation.lon}, radius:myLocation.accuracy, map:googleMap,
    fillColor:LOC_COLOR, fillOpacity:0.15, strokeColor:LOC_COLOR, strokeWeight:1
  });
}

function renderImageLocation(){
  const old = document.getElementById('my-loc-marker');
  if(old) old.remove();
  if(!myLocation || !calib.p1 || !calib.p2) return;
  const xPercent = calib.p1.xPercent + (myLocation.lon-calib.p1.lon)*(calib.p2.xPercent-calib.p1.xPercent)/(calib.p2.lon-calib.p1.lon);
  const yPercent = calib.p1.yPercent + (myLocation.lat-calib.p1.lat)*(calib.p2.yPercent-calib.p1.yPercent)/(calib.p2.lat-calib.p1.lat);
  const layer = document.getElementById('image-markers');
  const dot = document.createElement('div');
  dot.id = 'my-loc-marker';
  dot.style.position='absolute';
  dot.style.left=xPercent+'%';
  dot.style.top=yPercent+'%';
  dot.style.transform='translate(-50%,-50%)';
  dot.style.width='16px'; dot.style.height='16px'; dot.style.borderRadius='50%';
  dot.style.background=LOC_COLOR; dot.style.border='2px solid white';
  dot.style.boxShadow='0 0 0 6px rgba(41,121,255,0.25)';
  dot.style.pointerEvents='none';
  layer.appendChild(dot);
}

