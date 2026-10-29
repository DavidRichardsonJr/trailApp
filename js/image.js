// ---------- IMAGE MODE ----------
let mapImageLoaded = false;
let calib = {p1:null, p2:null}; // {xPercent,yPercent,lat,lon}
let picking = null; // 1 or 2

// Converts a post's real lat/lon into a pixel-percent position on the
// uploaded map image, using the same two-point linear calibration as the
// markers themselves — shared here so the gap-analysis line uses the
// exact same math, not a second copy that could drift out of sync.
function imageCoordFor(p){
  return {
    x: calib.p1.xPercent + (p.lon-calib.p1.lon)*(calib.p2.xPercent-calib.p1.xPercent)/(calib.p2.lon-calib.p1.lon),
    y: calib.p1.yPercent + (p.lat-calib.p1.lat)*(calib.p2.yPercent-calib.p1.yPercent)/(calib.p2.lat-calib.p1.lat)
  };
}

// Returns posts in TRAIL WALKING order. If any post has a "sequence" value
// (from an optional CSV column — see SEQUENCE_KEYS), that order is used
// instead of sorting by marker ID, since real-world marker numbers often
// don't match the physical path (e.g. post 60 might be walked right before
// post 21, not post 61). Posts without a sequence value sort to the end.
function trailOrderedPosts(){
  const hasSequence = posts.some(p => p.sequence !== null && p.sequence !== undefined);
  const hasGroup = posts.some(p => p.group !== null && p.group !== undefined);
  if(!hasSequence && !hasGroup) return posts;
  return [...posts].sort((a,b)=>{
    if(hasGroup){
      // Sort by group FIRST, so every post in the same group stays
      // contiguous — otherwise sorting by sequence alone would interleave
      // two different groups that both happen to number their own
      // sequence starting at 1, 2, 3...
      const ag = (a.group===null||a.group===undefined) ? '' : String(a.group);
      const bg = (b.group===null||b.group===undefined) ? '' : String(b.group);
      if(ag !== bg) return ag < bg ? -1 : 1;
    }
    const as = (a.sequence===null||a.sequence===undefined) ? Infinity : a.sequence;
    const bs = (b.sequence===null||b.sequence===undefined) ? Infinity : b.sequence;
    if(as !== bs) return as - bs;
    return naturalSort(a,b);
  });
}

// Distance between every CONSECUTIVE pair of posts, in trail order (the
// same order used for the "prev/next leg" distances already shown when a
// post is selected). Returns each segment plus the overall total.
function computeGapStats(){
  const ordered = trailOrderedPosts();
  const segments = [];
  let total = 0;
  for(let i=0; i<ordered.length-1; i++){
    const a = ordered[i], b = ordered[i+1];
    // Never connect two different groups — each group is treated as its
    // own separate, unrelated stretch of trail (e.g. several disconnected
    // "known gap" pairs scattered around the park, not one continuous walk).
    const ag = (a.group===null||a.group===undefined) ? null : String(a.group);
    const bg = (b.group===null||b.group===undefined) ? null : String(b.group);
    if(ag !== bg) continue;
    const d = haversine(a,b);
    segments.push({ a, b, distanceMeters:d });
    total += d;
  }
  const average = segments.length ? total/segments.length : 0;
  return { segments, total, average };
}

// Explicit, EXTRA connections from a "highlight to" CSV column — independent
// of trail sequence/group entirely. Used to call out specific known
// segments (e.g. "a new marker fills exactly this gap") regardless of
// where those two posts fall in the general trail order.
function computeHighlightSegments(){
  const byId = {};
  posts.forEach(p => { byId[p.id] = p; });
  const segments = [];
  let total = 0;
  posts.forEach(p=>{
    if(!p.highlightTo) return;
    const target = byId[p.highlightTo];
    if(!target) return; // referenced an id that doesn't exist — silently skip rather than crash
    const d = haversine(p, target);
    segments.push({ a:p, b:target, distanceMeters:d });
    total += d;
  });
  return { segments, total };
}

