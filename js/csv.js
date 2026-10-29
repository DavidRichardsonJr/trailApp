// ---------- ROBUST CSV PARSING ----------
const ID_KEYS   = ['id','number','num','post','marker','postnumber','post_number','postno','wp','waypoint','#'];
const LAT_KEYS  = ['lat','latitude','y'];
const LON_KEYS  = ['lon','lng','long','longitude','x'];
const NAME_KEYS = ['name','desc','description','notes','note','title','label'];
const ACTION_KEYS = ['action','status','task','worktype','work','category'];
// Real trail marker NUMBERS often don't match the actual WALKING order —
// crews number posts by section, install date, etc., not by path sequence.
// An optional "sequence"/"order"/"trailorder" column lets a CSV state the
// true walking order explicitly, separate from the marker's own ID.
const SEQUENCE_KEYS = ['sequence','seq','order','trailorder','walkorder','pathorder'];
// Optional "group"/"segment" column: posts sharing the same group value are
// connected to each other (in sequence order) for gap analysis, but posts
// in DIFFERENT groups are never connected — for highlighting several
// separate, unrelated stretches of trail rather than one continuous chain.
const GROUP_KEYS = ['group','segment','cluster','trailsegment','pair'];
// Optional "highlight to" column: draws an EXPLICIT extra connecting line
// straight from this post to the named post, bold and in a distinct color,
// regardless of the normal trail sequence/group. For calling out specific
// known segments (e.g. "new marker covers this exact gap") independent of
// the general-purpose sequence/threshold-based gap analysis.
const HIGHLIGHT_TO_KEYS = ['highlightto','connectto','gapto','pairto','linkto'];

function detectDelimiter(line){
  const counts = { ',': (line.match(/,/g)||[]).length, ';': (line.match(/;/g)||[]).length, '\t': (line.match(/\t/g)||[]).length };
  let best = ',', bestCount = -1;
  for(const d in counts){ if(counts[d] > bestCount){ bestCount = counts[d]; best = d; } }
  return bestCount > 0 ? best : ',';
}

function splitCSVLine(line, delim){
  const result = [];
  let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQuotes){
      if(ch === '"'){
        if(line[i+1] === '"'){ cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if(ch === '"'){ inQuotes = true; }
      else if(ch === delim){ result.push(cur.trim()); cur=''; }
      else { cur += ch; }
    }
  }
  result.push(cur.trim());
  return result;
}

