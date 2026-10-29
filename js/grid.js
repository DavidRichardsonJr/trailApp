// ---------- GRID MODE ----------
function pinPath(px,py){
  const w=14*msc(),h=18*msc(), top=py-h;
  return `${px},${top} ${px+w/2},${top+h*0.15} ${px+w/2},${py} ${px-w/2},${py} ${px-w/2},${top+h*0.15}`;
}
/**
 * Computes a simple linear lat/lon -> pixel-coordinate mapping for the
 * Grid map, sized to fit all currently loaded posts with a 10% margin.
 * This is NOT a real map projection (like Mercator) — it's a flat
 * scale-and-offset, which is fine for a schematic view of a small trail
 * area but would visibly distort over a very large geographic range.
 */
function buildProjection(){
  let lats = posts.map(p=>p.lat), lons = posts.map(p=>p.lon);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLon = Math.min(...lons), maxLon = Math.max(...lons);
  if(minLat===maxLat){ minLat-=0.003; maxLat+=0.003; }
  if(minLon===maxLon){ minLon-=0.003; maxLon+=0.003; }
  const spanLat = maxLat-minLat, spanLon = maxLon-minLon;
  minLat -= spanLat*0.1; maxLat += spanLat*0.1;
  minLon -= spanLon*0.1; maxLon += spanLon*0.1;
  return { bounds:{minLat,maxLat,minLon,maxLon},
    toXY(lat,lon){
      const x = PAD + (lon-minLon)/(maxLon-minLon) * (W-2*PAD);
      const y = PAD + (maxLat-lat)/(maxLat-minLat) * (H-2*PAD);
      return [x,y];
    }};
}
// Same gap-analysis rendering as My Map / OSM Tiles, but using Grid mode's
// own self-contained projection (no calibration needed — it's already
// resolution-independent). Returns an SVG string to splice into renderGrid().
function renderGridGaps(project){
  const summaryEl = document.getElementById('gap-summary');
  if(!gapAnalysisOn || posts.length < 2){
    if(summaryEl) summaryEl.textContent = '';
    return '';
  }
  const { segments, total } = computeGapStats();
  if(gapThresholdMeters === null){
    gapThresholdMeters = computeGapStats().average * 1.5;
    document.getElementById('gap-threshold').value = gapThresholdDisplayValue();
  }
  function seg(ax,ay,bx,by,color,bold,label){
    const halo = bold?9:7, lw = bold?5:3.2;
    let s = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#FFFFFF" stroke-width="${halo}" stroke-linecap="round"/>`;
    s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${lw}" stroke-linecap="round"/>`;
    if(label && gapLabelsOn){
      const mx=(ax+bx)/2, my=(ay+by)/2;
      s += `<g><rect x="${mx-22}" y="${my-9}" width="44" height="18" fill="${color}" stroke="#FFFFFF" stroke-width="1" rx="3"/><text x="${mx}" y="${my+4.5}" font-size="10" font-weight="700" text-anchor="middle" fill="#FFFFFF" font-family="IBM Plex Mono, monospace">${label}</text></g>`;
    }
    return s;
  }
  let flaggedCount = 0, out = '';
  segments.forEach(sgm=>{
    const [ax,ay] = project.toXY(sgm.a.lat, sgm.a.lon);
    const [bx,by] = project.toXY(sgm.b.lat, sgm.b.lon);
    const isGap = sgm.distanceMeters > gapThresholdMeters;
    if(isGap) flaggedCount++;
    out += seg(ax,ay,bx,by, isGap?'#E67E22':'#C1502E', isGap, fmtDist(sgm.distanceMeters));
  });
  const { segments: hl } = computeHighlightSegments();
  hl.forEach(sgm=>{
    const [ax,ay] = project.toXY(sgm.a.lat, sgm.a.lon);
    const [bx,by] = project.toXY(sgm.b.lat, sgm.b.lon);
    out += seg(ax,ay,bx,by, '#1565C0', true, fmtDist(sgm.distanceMeters));
  });

  // Info box drawn directly on the map (bottom-left), instead of the sidebar.
  const lines = gapSummaryLines(total, flaggedCount, hl);
  const boxH = 18 + lines.length*20;
  out += `<g>
    <rect x="${PAD}" y="${H-PAD-boxH}" width="230" height="${boxH}" fill="rgba(255,255,255,0.94)" stroke="#16302A" stroke-width="1" rx="4"/>
    ${lines.map((line,i)=>`<text x="${PAD+10}" y="${H-PAD-boxH+18+i*20}" font-size="12" font-weight="${i===0?'700':'500'}" fill="${i===2?'#1565C0':'#16302A'}" font-family="IBM Plex Mono, monospace">${line}</text>`).join('')}
  </g>`;
  if(summaryEl) summaryEl.textContent = ''; // shown on the map itself now, not the sidebar
  return out;
}