// Shared summary text, as plain lines, so Grid/My Map/OSM Tiles can each
// draw it directly on their own map surface instead of the sidebar.
function gapSummaryLines(total, flaggedCount, highlightSegs){
  const lines = [
    `Total trail length: ${fmtDist(total)}`,
    `${flaggedCount} gap(s) flagged \u2014 possible new marker location${flaggedCount===1?'':'s'}.`
  ];
  if(highlightSegs.length){
    const hTotal = highlightSegs.reduce((s,seg)=>s+seg.distanceMeters,0);
    const pct = total>0 ? (hTotal/total*100).toFixed(1) : '?';
    lines.push(`${highlightSegs.length} highlighted segment(s): ${fmtDist(hTotal)} (${pct}% of total)`);
  }
  return lines;
}

function gapThresholdDisplayValue(){
  return unitSystem==='imperial' ? Math.round(gapThresholdMeters * 3.28084) : Math.round(gapThresholdMeters);
}
function gapThresholdFromDisplayValue(v){
  return unitSystem==='imperial' ? v / 3.28084 : v;
}

function renderImageGaps(){
  const svg = document.getElementById('image-lines');
  const summaryEl = document.getElementById('gap-summary');
  if(!svg) return;
  svg.innerHTML = '';
  if(!gapAnalysisOn || !calib.p1 || !calib.p2 || posts.length < 2){
    if(summaryEl) summaryEl.textContent = '';
    return;
  }

  const { segments, total } = computeGapStats();
  if(gapThresholdMeters === null){
    gapThresholdMeters = computeGapStats().average * 1.5;
    document.getElementById('gap-threshold').value = gapThresholdDisplayValue();
  }

  function drawSegment(parts, ax, ay, bx, by, color, bold, label){
    const haloWidth = bold ? 1.9 : 1.5;
    const lineWidth = bold ? 1.1 : 0.7;
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#FFFFFF" stroke-width="${haloWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
    if(label && gapLabelsOn){
      const midX = (ax+bx)/2, midY = (ay+by)/2;
      parts.push(`<g>
        <rect x="${midX-4.2}" y="${midY-1.3}" width="8.4" height="2.6" fill="${color}" stroke="#FFFFFF" stroke-width="0.2" rx="0.5" vector-effect="non-scaling-stroke"/>
        <text x="${midX}" y="${midY+0.65}" font-size="1.5" font-weight="700" text-anchor="middle" fill="#FFFFFF" font-family="IBM Plex Mono, monospace">${label}</text>
      </g>`);
    }
  }

  let flaggedCount = 0;
  const parts = [];
  // Base corridor — the trail itself, in a red matching the real Torres
  // Trail color, with unusually-long stretches picked out in orange.
  segments.forEach(seg=>{
    const pa = imageCoordFor(seg.a), pb = imageCoordFor(seg.b);
    const isGap = seg.distanceMeters > gapThresholdMeters;
    if(isGap) flaggedCount++;
    const color = isGap ? '#E67E22' : '#C1502E';
    drawSegment(parts, pa.x, pa.y, pb.x, pb.y, color, isGap, fmtDist(seg.distanceMeters));
  });
  // Explicit highlight overlays — always bold blue, always on top, drawn
  // last so they sit visually above the base corridor.
  const { segments: highlightSegs } = computeHighlightSegments();
  highlightSegs.forEach(seg=>{
    const pa = imageCoordFor(seg.a), pb = imageCoordFor(seg.b);
    drawSegment(parts, pa.x, pa.y, pb.x, pb.y, '#1565C0', true, fmtDist(seg.distanceMeters));
  });

  // Info box drawn directly on the map (bottom-left), instead of the sidebar.
  const lines = gapSummaryLines(total, flaggedCount, highlightSegs);
  const boxH = 4 + lines.length*4.2;
  parts.push(`<g>
    <rect x="1.5" y="${94.5-boxH}" width="46" height="${boxH}" fill="rgba(255,255,255,0.94)" stroke="#16302A" stroke-width="0.25" rx="1"/>
    ${lines.map((line,i)=>`<text x="3" y="${94.5-boxH+4+i*4.2}" font-size="2.5" font-weight="${i===0?'700':'500'}" fill="${i===2?'#1565C0':'#16302A'}" font-family="IBM Plex Mono, monospace">${line}</text>`).join('')}
  </g>`);

  svg.innerHTML = parts.join('');
  if(summaryEl) summaryEl.textContent = ''; // shown on the map itself now, not the sidebar
}

