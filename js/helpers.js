// ---------- shared helpers ----------
/**
 * Great-circle distance between two {lat,lon} points, in meters.
 * This is the standard "haversine formula" — it accounts for the
 * Earth's curvature, so it stays accurate at any distance (unlike a
 * flat Pythagorean approximation, which breaks down over long spans).
 */
function haversine(a,b){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
let unitSystem = 'metric'; // metric | imperial
function fmtDist(m){
  if(unitSystem==='imperial'){
    const ft = m * 3.28084;
    return ft < 1000 ? Math.round(ft) + ' ft' : (m/1609.344).toFixed(2) + ' mi';
  }
  return m<1000 ? Math.round(m)+' m' : (m/1000).toFixed(2)+' km';
}

/**
 * Initial compass bearing (0-360°, 0 = North) to travel from point a
 * to point b in a straight line. This is what powers the "head 30° NE"
 * direction guidance — it's pure GPS math, not a device compass sensor,
 * so it works the same whether the location is real GPS or simulated.
 */
function bearing(a,b){
  const toRad=d=>d*Math.PI/180, toDeg=r=>r*180/Math.PI;
  const phi1=toRad(a.lat), phi2=toRad(b.lat), dLambda=toRad(b.lon-a.lon);
  const y = Math.sin(dLambda)*Math.cos(phi2);
  const x = Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(dLambda);
  return (toDeg(Math.atan2(y,x)) + 360) % 360;
}
function compassAbbrev(deg){
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg/22.5) % 16];
}
function fmtBearing(deg){
  return Math.round(deg) + '° ' + compassAbbrev(deg);
}

