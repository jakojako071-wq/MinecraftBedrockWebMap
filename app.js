(() => {
  const $ = id => document.getElementById(id);
  const API_BASE = String(window.WEBMAP_CONFIG?.API_BASE || "").replace(/\/+$/, "");
  const cfg = window.WEBMAP_CONFIG?.MAP || {};
  const statusNames = { open: "営業中", building: "準備中", paused: "休止中", maintenance: "メンテナンス中" };
  const typeNames = { attraction: "アトラクション", build: "建築", staff: "スタッフ専用", closed: "立入制限", other: "その他" };
  const bounds = L.latLngBounds(cfg.bounds || [[35.615,139.867],[35.640,139.901]]);
  const mapCenter = [Number(cfg.anchorLatitude ?? 35.6272), Number(cfg.anchorLongitude ?? 139.8808)];
  let mapData = { title:"DISNEY RESORT LIVE MAP", status:"paused", message:"API未接続です。", worldName:"オフライン", players:[], zones:[] };
  let lastFetch = null, playerMarkers = new Map(), zoneLayers = new Map();
  const map = L.map('realMap', { zoomControl:true, minZoom:14, maxZoom:19, maxBounds:bounds.pad(0.03), maxBoundsViscosity:0.9 }).setView(mapCenter, Number(cfg.initialZoom || 15));
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    maxZoom:19, noWrap:true
  }).addTo(map);
  L.rectangle(bounds, {color:'#d6a84b', weight:1, opacity:.8, fill:false, dashArray:'5 5', interactive:false}).addTo(map);

  // Calibrated from the user's reference point at Bayside Station.
  // Minecraft X+ = east, Z+ = south; metersPerBlock is approximate.
  function minecraftToLatLng(x,z) {
    const anchorX = Number(cfg.anchorMinecraftX ?? 406);
    const anchorZ = Number(cfg.anchorMinecraftZ ?? 1246);
    const anchorLat = Number(cfg.anchorLatitude ?? 35.6279);
    const anchorLon = Number(cfg.anchorLongitude ?? 139.8764);
    const scale = Number(cfg.metersPerBlock ?? 1);
    const lat = anchorLat - ((Number(z) - anchorZ) * scale / 111320);
    const lon = anchorLon + ((Number(x) - anchorX) * scale / (111320 * Math.cos(anchorLat * Math.PI / 180)));
    return [lat, lon];
  }
  function pointInPolygon(x, z, points) {
    if (!Array.isArray(points) || points.length < 3) return true;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = Number(points[i].x), zi = Number(points[i].z);
      const xj = Number(points[j].x), zj = Number(points[j].z);
      const crosses = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function inScope(p) {
    if (!p || (p.dimension && p.dimension !== 'minecraft:overworld')) return false;
    // Keep all Overworld players visible during setup; the six control points are not yet a calibrated polygon.
    return true;
  }
  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type":"application/json", ...(options.headers || {}) }, cache:"no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }
  function setConnection(ok, text) { const el=$('connection'); el.textContent=text; el.className=`pill ${ok?'ok':'warn'}`; }
  function renderPlayers() {
    const visible = (mapData.players || []).filter(inScope);
    const visibleIds = new Set(visible.map(p => String(p.id || p.name)));
    for (const [id, marker] of playerMarkers) if (!visibleIds.has(id)) { map.removeLayer(marker); playerMarkers.delete(id); }
    visible.forEach(p => {
      const id=String(p.id || p.name), ll=minecraftToLatLng(p.x,p.z);
      const icon=L.divIcon({className:'player-marker-wrap',html:`<div style="width:18px;height:18px;border-radius:50%;background:#246bfe;border:3px solid white;box-shadow:0 1px 7px #182b49;position:relative"><span style="position:absolute;left:16px;top:-5px;white-space:nowrap;color:#fff;font-size:12px;font-weight:700;text-shadow:-1px -1px 2px #111,1px 1px 2px #111">${escapeHtml(p.name || 'Player')}</span></div>`,iconSize:[18,18],iconAnchor:[9,9]});
      let marker=playerMarkers.get(id);
      if (!marker) { marker=L.marker(ll,{icon,title:p.name||'Player'}).addTo(map); playerMarkers.set(id,marker); }
      else marker.setLatLng(ll).setIcon(icon);
      marker.bindPopup(`<strong>${escapeHtml(p.name || 'Player')}</strong><br>X ${Math.round(p.x)} · Y ${Math.round(p.y)} · Z ${Math.round(p.z)}`);
    });
    $('playerCount').textContent=String(visible.length); $('playerCountSmall').textContent=String(visible.length);
    $('playerList').innerHTML='';
    if (!visible.length) $('playerList').innerHTML='<p class="muted">リゾート内に表示対象のプレイヤーはいません。</p>';
    visible.forEach(p=>{
      const el=document.createElement('div');el.className='player-item';
      const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=(p.name||'?').slice(0,1);
      const meta=document.createElement('div');meta.className='player-meta';
      const name=document.createElement('strong');name.textContent=p.name||'Player';
      const coords=document.createElement('small');coords.textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)} · Z ${Math.round(p.z)}`;
      meta.append(name,coords);el.append(avatar,meta);el.style.cursor='pointer';el.addEventListener('click',()=>map.setView(minecraftToLatLng(p.x,p.z),Math.max(map.getZoom(),17)));$('playerList').append(el);
    });
  }
  function escapeHtml(v) { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function renderZones() {
    for (const layer of zoneLayers.values()) map.removeLayer(layer); zoneLayers.clear();
    $('zoneList').innerHTML='';
    (mapData.zones||[]).forEach(z=>{
      const a=minecraftToLatLng(Math.min(z.x1,z.x2),Math.min(z.z1,z.z2));
      const b=minecraftToLatLng(Math.max(z.x1,z.x2),Math.max(z.z1,z.z2));
      const layer=L.rectangle([[b[0],a[1]],[a[0],b[1]]],{color:z.color||'#4f8cff',weight:1,fillOpacity:.12}).addTo(map).bindPopup(`<strong>${escapeHtml(z.name)}</strong><br>${escapeHtml(z.note||'')}`);
      zoneLayers.set(z.id,layer);
      const el=document.createElement('div');el.className='zone-item';const chip=document.createElement('i');chip.className='zone-chip';chip.style.background=z.color||'#4f8cff';
      const meta=document.createElement('div');meta.style.flex='1';const title=document.createElement('strong');title.textContent=z.name;const sub=document.createElement('small');sub.textContent=`${typeNames[z.type]||'その他'} · Minecraft X ${z.x1}〜${z.x2}, Z ${z.z1}〜${z.z2}`;meta.append(title,sub);el.append(chip,meta);el.style.cursor='pointer';el.addEventListener('click',()=>map.fitBounds(layer.getBounds(),{maxZoom:18}));$('zoneList').append(el);
    });
  }
  function render() {
    $('siteTitle').textContent=mapData.title||'DISNEY RESORT LIVE MAP';
    $('statusBadge').textContent=statusNames[mapData.status]||'状態不明';$('statusBadge').className=`status-badge ${mapData.status||''}`;
    $('statusMessage').textContent=mapData.message||'お知らせはありません。';$('worldName').textContent=mapData.worldName||'—';
    $('updatedText').textContent=`最終更新: ${lastFetch?lastFetch.toLocaleTimeString('ja-JP'):'—'}`;
    renderPlayers();renderZones();renderAdminZones();
  }
  async function refresh() {
    try { mapData=await api('/api/public');lastFetch=new Date();setConnection(true,'API 接続中');render(); }
    catch { setConnection(false,API_BASE?'API 未接続':'デモ / API 未接続');render(); }
  }
  function token(){return $('adminToken').value.trim();}
  async function adminRequest(path,options={}) { return api(path,{...options,headers:{'X-Admin-Token':token(),...(options.headers||{})}}); }
  function feedback(text,good=false){$('adminFeedback').textContent=text;$('adminFeedback').className=good?'success-text':'error-text';}
  async function openAdmin(){
    $('adminModal').classList.remove('hidden');
    try{const d=await adminRequest('/api/admin/config');$('editTitle').value=d.title||'';$('editWorld').value=d.worldName||'';$('editStatus').value=d.status||'paused';$('editMessage').value=d.message||'';feedback('管理APIに接続しました。',true);}
    catch{feedback('トークンを入力してから、保存操作を試してください。');}renderAdminZones();
  }
  function fillZone(z){$('zoneId').value=z.id||'';$('zoneName').value=z.name||'';$('zoneType').value=z.type||'other';$('zoneX1').value=z.x1??0;$('zoneZ1').value=z.z1??0;$('zoneX2').value=z.x2??20;$('zoneZ2').value=z.z2??20;$('zoneColor').value=z.color||'#4f8cff';$('zoneNote').value=z.note||'';}
  function resetZone(){fillZone({x1:-20,z1:-20,x2:20,z2:20,color:'#4f8cff',type:'attraction'});}
  async function saveConfig(){try{const result=await adminRequest('/api/admin/config',{method:'PUT',body:JSON.stringify({title:$('editTitle').value,worldName:$('editWorld').value,status:$('editStatus').value,message:$('editMessage').value})});mapData={...mapData,...result.data};feedback('運営情報を保存しました。',true);render();}catch(e){feedback(`保存できません: ${e.message}`);}}
  async function saveZone(){const zone={id:$('zoneId').value||undefined,name:$('zoneName').value,type:$('zoneType').value,x1:$('zoneX1').value,z1:$('zoneZ1').value,x2:$('zoneX2').value,z2:$('zoneZ2').value,color:$('zoneColor').value,note:$('zoneNote').value};try{const result=await adminRequest('/api/admin/zones',{method:'POST',body:JSON.stringify(zone)});mapData.zones=result.zones;feedback('エリアを保存しました。',true);resetZone();render();}catch(e){feedback(`エリアを保存できません: ${e.message}`);}}
  async function deleteZone(id){if(!confirm('このエリアを削除しますか？'))return;try{const result=await adminRequest(`/api/admin/zones/${encodeURIComponent(id)}`,{method:'DELETE',body:'{}'});mapData.zones=result.zones;feedback('エリアを削除しました。',true);render();}catch(e){feedback(`削除できません: ${e.message}`);}}
  function renderAdminZones(){const list=$('adminZoneList');if(!list)return;list.innerHTML='';(mapData.zones||[]).forEach(z=>{const row=document.createElement('div');row.className='admin-zone-row';const label=document.createElement('span');label.textContent=`${z.name} (${z.x1},${z.z1})–(${z.x2},${z.z2})`;const controls=document.createElement('div');controls.style.display='flex';controls.style.gap='6px';const edit=document.createElement('button');edit.className='button';edit.textContent='編集';edit.onclick=()=>fillZone(z);const del=document.createElement('button');del.className='button';del.textContent='削除';del.onclick=()=>deleteZone(z.id);controls.append(edit,del);row.append(label,controls);list.append(row);});}
  $('adminToggle').addEventListener('click',openAdmin);$('closeAdmin').addEventListener('click',()=>$('adminModal').classList.add('hidden'));
  $('saveConfig').addEventListener('click',saveConfig);$('saveZone').addEventListener('click',saveZone);$('resetZone').addEventListener('click',resetZone);
  $('centerMap').addEventListener('click',()=>map.fitBounds(bounds,{padding:[18,18]}));
  map.on('click',()=>{});resetZone();map.fitBounds(bounds,{padding:[12,12]});refresh();setInterval(refresh,2500);
})();