function renderImageMarkers(){
  const layer = document.getElementById('image-markers');
  layer.innerHTML = '';
  if(!calib.p1 || !calib.p2 || posts.length===0){ renderImageGaps(); return; }
  posts.forEach(p=>{
    const xPercent = calib.p1.xPercent + (p.lon-calib.p1.lon)*(calib.p2.xPercent-calib.p1.xPercent)/(calib.p2.lon-calib.p1.lon);
    const yPercent = calib.p1.yPercent + (p.lat-calib.p1.lat)*(calib.p2.yPercent-calib.p1.yPercent)/(calib.p2.lat-calib.p1.lat);
    const m = document.createElement('div');
    m.className = 'img-marker';
    m.id = 'imgmark-'+p.id;
    m.style.left = xPercent+'%';
    m.style.top = yPercent+'%';
    const shapeClass = getActionShape(p) ? ' shape-'+getActionShape(p) : '';
    m.innerHTML = `<div class="img-pin${shapeClass}" data-base-fill="${markerBaseColorCss(p)}" data-base-text="${markerTextColorCss(p)}" style="background:${markerBaseColorCss(p)};color:${markerTextColorCss(p)}">${p.id}</div>`;
    m.addEventListener('click', ()=> selectPost(p.id));
    layer.appendChild(m);
  });
  renderImageGaps();
  renderImageLocation();
}

