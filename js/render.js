// ---------- COMMON RENDER ----------
function renderAll(){
  document.getElementById('post-count').textContent = posts.length;
  document.getElementById('empty').style.display = posts.length ? 'none' : 'block';
  renderMgmtLegend();

  const list = document.getElementById('post-list');
  list.innerHTML = '';
  posts.forEach(p=>{
    const row = document.createElement('li');
    row.className = 'post-row';
    row.id = 'row-'+p.id;
    row.innerHTML = `<div class="badge">${p.id}</div><div class="post-meta"><div class="name">${p.name}</div><div class="coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div></div>`;
    row.addEventListener('click', ()=>selectPost(p.id));
    list.appendChild(row);
  });

  document.getElementById('map-empty').style.display = posts.length ? 'none' : 'flex';
  populatePostSelects();
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles') renderTiles();
  if(mapMode==='image') renderImageMarkers();
  if(mapMode==='google') renderGoogle();
}

function clearActiveVisuals(){
  if(activeId===null) return;
  const gm = document.querySelector(`.post-marker[data-id="${CSS.escape(String(activeId))}"]`);
  if(gm){
    gm.classList.remove('active');
    const pin = gm.querySelector('.pin');
    if(pin) pin.style.fill = pin.getAttribute('data-base-fill') || 'var(--brown)';
    const txt = gm.querySelector('text');
    if(txt) txt.style.fill = txt.getAttribute('data-base-fill') || '#ffffff';
  }
  const im = document.getElementById('imgmark-'+activeId);
  if(im){
    im.classList.remove('active');
    const pinDiv = im.querySelector('.img-pin');
    if(pinDiv){
      pinDiv.style.background = pinDiv.getAttribute('data-base-fill') || 'var(--brown)';
      pinDiv.style.color = pinDiv.getAttribute('data-base-text') || '#ffffff';
    }
  }
  const ti = document.getElementById('tileicon-'+activeId);
  if(ti){
    ti.classList.remove('active');
    ti.style.background = ti.getAttribute('data-base-fill') || 'var(--brown)';
    ti.style.color = ti.getAttribute('data-base-text') || '#ffffff';
  }
  const row = document.getElementById('row-'+activeId);
  if(row) row.classList.remove('active');
  const gmk = googleMarkers[activeId];
  if(gmk){
    const prevPost = posts.find(p=>p.id===activeId);
    const baseHex = prevPost ? markerBaseColorHex(prevPost) : THEMES[currentTheme].brown;
    const baseText = prevPost ? markerTextColorCss(prevPost) : '#ffffff';
    const shape = prevPost ? getActionShape(prevPost) : null;
    const dims = shapeGoogleSize(shape, false);
    gmk.setIcon({ url:pinIconSvg(baseHex, shape), scaledSize:new google.maps.Size(dims.size[0],dims.size[1]), anchor:new google.maps.Point(dims.anchor[0],dims.anchor[1]) });
    gmk.setLabel({ text:String(prevPost ? prevPost.id : ''), color:baseText, fontWeight:'700', fontSize:(7.5*msc())+'px' });
  }
}

/**
 * Called whenever a marker is clicked (on any map mode) or a post row
 * is clicked in the sidebar list. Deselects whatever was previously
 * active, then highlights this post everywhere it appears — the map
 * marker, the sidebar row, and the detail panel — since all four map
 * modes need to reflect the same "currently selected post" state.
 */
