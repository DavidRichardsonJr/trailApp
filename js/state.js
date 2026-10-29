/* =====================================================================
   WAYPOINT GRID — Trail Marker Navigation Network
   =====================================================================
   WHAT THIS APP DOES
   A hiker (or park manager) uploads a CSV of numbered trail-post
   locations (id, latitude, longitude, optional name/action). The app
   plots those posts on a map so a hiker standing at a physical post
   can confirm their exact location, and can find/navigate to any
   other post.

   HOW THE CODE IS ORGANIZED (search for these section banners below)
   1. GLOBAL STATE            — the few variables everything else reads/writes
   2. ROBUST CSV PARSING      — turns messy real-world CSV text into `posts`
   3. MANAGEMENT VIEW         — staff-only color/shape coding by action type
   4. GRID MODE               — self-drawn SVG map (no internet needed)
   5. IMAGE MODE              — overlay markers on an uploaded map photo
   6. ROUTE SNAPPING          — OSRM walking-route lookup (OSM Tiles mode)
   7. GOOGLE MAPS MODE        — optional, needs the user's own API key
   8. MODE SWITCHING          — show/hide the right map for the active tab
   9. MY LOCATION             — device GPS + "simulate a position" for demo
   10. SELECT / DESELECT       — clicking a marker highlights it everywhere
   11. DOWNLOAD                — export the map as PNG / posts as CSV
   12. EVENT WIRING            — all addEventListener calls, at the bottom

   KEY DESIGN IDEA: ONE SOURCE OF TRUTH
   `posts` is the single array every map mode reads from. Uploading a
   CSV, loading demo data, or editing calibration all just update
   `posts` (or `calib`) and then call the render function for whichever
   map mode is currently on screen. No map mode "owns" the data.
   ===================================================================== */

let posts = [];
let activeId = null;
let mapMode = 'grid'; // grid | image | tiles | google
let gapAnalysisOn = false;
let gapThresholdMeters = null; // null = not yet auto-computed
let gapLabelsOn = true;
let markerLarge = false;
function msc(){ return markerLarge ? 1.55 : 1; } // marker scale multiplier
let currentTheme = 'technical';