document.getElementById('img-input').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('img-upload-status');
  statusEl.textContent = 'Reading ' + file.name + '…';
  const reader = new FileReader();
  reader.onerror = ()=>{ statusEl.textContent = 'Could not read that file.'; };
  reader.onload = (evt)=>{
    const img = document.getElementById('map-img');
    img.onerror = ()=>{ statusEl.textContent = 'That file could not be loaded as an image. Try a JPG or PNG.'; };
    img.onload = ()=>{
      mapImageLoaded = true;
      statusEl.textContent = `Loaded (${img.naturalWidth}×${img.naturalHeight}px). Now pick two reference points below.`;
      document.getElementById('calib-panel').style.display = 'block';
      document.getElementById('map-empty').style.display = 'none';
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('p1-post-select').addEventListener('change', (e)=>{
  const id = e.target.value;
  if(!id) return;
  const p = posts.find(x=>x.id===id);
  if(p){ document.getElementById('p1-lat').value = p.lat; document.getElementById('p1-lon').value = p.lon; }
});
document.getElementById('p2-post-select').addEventListener('change', (e)=>{
  const id = e.target.value;
  if(!id) return;
  const p = posts.find(x=>x.id===id);
  if(p){ document.getElementById('p2-lat').value = p.lat; document.getElementById('p2-lon').value = p.lon; }
});
function populatePostSelects(){
  const opts = '<option value="">— manual entry —</option>' + posts.map(p=>`<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');
  const s1 = document.getElementById('p1-post-select');
  const s2 = document.getElementById('p2-post-select');
  if(s1) s1.innerHTML = opts;
  if(s2) s2.innerHTML = opts;
  const simSel = document.getElementById('sim-post-select');
  if(simSel){
    const simOpts = '<option value="">— choose a post —</option>' + posts.map(p=>`<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');
    const prevVal = simSel.value;
    simSel.innerHTML = simOpts;
    if(posts.some(p=>p.id===prevVal)) simSel.value = prevVal;
  }
}

function resetCalibration(){
  calib.p1 = null; calib.p2 = null;
  window.pick1XY = null; window.pick2XY = null;
  ['p1-lat','p1-lon','p2-lat','p2-lon'].forEach(id=> document.getElementById(id).value = '');
  document.getElementById('p1-post-select').value = '';
  document.getElementById('p2-post-select').value = '';
  document.getElementById('pick1-info').textContent = 'not set — click "Pick on map", then click the image';
  document.getElementById('pick2-info').textContent = 'not set — click "Pick on map", then click the image';
  const d1 = document.getElementById('calib-dot-1'); if(d1) d1.remove();
  const d2 = document.getElementById('calib-dot-2'); if(d2) d2.remove();
  const statusEl = document.getElementById('calib-status');
  statusEl.style.color = '';
  statusEl.textContent = 'Calibration reset.';
  renderImageMarkers();
}
document.getElementById('reset-calib-btn').addEventListener('click', resetCalibration);

// Renders the gap overlay in whichever mode is currently active — the two
// modes use completely different drawing engines (SVG over an image vs.
// real Leaflet map layers), so this just calls the right one.
function renderGapsForCurrentMode(){
  if(mapMode==='image') renderImageGaps();
  else if(mapMode==='tiles') renderTilesGaps();
  else if(mapMode==='grid') renderGrid();
}

document.getElementById('gap-toggle').addEventListener('change', (e)=>{
  gapAnalysisOn = e.target.checked;
  renderGapsForCurrentMode();
});
document.getElementById('markers-visible-toggle').addEventListener('change', (e)=>{
  const visible = e.target.checked;
  document.getElementById('image-markers').style.display = visible ? 'block' : 'none';
  // Tiles mode markers are individual Leaflet objects, not one container —
  // toggle each one's opacity instead.
  Object.values(leafletMarkers).forEach(m => m.setOpacity(visible ? 1 : 0));
  document.getElementById('mapsvg').classList.toggle('hide-pins', !visible);
});
document.getElementById('gap-labels-toggle').addEventListener('change', (e)=>{
  gapLabelsOn = e.target.checked;
  renderGapsForCurrentMode();
});
document.getElementById('gap-threshold').addEventListener('input', (e)=>{
  const v = parseFloat(e.target.value);
  if(!isNaN(v) && v > 0){
    gapThresholdMeters = gapThresholdFromDisplayValue(v);
    renderGapsForCurrentMode();
  }
});

function resetAllData(){
  posts = [];
  activeId = null;
  resetCalibration();
  mapImageLoaded = false;
  document.getElementById('map-img').src = '';
  document.getElementById('calib-panel').style.display = 'none';
  document.getElementById('img-upload-status').textContent = '';
  document.getElementById('paste-area').value = '';
  document.getElementById('search').value = '';
  document.getElementById('file-status').classList.remove('error','ok');
  document.getElementById('file-status').textContent = '';
  document.getElementById('detail').classList.remove('show');
  if(watchId){ toggleLocation(); }
  renderAll();
}
document.getElementById('reset-all-btn').addEventListener('click', ()=>{
  if(confirm('Clear all loaded posts, calibration, and map image? This cannot be undone.')) resetAllData();
});

function armPicking(n){
  if(!mapImageLoaded){
    document.getElementById('img-upload-status').textContent = 'Upload a map image first, then you can pick reference points on it.';
    return;
  }
  picking = n;
  document.getElementById('image-stage').classList.add('picking');
}
document.getElementById('pick1-btn').addEventListener('click', ()=> armPicking(1));
document.getElementById('pick2-btn').addEventListener('click', ()=> armPicking(2));

document.getElementById('map-img').addEventListener('click', (e)=>{
  if(!picking) return;
  const img = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  const xPercent = ((e.clientX-rect.left)/rect.width)*100;
  const yPercent = ((e.clientY-rect.top)/rect.height)*100;
  document.getElementById('pick'+picking+'-info').textContent = `✓ picked — x:${xPercent.toFixed(1)}%  y:${yPercent.toFixed(1)}%. Now enter its real lat/lon below.`;
  window['pick'+picking+'XY'] = {xPercent,yPercent};

  // drop a visible dot on the image so the pick is confirmed visually
  const old = document.getElementById('calib-dot-'+picking);
  if(old) old.remove();
  const dot = document.createElement('div');
  dot.id = 'calib-dot-'+picking;
  dot.style.position='absolute';
  dot.style.left=xPercent+'%'; dot.style.top=yPercent+'%';
  dot.style.transform='translate(-50%,-50%)';
  dot.style.width='14px'; dot.style.height='14px'; dot.style.borderRadius='50%';
  dot.style.background = picking===1 ? '#2E7D46' : '#C0392B';
  dot.style.border='2px solid white'; dot.style.boxShadow='0 0 0 2px rgba(0,0,0,0.4)';
  dot.style.pointerEvents='none';
  dot.style.zIndex='50';
  document.getElementById('image-markers').appendChild(dot);

  document.getElementById('image-stage').classList.remove('picking');
  picking = null;
});

/* CALIBRATION MATH, explained:
   We have two reference points where we know BOTH the pixel position
   on the uploaded image (as a %) AND the real lat/lon. That's enough
   to solve a simple linear equation in each direction independently:
     xPercent = p1.xPercent + (lon - p1.lon) * (p2.xPercent - p1.xPercent) / (p2.lon - p1.lon)
   This is just "if p1.lon maps to p1.xPercent and p2.lon maps to
   p2.xPercent, where does THIS lon map to?" — linear interpolation.
   Same idea for latitude -> yPercent. It assumes the image is roughly
   north-up and undistorted; it can't correct rotation or warping. */
document.getElementById('apply-calib-btn').addEventListener('click', ()=>{
  const statusEl = document.getElementById('calib-status');
  const p1xy = window.pick1XY, p2xy = window.pick2XY;
  const p1lat = parseFloat(document.getElementById('p1-lat').value);
  const p1lon = parseFloat(document.getElementById('p1-lon').value);
  const p2lat = parseFloat(document.getElementById('p2-lat').value);
  const p2lon = parseFloat(document.getElementById('p2-lon').value);
  const missing = [];
  if(!p1xy) missing.push('pick point 1 on the image');
  if(!p2xy) missing.push('pick point 2 on the image');
  if(isNaN(p1lat)||isNaN(p1lon)) missing.push('enter point 1\'s real lat/lon');
  if(isNaN(p2lat)||isNaN(p2lon)) missing.push('enter point 2\'s real lat/lon');
  if(missing.length>0){
    statusEl.className = 'hint';
    statusEl.style.color = '#C0392B';
    statusEl.textContent = 'Still needed: ' + missing.join(', ') + '.';
    return;
  }
  if(p1xy.xPercent===p2xy.xPercent && p1xy.yPercent===p2xy.yPercent){
    statusEl.style.color = '#C0392B';
    statusEl.textContent = 'Points 1 and 2 are the same spot — pick two points that are far apart on the map.';
    return;
  }
  calib.p1 = {xPercent:p1xy.xPercent, yPercent:p1xy.yPercent, lat:p1lat, lon:p1lon};
  calib.p2 = {xPercent:p2xy.xPercent, yPercent:p2xy.yPercent, lat:p2lat, lon:p2lon};
  statusEl.style.color = '#2E7D46';
  statusEl.textContent = posts.length>0
    ? `Calibrated. ${posts.length} post(s) placed on the map.`
    : 'Calibrated. Load your posts (CSV) to see them placed on the map.';
  renderImageMarkers();
});