function selectPost(id){
  clearActiveVisuals();
  activeId = id;
  const gm = document.querySelector(`.post-marker[data-id="${CSS.escape(String(id))}"]`);
  if(gm){
    gm.classList.add('active');
    const pin = gm.querySelector('.pin');
    if(pin) pin.style.fill = 'var(--orange)';
    const txt = gm.querySelector('text');
    if(txt) txt.style.fill = 'var(--accent-text)';
  }
  const im = document.getElementById('imgmark-'+id);
  if(im){
    im.classList.add('active');
    const pinDiv = im.querySelector('.img-pin');
    if(pinDiv){ pinDiv.style.background = 'var(--orange)'; pinDiv.style.color = 'var(--accent-text)'; }
  }
  const ti = document.getElementById('tileicon-'+id);
  if(ti){
    ti.classList.add('active');
    ti.style.background = 'var(--orange)';
    ti.style.color = 'var(--accent-text)';
  }
  const row = document.getElementById('row-'+id);
  if(row){ row.classList.add('active'); row.scrollIntoView({block:'nearest'}); }
  const gmk = googleMarkers[id];
  if(gmk){
    const activePost = posts.find(p=>p.id===id);
    const activeShape = activePost ? getActionShape(activePost) : null;
    const activeDims = shapeGoogleSize(activeShape, true);
    gmk.setIcon({ url:pinIconSvg(THEMES[currentTheme].orange, activeShape), scaledSize:new google.maps.Size(activeDims.size[0],activeDims.size[1]), anchor:new google.maps.Point(activeDims.anchor[0],activeDims.anchor[1]) });
    gmk.setLabel({ text:String(id), color:'var(--accent-text)', fontWeight:'700', fontSize:(8*msc())+'px' });
  }

  const idx = posts.findIndex(p=>p.id===id);
  const p = posts[idx];
  document.getElementById('d-title').textContent = 'Post ' + p.id;
  document.getElementById('d-lat').textContent = p.lat.toFixed(6)+'°';
  document.getElementById('d-lon').textContent = p.lon.toFixed(6)+'°';
  document.getElementById('d-seq').textContent = (idx+1) + ' of ' + posts.length;
  document.getElementById('d-prev').textContent = idx>0 ? fmtDist(haversine(posts[idx-1],p)) : '— start of trail';
  document.getElementById('d-next').textContent = idx<posts.length-1 ? fmtDist(haversine(p,posts[idx+1])) : '— end of trail';
  document.getElementById('d-navigate').href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`;
  document.getElementById('detail').classList.add('show');
  updateFromMeBearing();

  if(mapMode==='tiles' && leafletMap) leafletMap.panTo([p.lat,p.lon]);
  if(mapMode==='google' && googleMap) googleMap.panTo({lat:p.lat, lng:p.lon});
}

function updateFromMeBearing(){
  const el = document.getElementById('d-fromme');
  if(activeId===null){ el.style.display='none'; return; }
  if(!myLocation){ el.style.display='none'; return; }
  const p = posts.find(x=>x.id===activeId);
  if(!p){ el.style.display='none'; return; }
  const d = haversine(myLocation, p);
  const b = bearing(myLocation, p);
  el.innerHTML = `From you: ${fmtDist(d)} — head ${fmtBearing(b)}`;
  el.style.display = 'block';
}

document.getElementById('detail-close').addEventListener('click', ()=>{
  document.getElementById('detail').classList.remove('show');
  clearActiveVisuals();
  activeId = null;
});

document.getElementById('csv-input').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('file-status');
  statusEl.classList.remove('error','ok');
  statusEl.textContent = 'Reading ' + file.name + '…';
  const reader = new FileReader();
  reader.onerror = ()=>{
    statusEl.classList.add('error');
    statusEl.textContent = 'Could not read the file from disk: ' + (reader.error ? reader.error.message : 'unknown error');
  };
  reader.onload = (evt)=>{
    try{
      loadPosts(parseCSV(evt.target.result));
    } catch(err){
      statusEl.classList.add('error');
      statusEl.innerHTML = '<b>Unexpected error while parsing this file.</b><br>' + err.message;
      console.error(err);
    }
  };
  reader.readAsText(file);
});
document.getElementById('paste-btn').addEventListener('click', ()=>{
  const statusEl = document.getElementById('file-status');
  try{
    loadPosts(parseCSV(document.getElementById('paste-area').value));
  } catch(err){
    statusEl.classList.remove('ok');
    statusEl.classList.add('error');
    statusEl.innerHTML = '<b>Unexpected error while parsing this text.</b><br>' + err.message;
    console.error(err);
  }
});
document.getElementById('demo-btn').addEventListener('click', ()=>{
  const base = {lat:44.2691, lon:-71.3033};
  const demo = [];
  const names = ['Trailhead','Ridge junction','Stream crossing','Overlook','Switchback','Shelter','Summit approach'];
  for(let i=1;i<=12;i++){
    demo.push({ id:String(i), lat: base.lat + i*0.0021 + (Math.sin(i)*0.0006), lon: base.lon + i*0.0016 + (Math.cos(i*0.7)*0.0005), name: names[i%names.length] + ' area' });
  }
  loadPosts({posts: demo, warnings: ['(synthetic demo coordinates, not a real trail)']});
});
function setTheme(name){
  currentTheme = name;
  document.body.classList.toggle('theme-original', name==='original');
  if(mapMode==='grid') renderGrid();
  if(mapMode==='tiles') renderTiles();
  if(mapMode==='google') renderGoogle();
}

function refreshDistanceDisplays(){
  updateNearestPost();
  if(activeId!==null){
    const idx = posts.findIndex(p=>p.id===activeId);
    if(idx>=0){
      const p = posts[idx];
      document.getElementById('d-prev').textContent = idx>0 ? fmtDist(haversine(posts[idx-1],p)) : '— start of trail';
      document.getElementById('d-next').textContent = idx<posts.length-1 ? fmtDist(haversine(p,posts[idx+1])) : '— end of trail';
    }
  }
  updateFromMeBearing();
}
document.querySelectorAll('.unit-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    unitSystem = btn.getAttribute('data-unit');
    document.querySelectorAll('.unit-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    refreshDistanceDisplays();
    document.getElementById('gap-threshold-unit').textContent = unitSystem==='imperial' ? 'ft' : 'm';
    if(gapThresholdMeters !== null){
      document.getElementById('gap-threshold').value = gapThresholdDisplayValue();
    }
    renderGapsForCurrentMode();
  });
});

let sidebarHidden = false;
document.getElementById('sidebar-toggle').addEventListener('click', ()=>{
  sidebarHidden = !sidebarHidden;
  document.body.classList.toggle('sidebar-hidden', sidebarHidden);
  const btn = document.getElementById('sidebar-toggle');
  const isMobile = window.innerWidth <= 820;
  btn.textContent = sidebarHidden ? (isMobile ? '▲' : '▶') : (isMobile ? '▼' : '◀');
  // give the layout a moment to reflow, then tell live maps to resize
  setTimeout(()=>{
    if(leafletMap) leafletMap.invalidateSize();
    if(googleMap) google.maps.event.trigger(googleMap, 'resize');
  }, 250);
});

document.getElementById('search').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.post-row').forEach(row=>{
    const id = row.id.replace('row-','').toLowerCase();
    row.style.display = id.includes(q) ? 'flex' : 'none';
  });
});

