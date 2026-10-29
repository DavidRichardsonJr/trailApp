// ---------- STARTUP: auto-load baked-in posts + QR-code deep linking ----------
// If this deployed copy has real post data baked in (via "Download updated
// app file"), load it immediately — a visitor who scans a QR code or clicks
// a link should see the real map right away, never an empty "upload a CSV"
// screen. If the URL includes ?post=ID (e.g. from a QR code at a specific
// physical post), that post is automatically selected once data is ready.
(function startup(){
  try {
    const baked = JSON.parse(document.getElementById('posts-config').textContent);
    if(Array.isArray(baked) && baked.length > 0){
      loadPosts({ posts: baked, warnings: [baked.length + ' posts loaded automatically from this deployment.'] });

      const params = new URLSearchParams(window.location.search);
      const wantedId = params.get('post');
      if(wantedId){
        const match = posts.find(p => p.id === wantedId);
        if(match){
          selectPost(match.id);
        } else {
          const statusEl = document.getElementById('file-status');
          if(statusEl) statusEl.innerHTML += `<br><b style="color:#C0392B;">Note:</b> link pointed to post "${wantedId}", which isn't in this dataset.`;
        }
      }
    }
  } catch(e) {
    console.error('Startup auto-load failed:', e);
  }
})();
