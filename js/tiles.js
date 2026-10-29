// ---------- TILES MODE ----------
let leafletMap = null;
let leafletMarkers = {};
let leafletLine = null;
let leafletGapLayer = null;
let leafletGapSummaryControl = null;
let leafletBaseLayer = null;
let tilesLayerType = 'street';
const TILE_LAYERS = {
  // Per OSM's tile usage policy (operations.osmfoundation.org/policies/tiles/),
  // the {s} subdomain-rotation pattern is deprecated — OSM now expects
  // requests directly at tile.openstreetmap.org, with other subdomains
  // "slower or withdrawn without notice." referrerPolicy is set explicitly
  // because OSM began strictly enforcing its Referer requirement in 2026,
  // and Leaflet only sets this automatically in versions released after
  // May 2026 — this app loads 1.9.4 (2023), which needs it set by hand.
  street: { url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options:{ maxZoom:19, attribution:'© OpenStreetMap contributors', referrerPolicy:'strict-origin-when-cross-origin' } },
  satellite: { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', options:{ maxZoom:19, attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics', referrerPolicy:'strict-origin-when-cross-origin' } }
};
function setTilesLayer(type){
  tilesLayerType = type;
  if(!leafletMap) return;
  if(leafletBaseLayer) leafletMap.removeLayer(leafletBaseLayer);
  const cfg = TILE_LAYERS[type];
  leafletBaseLayer = L.tileLayer(cfg.url, cfg.options).addTo(leafletMap);
}
document.querySelectorAll('.subtab[data-tiles-layer]').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.subtab[data-tiles-layer]').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    setTilesLayer(tab.getAttribute('data-tiles-layer'));
  });
});

function ensureLeaflet(){
  if(leafletMap) return;
  leafletMap = L.map('leaflet-map').setView([44.27,-71.30], 13);
  setTilesLayer(tilesLayerType);
}
function renderTiles(){
  ensureLeaflet();
  setTimeout(()=>leafletMap.invalidateSize(), 50);
  Object.values(leafletMarkers).forEach(m=>leafletMap.removeLayer(m));
  leafletMarkers = {};
  if(leafletLine){ leafletMap.removeLayer(leafletLine); leafletLine=null; }
  if(myLocation) renderTilesLocation();
  if(posts.length===0) return;
  const latlngs = [];
  posts.forEach(p=>{
    latlngs.push([p.lat,p.lon]);
    const shape = getActionShape(p);
    const shapeClass = shape ? ' shape-'+shape : '';
    const sc = msc();
    const iconSize = shape ? [15*sc,15*sc] : [15*sc,19*sc];
    const iconAnchor = shape ? [7*sc,15*sc] : [7*sc,19*sc];
    const icon = L.divIcon({className:'', html:`<div class="img-pin${shapeClass}" id="tileicon-${p.id}" data-base-fill="${markerBaseColorCss(p)}" data-base-text="${markerTextColorCss(p)}" style="background:${markerBaseColorCss(p)};color:${markerTextColorCss(p)}">${p.id}</div>`, iconSize, iconAnchor});
    const marker = L.marker([p.lat,p.lon], {icon}).addTo(leafletMap);
    marker.on('click', ()=>selectPost(p.id));
    leafletMarkers[p.id] = marker;
  });
  // The legacy "trail overview" dashed line connects posts in simple ID
  // order — it doesn't know about custom sequence/group data, so for a
  // dataset like this one (where ID order isn't the real trail order) it
  // draws a confusing crisscross on top of the correct gap-analysis lines.
  // Skip it whenever gap analysis is handling the trail-order line instead.
  if(latlngs.length>1 && !gapAnalysisOn) leafletLine = L.polyline(latlngs, {color:THEMES[currentTheme].orange, weight:3, opacity:0.6, dashArray:'7,7'}).addTo(leafletMap);
  if(latlngs.length>0) leafletMap.fitBounds(latlngs, {padding:[40,40]});
  if(routeEnabled) updateRoute();
  renderTilesGaps();
}

// Same gap-analysis idea as My Map mode, but using real lat/lon directly —
// no calibration needed here, since Leaflet tiles are already a properly
// georeferenced map. This tends to be the MORE accurate of the two views
// for that reason.
function renderTilesGaps(){
  if(leafletGapLayer){ leafletMap.removeLayer(leafletGapLayer); leafletGapLayer = null; }
  if(leafletGapSummaryControl){ leafletMap.removeControl(leafletGapSummaryControl); leafletGapSummaryControl = null; }
  const summaryEl = document.getElementById('gap-summary');
  if(!gapAnalysisOn || posts.length < 2){
    if(summaryEl) summaryEl.textContent = '';
    return;
  }

  const { segments, total } = computeGapStats();
  if(gapThresholdMeters === null){
    gapThresholdMeters = computeGapStats().average * 1.5;
    document.getElementById('gap-threshold').value = gapThresholdDisplayValue();
  }

  function drawTilesSegment(a, b, color, bold, label){
    const latlngs2 = [[a.lat,a.lon],[b.lat,b.lon]];
    L.polyline(latlngs2, {color:'#FFFFFF', weight:bold?7:5.5, opacity:0.9, lineCap:'round'}).addTo(leafletGapLayer);
    L.polyline(latlngs2, {color, weight:bold?4:2.5, opacity:0.95, lineCap:'round'}).addTo(leafletGapLayer);
    if(label && gapLabelsOn){
      const midLat = (a.lat+b.lat)/2, midLon = (a.lon+b.lon)/2;
      const labelIcon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:3px;border:1.2px solid #fff;white-space:nowrap;">${label}</div>`,
        iconSize: null
      });
      L.marker([midLat, midLon], {icon:labelIcon, interactive:false}).addTo(leafletGapLayer);
    }
  }

  leafletGapLayer = L.layerGroup().addTo(leafletMap);
  let flaggedCount = 0;
  // Base corridor — red, matching the real Torres Trail color; unusually
  // long stretches picked out in orange.
  segments.forEach(seg=>{
    const isGap = seg.distanceMeters > gapThresholdMeters;
    if(isGap) flaggedCount++;
    const color = isGap ? '#E67E22' : '#C1502E';
    drawTilesSegment(seg.a, seg.b, color, isGap, fmtDist(seg.distanceMeters));
  });
  // Explicit highlight overlays — bold blue, always on top.
  const { segments: highlightSegs } = computeHighlightSegments();
  highlightSegs.forEach(seg=>{
    drawTilesSegment(seg.a, seg.b, '#1565C0', true, fmtDist(seg.distanceMeters));
  });

  // A real Leaflet control (not a map-coordinate marker) so it stays fixed
  // to a screen corner regardless of panning or zooming — same idea as a
  // scale bar or attribution control.
  const lines = gapSummaryLines(total, flaggedCount, highlightSegs);
  const GapSummaryControl = L.Control.extend({
    onAdd: function(){
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:rgba(255,255,255,0.94);border:1.5px solid #16302A;border-radius:4px;padding:8px 12px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;line-height:1.6;color:#16302A;max-width:240px;';
      div.innerHTML = lines.map((line,i)=>`<div style="font-weight:${i===0?700:500};${i===2?'color:#1565C0;':''}">${line}</div>`).join('');
      return div;
    }
  });
  leafletGapSummaryControl = new GapSummaryControl({ position: 'bottomleft' });
  leafletGapSummaryControl.addTo(leafletMap);

  if(summaryEl) summaryEl.textContent = ''; // shown on the map itself now, not the sidebar
}