function headerWords(cell){
  return cell.toLowerCase().split(/[^a-z0-9#]+/).filter(Boolean);
}
function hasAny(words, keys){ return words.some(w => keys.includes(w)); }

/**
 * Given a CSV header row (already split into cells), figures out which
 * column is latitude, longitude, id, name, and action — by matching
 * individual words in each header (case-insensitive), not exact whole-
 * string matches. This is why "GPS Lat" and "Marker ID" both work even
 * though neither is an exact match for "lat" or "id".
 * @returns column-index map, or null if no lat+lon columns were found
 *          (caller then falls back to assuming column position).
 */
function matchHeaderColumns(cells){
  let idIdx=-1, latIdx=-1, lonIdx=-1, nameIdx=-1, actionIdx=-1, sequenceIdx=-1, groupIdx=-1, highlightToIdx=-1;
  cells.forEach((cell,i)=>{
    const words = headerWords(cell);
    if(latIdx===-1 && hasAny(words, LAT_KEYS)) latIdx=i;
    else if(lonIdx===-1 && hasAny(words, LON_KEYS)) lonIdx=i;
    else if(idIdx===-1 && hasAny(words, ID_KEYS)) idIdx=i;
    else if(nameIdx===-1 && hasAny(words, NAME_KEYS)) nameIdx=i;
    else if(actionIdx===-1 && hasAny(words, ACTION_KEYS)) actionIdx=i;
    else if(sequenceIdx===-1 && hasAny(words, SEQUENCE_KEYS)) sequenceIdx=i;
    else if(groupIdx===-1 && hasAny(words, GROUP_KEYS)) groupIdx=i;
    else if(highlightToIdx===-1 && hasAny(words, HIGHLIGHT_TO_KEYS)) highlightToIdx=i;
  });
  if(latIdx!==-1 && lonIdx!==-1) return {idIdx,latIdx,lonIdx,nameIdx,actionIdx,sequenceIdx,groupIdx,highlightToIdx, byHeader:true};
  return null;
}

/**
 * The main CSV-to-posts pipeline. Handles real-world messy files:
 * auto-detects the delimiter (comma/semicolon/tab), strips a BOM
 * character some spreadsheet exports add, matches columns by header
 * name with a positional fallback if there's no header, auto-corrects
 * an obviously swapped lat/lon column, and collects human-readable
 * warnings about anything it had to guess or skip.
 * @param {string} text - raw file contents or pasted text
 * @returns {{posts: Array, warnings: string[]}}
 */
function parseCSV(text){
  const warnings = [];
  text = text.replace(/^\uFEFF/, ''); // strip BOM if present
  const rawLines = text.split(/\r?\n/).map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim().length>0);
  if(rawLines.length===0) return { posts:[], warnings:['File appears empty.'] };

  const delim = detectDelimiter(rawLines[0]);
  const rows = rawLines.map(l=>splitCSVLine(l, delim));

  let colMap = matchHeaderColumns(rows[0]);
  let dataRows;
  if(colMap){
    dataRows = rows.slice(1);
  } else {
    const ncols = rows[0].length;
    if(ncols>=4) colMap = {idIdx:0, latIdx:1, lonIdx:2, nameIdx:3, actionIdx:-1, sequenceIdx:-1, groupIdx:-1, highlightToIdx:-1, byHeader:false};
    else if(ncols===3) colMap = {idIdx:0, latIdx:1, lonIdx:2, nameIdx:-1, actionIdx:-1, sequenceIdx:-1, groupIdx:-1, highlightToIdx:-1, byHeader:false};
    else if(ncols===2) colMap = {idIdx:-1, latIdx:0, lonIdx:1, nameIdx:-1, actionIdx:-1, sequenceIdx:-1, groupIdx:-1, highlightToIdx:-1, byHeader:false};
    else return { posts:[], warnings:['Could not find at least two columns of data — need latitude and longitude at minimum.'] };
    // if row 0 doesn't look numeric where lat/lon are expected, it was probably an unrecognized header row — skip it
    const t1 = parseFloat(rows[0][colMap.latIdx]), t2 = parseFloat(rows[0][colMap.lonIdx]);
    if(isNaN(t1) || isNaN(t2)) dataRows = rows.slice(1);
    else dataRows = rows;
  }

  const out = [];
  let autoId = 1, skipped = 0, swapped = 0, sequenceCount = 0, groupCount = 0, highlightCount = 0;
  let sampleSkipped = null, sampleHeader = null;
  dataRows.forEach(cells=>{
    if(cells.every(c=>c==='')) return;
    const latRaw = colMap.latIdx>=0 ? cells[colMap.latIdx] : undefined;
    const lonRaw = colMap.lonIdx>=0 ? cells[colMap.lonIdx] : undefined;
    let lat = parseFloat((latRaw||'').replace(',','.'));
    let lon = parseFloat((lonRaw||'').replace(',','.'));
    if(isNaN(lat) || isNaN(lon)){ skipped++; if(!sampleSkipped) sampleSkipped = cells.join(', '); return; }
    if(Math.abs(lat) > 90 && Math.abs(lon) <= 90){ const tmp=lat; lat=lon; lon=tmp; swapped++; }
    if(Math.abs(lat) > 90 || Math.abs(lon) > 180){ skipped++; if(!sampleSkipped) sampleSkipped = cells.join(', '); return; }
    const id = (colMap.idIdx>=0 && cells[colMap.idIdx]) ? cells[colMap.idIdx] : String(autoId);
    const name = (colMap.nameIdx>=0 && cells[colMap.nameIdx]) ? cells[colMap.nameIdx] : ('Post ' + id);
    const action = (colMap.actionIdx>=0 && cells[colMap.actionIdx]) ? cells[colMap.actionIdx].trim() : '';
    // "sequence" is OPTIONAL and separate from id — it's the true walking
    // order along the trail, since real marker numbers often don't match
    // the physical path order (see SEQUENCE_KEYS comment above).
    let sequence = null;
    if(colMap.sequenceIdx>=0 && cells[colMap.sequenceIdx] !== ''){
      const sv = parseFloat(cells[colMap.sequenceIdx]);
      if(!isNaN(sv)){ sequence = sv; sequenceCount++; }
    }
    const group = (colMap.groupIdx>=0 && cells[colMap.groupIdx] !== '') ? cells[colMap.groupIdx].trim() : null;
    if(group !== null) groupCount++;
    const highlightTo = (colMap.highlightToIdx>=0 && cells[colMap.highlightToIdx] !== '') ? cells[colMap.highlightToIdx].trim() : null;
    if(highlightTo !== null) highlightCount++;
    out.push({ id, lat, lon, name, action, sequence, group, highlightTo });
    autoId++;
  });

  const delimName = delim===',' ? 'comma' : delim===';' ? 'semicolon' : 'tab';
  const colInfo = colMap.byHeader ? 'columns matched by header name' : 'columns assumed by position';
  const colDetail = `(id: ${colMap.idIdx>=0?'col '+(colMap.idIdx+1):'auto-numbered'}, lat: col ${colMap.latIdx+1}, lon: col ${colMap.lonIdx+1}, name: ${colMap.nameIdx>=0?'col '+(colMap.nameIdx+1):'auto'}${colMap.actionIdx>=0?', action: col '+(colMap.actionIdx+1):''}${colMap.sequenceIdx>=0?', sequence: col '+(colMap.sequenceIdx+1):''}${colMap.groupIdx>=0?', group: col '+(colMap.groupIdx+1):''})`;
  if(sequenceCount > 0){
    warnings.push(`Found a walking-order "sequence" column (${sequenceCount} value(s)) \u2014 gap analysis and trail order will use this instead of sorting by marker ID.`);
  }
  if(groupCount > 0){
    warnings.push(`Found a "group" column (${groupCount} value(s)) \u2014 gap analysis will only connect posts within the SAME group, not across different groups.`);
  }
  if(highlightCount > 0){
    warnings.push(`Found a "highlight to" column (${highlightCount} value(s)) \u2014 those specific connections will be drawn bold, on top of everything else, regardless of the normal trail order.`);
  }
  warnings.push(`Read ${dataRows.length} data row(s). ${colInfo} ${colDetail}, ${delimName}-delimited.`);
  if(skipped>0){
    warnings.push(`${skipped} row(s) skipped — could not read valid coordinates there.`);
    if(sampleSkipped) warnings.push(`Example skipped row: "${sampleSkipped}"`);
  }
  if(swapped>0) warnings.push(swapped + ' row(s) had lat/lon swapped — auto-corrected.');

  return { posts: out, warnings };
}
function naturalSort(a,b){
  const na = parseFloat(a.id), nb = parseFloat(b.id);
  if(!isNaN(na) && !isNaN(nb)) return na-nb;
  return String(a.id).localeCompare(String(b.id), undefined, {numeric:true});
}
function loadPosts(result){
  const newPosts = result.posts || [];
  const warnings = result.warnings || [];
  const statusEl = document.getElementById('file-status');
  statusEl.classList.remove('error','ok');
  if(newPosts.length===0){
    statusEl.classList.add('error');
    statusEl.innerHTML = '<b>No valid posts could be parsed.</b><br>' + warnings.join('<br>');
    return;
  }
  posts = newPosts.sort(naturalSort);
  statusEl.classList.add('ok');
  statusEl.innerHTML = `<b>${posts.length} posts loaded.</b><br>` + warnings.join('<br>');
  gapThresholdMeters = null; // recompute a sensible default for this dataset
  // Keep the baked-in config tag in sync with whatever's loaded, so this
  // stays accurate if the page/file itself is ever saved for redistribution.
  document.getElementById('posts-config').textContent = JSON.stringify(
    posts.map(p => ({ id:p.id, lat:p.lat, lon:p.lon, name:p.name, action:p.action||'' }))
  );
  renderAll();
}

