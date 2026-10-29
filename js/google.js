// ---------- GOOGLE MAPS MODE ----------
let googleMap = null;
let googleMarkers = {};
let googleLine = null;
let googleScriptLoading = false;
let googleReady = false;

function pinIconSvg(color, shape){
  let svg;
  if(shape==='square'){
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 26 26">
      <rect x="1" y="1" width="24" height="24" rx="3" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  } else if(shape==='circle'){
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 26 26">
      <circle cx="13" cy="13" r="12" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  } else if(shape==='cross'){
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 26 26">
      <polygon points="${crossPoints(13,13,12,4.8)}" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  } else if(shape==='triangle'){
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 26 26">
      <polygon points="13,1 25,24 1,24" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  } else if(shape==='diamond'){
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 26 26">
      <polygon points="13,1 25,13 13,25 1,13" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="19" viewBox="0 0 26 32">
      <polygon points="13,0 26,4.8 26,32 0,32 0,4.8" fill="${color}" stroke="white" stroke-width="1.5"/>
    </svg>`;
  }
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function shapeGoogleSize(shape, active){
  const sc = msc();
  if(shape){
    return active ? {size:[19*sc,19*sc], anchor:[9*sc,19*sc]} : {size:[15*sc,15*sc], anchor:[7*sc,15*sc]};
  }
  return active ? {size:[19*sc,24*sc], anchor:[9*sc,24*sc]} : {size:[15*sc,19*sc], anchor:[7*sc,19*sc]};
}

window.onGoogleMapsLoaded = function(){
  googleReady = true;
  googleMap = new google.maps.Map(document.getElementById('google-map'), {
    center:{lat:44.27, lng:-71.30}, zoom:13, mapTypeId:'terrain'
  });
  document.getElementById('gmaps-status').textContent = 'Google Maps loaded.';
  renderGoogle();
};

document.getElementById('gmaps-load-btn').addEventListener('click', ()=>{
  const key = document.getElementById('gmaps-key').value.trim();
  if(!key){ document.getElementById('gmaps-status').textContent = 'Paste a valid API key first.'; return; }
  if(googleReady){ document.getElementById('gmaps-status').textContent = 'Already loaded.'; return; }
  if(googleScriptLoading){ return; }
  googleScriptLoading = true;
  document.getElementById('gmaps-status').textContent = 'Loading Google Maps…';
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=onGoogleMapsLoaded`;
  script.async = true;
  script.onerror = ()=>{ document.getElementById('gmaps-status').textContent = 'Failed to load — check the API key and that Maps JavaScript API is enabled.'; googleScriptLoading=false; };
  document.head.appendChild(script);
});

function renderGoogle(){
  if(!googleReady || !googleMap) return;
  Object.values(googleMarkers).forEach(m=> m.setMap(null));
  googleMarkers = {};
  if(googleLine){ googleLine.setMap(null); googleLine = null; }
  if(myLocation) renderGoogleLocation();
  if(posts.length===0) return;
  const path = [];
  posts.forEach(p=>{
    path.push({lat:p.lat, lng:p.lon});
    const shape = getActionShape(p);
    const dims = shapeGoogleSize(shape, false);
    const marker = new google.maps.Marker({
      position:{lat:p.lat, lng:p.lon},
      map:googleMap,
      icon:{ url:pinIconSvg(markerBaseColorHex(p), shape), scaledSize:new google.maps.Size(dims.size[0],dims.size[1]), anchor:new google.maps.Point(dims.anchor[0],dims.anchor[1]) },
      label:{ text:String(p.id), color:markerTextColorCss(p), fontWeight:'700', fontSize:(7.5*msc())+'px' }
    });
    marker.addListener('click', ()=> selectPost(p.id));
    googleMarkers[p.id] = marker;
  });
  if(path.length>1){
    googleLine = new google.maps.Polyline({
      path, geodesic:true, strokeColor:THEMES[currentTheme].orange, strokeOpacity:0.6, strokeWeight:3, map:googleMap
    });
  }
  if(path.length>0){
    const bounds = new google.maps.LatLngBounds();
    path.forEach(pt=>bounds.extend(pt));
    googleMap.fitBounds(bounds, 40);
  }
}