function renderGrid(){
  const svg = document.getElementById('mapsvg');
  if(posts.length===0){ svg.innerHTML=''; return; }
  const project = buildProjection();
  const b = project.bounds;
  let parts = [];
  const T = THEMES[currentTheme];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${T.parchment}"/>`);
  parts.push(`<g stroke="${T.contour}" stroke-width="1.5" fill="none" opacity="0.6">
    <path d="M -50 150 Q 250 80 550 180 T 1050 140"/>
    <path d="M -50 320 Q 300 260 600 340 T 1050 300"/>
    <path d="M -50 500 Q 280 430 560 510 T 1050 470"/>
  </g>`);
  const cols=6, rows=5;
  let gridLines = [];
  for(let i=0;i<=cols;i++){
    const x = PAD + i*(W-2*PAD)/cols;
    const lon = b.minLon + i*(b.maxLon-b.minLon)/cols;
    gridLines.push(`<line x1="${x}" y1="${PAD}" x2="${x}" y2="${H-PAD}" stroke="${T.gridline}" stroke-width="1" opacity="0.5"/>`);
    gridLines.push(`<text x="${x}" y="${H-PAD+18}" text-anchor="middle" font-size="10" fill="${T.border}">${lon.toFixed(4)}</text>`);
  }
  for(let j=0;j<=rows;j++){
    const y = PAD + j*(H-2*PAD)/rows;
    const lat = b.maxLat - j*(b.maxLat-b.minLat)/rows;
    gridLines.push(`<line x1="${PAD}" y1="${y}" x2="${W-PAD}" y2="${y}" stroke="${T.gridline}" stroke-width="1" opacity="0.5"/>`);
    gridLines.push(`<text x="${PAD-8}" y="${y+3}" text-anchor="end" font-size="10" fill="${T.border}">${lat.toFixed(4)}</text>`);
  }
  parts.push(`<g>${gridLines.join('')}</g>`);
  parts.push(`<rect x="${PAD}" y="${PAD}" width="${W-2*PAD}" height="${H-2*PAD}" fill="none" stroke="${T.border}" stroke-width="1.5"/>`);
  if(posts.length>1 && !gapAnalysisOn){
    const pts = posts.map(p=>project.toXY(p.lat,p.lon).join(',')).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${T.orange}" stroke-width="3" stroke-dasharray="7,7" opacity="0.6"/>`);
  }
  parts.push(renderGridGaps(project));
  posts.forEach(p=>{
    const [x,y] = project.toXY(p.lat,p.lon);
    const baseColor = markerBaseColorCss(p);
    const textColor = markerTextColorCss(p);
    const shape = getActionShape(p);
    const s = 14*msc(), r = 7*msc();
    let shapeSvg;
    if(shape==='square'){
      shapeSvg = `<rect class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" x="${x-s/2}" y="${y-s}" width="${s}" height="${s}" rx="2" stroke="white" stroke-width="1"/>`;
    } else if(shape==='circle'){
      shapeSvg = `<circle class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" cx="${x}" cy="${y-r}" r="${r}" stroke="white" stroke-width="1"/>`;
    } else if(shape==='cross'){
      shapeSvg = `<polygon class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" points="${crossPoints(x,y-r,r,2.6*msc())}" stroke="white" stroke-width="1"/>`;
    } else if(shape==='triangle'){
      shapeSvg = `<polygon class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" points="${x},${y-s} ${x+s*0.57},${y} ${x-s*0.57},${y}" stroke="white" stroke-width="1"/>`;
    } else if(shape==='diamond'){
      shapeSvg = `<polygon class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" points="${x},${y-s} ${x+r},${y-r} ${x},${y} ${x-r},${y-r}" stroke="white" stroke-width="1"/>`;
    } else {
      shapeSvg = `<polygon class="pin" data-base-fill="${baseColor}" style="fill:${baseColor}" points="${pinPath(x,y)}"/>`;
    }
    const fontSize = 8.5*msc();
    parts.push(`<g class="post-marker" data-id="${p.id}">${shapeSvg}<text x="${x}" y="${y-6.5*msc()}" data-base-fill="${textColor}" style="fill:${textColor};font-size:${fontSize}px">${p.id}</text></g>`);
  });
  if(myLocation){
    const [lx,ly] = project.toXY(myLocation.lat, myLocation.lon);
    parts.push(`<circle cx="${lx}" cy="${ly}" r="12" fill="${LOC_COLOR}" opacity="0.2"/><circle cx="${lx}" cy="${ly}" r="6" fill="${LOC_COLOR}" stroke="#fff" stroke-width="2"/>`);
  }
  svg.innerHTML = parts.join('');
  svg.querySelectorAll('.post-marker').forEach(el=> el.addEventListener('click', ()=> selectPost(el.getAttribute('data-id'))));
  const markersToggle = document.getElementById('markers-visible-toggle');
  svg.classList.toggle('hide-pins', markersToggle ? !markersToggle.checked : false);
}

