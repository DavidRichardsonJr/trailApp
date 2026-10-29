// ---------- MANAGEMENT VIEW (staff-only action/status color coding) ----------
let managementView = false;
let actionColorMap = {};
const ACTION_PALETTE = ['#2E86AB','#457B9D','#6D6875','#F4A300','#E76F51','#2A9D8F'];
const ACTION_COLOR_OVERRIDES = {
  'install new': '#E63946', // red
  'new install': '#E63946', // red (alt phrasing)
  'replace':     '#00A896', // teal
  'paint':       '#8E44AD'  // purple
};

/**
 * Scans all loaded posts for their `action` field (e.g. "Paint",
 * "Replace"), counts how many posts have each value, and assigns each
 * distinct value a color: a fixed override if we recognize it (see
 * ACTION_COLOR_OVERRIDES), otherwise the next color from a fallback
 * palette. Called every time posts load or Management View is toggled.
 * @returns {{counts: Object, keys: string[]}} counts per action, and
 *          the action names in first-seen order (used for the legend).
 */
function computeActionColors(){
  const counts = {};
  posts.forEach(p=>{
    const a = (p.action||'').trim();
    if(!a) return;
    counts[a] = (counts[a]||0) + 1;
  });
  const keys = Object.keys(counts); // preserves first-seen order
  actionColorMap = {};
  let paletteIdx = 0;
  keys.forEach(k=>{
    const override = ACTION_COLOR_OVERRIDES[k.toLowerCase().trim()];
    if(override){
      actionColorMap[k] = override;
    } else {
      actionColorMap[k] = ACTION_PALETTE[paletteIdx % ACTION_PALETTE.length];
      paletteIdx++;
    }
  });
  return { counts, keys };
}

/** CSS-ready color for a marker's fill (works in inline `style="fill:..."`).
 * Returns the action color if Management View is on and this post has
 * a recognized action; otherwise the theme's default marker color
 * (as a CSS variable, so it re-colors automatically on theme switch). */
function markerBaseColorCss(post){
  if(managementView && post.action && actionColorMap[post.action]) return actionColorMap[post.action];
  return 'var(--brown)';
}
function markerBaseColorHex(post){
  if(managementView && post.action && actionColorMap[post.action]) return actionColorMap[post.action];
  return THEMES[currentTheme].brown;
}

function hexToRgb(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
}
function relativeLuminance({r,g,b}){
  const [R,G,B] = [r,g,b].map(c=>{ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); });
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
function textColorForBg(hex){
  try{ return relativeLuminance(hexToRgb(hex)) > 0.5 ? '#1B232C' : '#ffffff'; }
  catch(e){ return '#ffffff'; }
}
function markerTextColorCss(post){
  if(managementView && post.action && actionColorMap[post.action]) return textColorForBg(actionColorMap[post.action]);
  return '#ffffff';
}

const ACTION_SHAPES = {
  'install new': 'square',
  'new install': 'square',
  'paint': 'circle',
  'replace': 'diamond'
};
function getActionShape(post){
  if(!managementView || !post.action) return null;
  return ACTION_SHAPES[post.action.toLowerCase().trim()] || null;
}
function crossPoints(cx, cy, half, thick){
  return [
    [cx-thick, cy-half],[cx+thick, cy-half],
    [cx+thick, cy-thick],[cx+half, cy-thick],
    [cx+half, cy+thick],[cx+thick, cy+thick],
    [cx+thick, cy+half],[cx-thick, cy+half],
    [cx-thick, cy+thick],[cx-half, cy+thick],
    [cx-half, cy-thick],[cx-thick, cy-thick]
  ].map(p=>p.join(',')).join(' ');
}

function renderMgmtLegend(){
  const el = document.getElementById('mgmt-legend');
  if(!el) return;
  const { counts, keys } = computeActionColors();
  if(keys.length===0){
    el.innerHTML = '<div class="hint">No "Action"/"Status" column detected in the loaded data.</div>';
    return;
  }
  const total = keys.reduce((s,k)=>s+counts[k], 0);
  const swatchHtml = (shape, color) => {
    if(shape==='square') return `<span style="width:12px;height:12px;border-radius:2px;background:${color};flex-shrink:0;"></span>`;
    if(shape==='circle') return `<span style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;"></span>`;
    if(shape==='cross') return `<span style="width:12px;height:12px;flex-shrink:0;background:${color};clip-path:polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%);"></span>`;
    if(shape==='triangle') return `<span style="width:0;height:0;flex-shrink:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid ${color};"></span>`;
    if(shape==='diamond') return `<span style="width:12px;height:12px;flex-shrink:0;background:${color};transform:rotate(45deg);"></span>`;
    return `<span style="width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0;"></span>`;
  };
  el.innerHTML = keys.map(k => {
    const shape = ACTION_SHAPES[k.toLowerCase().trim()] || null;
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;">
      ${swatchHtml(shape, actionColorMap[k])}
      <span style="flex:1;">${k}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;">${counts[k]}</span>
    </div>`;
  }).join('') + `<div class="hint" style="margin-top:4px;">${total} of ${posts.length} marker(s) have an action assigned. Shapes/colors only appear on the map once "Color markers by action type" is checked.</div>`;
}
const THEMES = {
  technical: { parchment:'#E3E7EC', contour:'#C7CED6', gridline:'#B9C2CC', border:'#33465C', brown:'#33465C', orange:'#F2C230', dark:'#0F1B2E' },
  original:  { parchment:'#F0E8D8', contour:'#DAD0B4', gridline:'#C9BC98', border:'#6B4F3B', brown:'#6B4F3B', orange:'#E8562A', dark:'#16302A' }
};
const W = 1000, H = 700, PAD = 70;

