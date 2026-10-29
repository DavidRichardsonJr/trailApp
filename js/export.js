// ---------- DOWNLOAD MAP / MARKER LIST ----------
function triggerDownload(url, filename){
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function drawMarkerOnCanvas(ctx, px, py, post, size){
  const color = markerBaseColorHex(post);
  const shape = getActionShape(post);
  const textColor = markerTextColorCss(post);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, size*0.08);
  let labelY;
  if(shape==='square'){
    ctx.beginPath(); ctx.rect(px-size/2, py-size, size, size); ctx.fill(); ctx.stroke();
    labelY = py-size/2;
  } else if(shape==='circle'){
    ctx.beginPath(); ctx.arc(px, py-size/2, size/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    labelY = py-size/2;
  } else if(shape==='triangle'){
    ctx.beginPath(); ctx.moveTo(px, py-size); ctx.lineTo(px+size*0.55, py); ctx.lineTo(px-size*0.55, py); ctx.closePath(); ctx.fill(); ctx.stroke();
    labelY = py-size*0.4;
  } else if(shape==='diamond'){
    ctx.beginPath(); ctx.moveTo(px, py-size); ctx.lineTo(px+size/2, py-size/2); ctx.lineTo(px, py); ctx.lineTo(px-size/2, py-size/2); ctx.closePath(); ctx.fill(); ctx.stroke();
    labelY = py-size/2;
  } else {
    const w=size*0.85, h=size;
    ctx.beginPath();
    ctx.moveTo(px, py-h);
    ctx.lineTo(px+w/2, py-h+h*0.15);
    ctx.lineTo(px+w/2, py);
    ctx.lineTo(px-w/2, py);
    ctx.lineTo(px-w/2, py-h+h*0.15);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    labelY = py-h*0.42;
  }
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(size*0.42)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(post.id), px, labelY);
  ctx.restore();
}

function resolveSvgVars(svgString){
  const cs = getComputedStyle(document.body);
  const vars = ['--brown','--orange','--accent-text','--parchment','--line','--forest'];
  let out = svgString;
  vars.forEach(v=>{
    const val = cs.getPropertyValue(v).trim();
    if(val){
      const re = new RegExp('var\\('+v+'\\)', 'g');
      out = out.replace(re, val);
    }
  });
  return out;
}

function downloadGridImage(){
  const svg = document.getElementById('mapsvg');
  const svgData = resolveSvgVars(new XMLSerializer().serializeToString(svg));
  const canvas = document.createElement('canvas');
  canvas.width = 2000; canvas.height = 1400; // 2x resolution for a crisp printable export
  const ctx = canvas.getContext('2d');
  const svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = ()=>{
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    triggerDownload(canvas.toDataURL('image/png'), 'trail-map-grid.png');
    document.getElementById('download-status').textContent = 'Downloaded.';
  };
  img.onerror = ()=>{ document.getElementById('download-status').textContent = 'Could not render the map image.'; };
  img.src = url;
}

function downloadImageModeComposite(){
  const statusEl = document.getElementById('download-status');
  if(!mapImageLoaded){ statusEl.textContent = 'Upload a map image first.'; return; }
  if(!calib.p1 || !calib.p2){ statusEl.textContent = 'Calibrate the map first so markers can be placed.'; return; }
  const img = document.getElementById('map-img');
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  function finishComposite(){
    const size = Math.max(18, Math.min(70, Math.max(canvas.width, canvas.height) * 0.014));
    if(document.getElementById('markers-visible-toggle')?.checked !== false){
      posts.forEach(p=>{
        const xPercent = calib.p1.xPercent + (p.lon-calib.p1.lon)*(calib.p2.xPercent-calib.p1.xPercent)/(calib.p2.lon-calib.p1.lon);
        const yPercent = calib.p1.yPercent + (p.lat-calib.p1.lat)*(calib.p2.yPercent-calib.p1.yPercent)/(calib.p2.lat-calib.p1.lat);
        drawMarkerOnCanvas(ctx, xPercent/100*canvas.width, yPercent/100*canvas.height, p, size);
      });
    }
    try{
      triggerDownload(canvas.toDataURL('image/png'), 'trail-map-with-markers.png');
      statusEl.textContent = 'Downloaded.';
    } catch(err){
      statusEl.textContent = 'Could not export this image (browser security restriction).';
    }
  }

  // If the gap-analysis overlay is on, rasterize that SVG layer onto the
  // canvas too, BEFORE the markers — otherwise a downloaded image would be
  // missing the red/blue lines and distance labels entirely, which used to
  // be a real gap in this export (fixed here).
  const gapSvg = document.getElementById('image-lines');
  if(gapAnalysisOn && gapSvg && gapSvg.innerHTML.trim()){
    const svgData = resolveSvgVars(new XMLSerializer().serializeToString(gapSvg));
    const svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    const overlayImg = new Image();
    overlayImg.onload = ()=>{
      ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      finishComposite();
    };
    overlayImg.onerror = ()=>{
      URL.revokeObjectURL(url);
      finishComposite(); // still export the base image + markers even if the overlay fails
    };
    overlayImg.src = url;
  } else {
    finishComposite();
  }
}

function downloadMarkerListCSV(){
  const statusEl = document.getElementById('download-status');
  if(posts.length===0){ statusEl.textContent = 'No posts loaded yet.'; return; }
  const hasAction = posts.some(p=>p.action);
  const header = hasAction ? 'id,lat,lon,name,action' : 'id,lat,lon,name';
  const rows = posts.map(p=>{
    const cells = [p.id, p.lat, p.lon, `"${(p.name||'').replace(/"/g,'""')}"`];
    if(hasAction) cells.push(`"${(p.action||'').replace(/"/g,'""')}"`);
    return cells.join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'trail-markers.csv');
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  statusEl.textContent = posts.length + ' marker(s) exported.';
}

document.getElementById('download-map-btn').addEventListener('click', ()=>{
  const statusEl = document.getElementById('download-status');
  statusEl.textContent = '';
  if(posts.length===0){ statusEl.textContent = 'Load posts first.'; return; }
  if(mapMode==='grid'){
    downloadGridImage();
  } else if(mapMode==='image'){
    downloadImageModeComposite();
  } else {
    statusEl.textContent = 'Live map tiles (OSM/Google) can\'t be exported as an image here — that\'s a licensing/technical restriction from those map providers, not something this app can bypass. Switch to "Grid" or "My Map" mode to download an image, or use "Download marker list (CSV)" below.';
  }
});

document.getElementById('download-csv-btn').addEventListener('click', downloadMarkerListCSV);

