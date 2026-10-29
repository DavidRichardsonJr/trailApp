// ---------- MODE SWITCHING ----------
const modeNotes = {
  grid: 'Self-drawn coordinate grid. Always works, no internet needed.',
  image: 'Overlay markers on your own uploaded trail map image.',
  tiles: 'Free OpenStreetMap tiles. Requires internet access.',
  google: 'Real Google Maps. Requires your own API key.'
};
document.querySelectorAll('.mode-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.mode-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    mapMode = tab.getAttribute('data-mode');
    document.getElementById('mode-note').textContent = modeNotes[mapMode];
    document.getElementById('image-controls').style.display = mapMode==='image' ? 'block' : 'none';
    document.getElementById('tiles-controls').style.display = mapMode==='tiles' ? 'block' : 'none';
    document.getElementById('google-controls').style.display = mapMode==='google' ? 'block' : 'none';
    document.getElementById('gap-panel-section').style.display = (mapMode==='image' || mapMode==='tiles' || mapMode==='grid') ? 'block' : 'none';

    document.getElementById('mapsvg').style.display = mapMode==='grid' ? 'block' : 'none';
    document.getElementById('leaflet-map').style.display = mapMode==='tiles' ? 'block' : 'none';
    document.getElementById('image-stage').style.display = mapMode==='image' ? 'block' : 'none';
    document.getElementById('google-map').style.display = mapMode==='google' ? 'block' : 'none';

    document.getElementById('map-empty').style.display = 'none';
    document.getElementById('map-empty').textContent = 'Load posts to generate the map — it draws itself from your GPS data.';
    if(posts.length===0){
      document.getElementById('map-empty').style.display = 'flex';
    } else if(mapMode==='image' && !mapImageLoaded){
      document.getElementById('map-empty').textContent = 'Upload your trail map image in the sidebar to begin.';
      document.getElementById('map-empty').style.display = 'flex';
    } else if(mapMode==='google' && !googleReady){
      document.getElementById('map-empty').textContent = 'Paste your Google Maps API key in the sidebar and click "Load Google Maps".';
      document.getElementById('map-empty').style.display = 'flex';
    }

    if(mapMode==='grid') renderGrid();
    if(mapMode==='tiles') renderTiles();
    if(mapMode==='image') renderImageMarkers();
    if(mapMode==='google') renderGoogle();
  });
});

