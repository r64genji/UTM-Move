// #11: local review page for flagged places. `npm run review:places`, then open http://localhost:5180
// Reads data/raw/review/flagged.json + data/raw/places/cleaned.json (run `npm run build:places` first).
// Each decision is written to data/overrides/places.yaml (by: user) and applied on the next build.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { Decision, loadOverrides, saveOverrides } from './overrides.ts'
import type { Row } from './clean.ts'

const PORT = Number(process.env.PORT || 5180)

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Review flagged places</title>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet"><script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>body{margin:0;font:13px system-ui}#map{position:absolute;inset:0 420px 0 0}#side{position:absolute;right:0;top:0;bottom:0;width:420px;overflow:auto;padding:8px;box-sizing:border-box}
.row{border:1px solid #ccc;border-radius:6px;padding:6px;margin:6px 0;cursor:pointer}.row.sel{border-color:#06f;background:#eef4ff}.row.done{opacity:.45}
.flag{color:#b00}.src{color:#555;font-size:12px}input,select{width:100%;box-sizing:border-box;margin:2px 0}button{margin:2px}</style></head><body>
<div id="map"></div><div id="side"><h3>Flagged places <span id="count"></span></h3>
<p class="src">Click a row, check the pin on the imagery (drag the red pin to fix it), then decide. Decisions go to data/overrides/places.yaml.</p><div id="list"></div></div>
<script>
let data, sel, marker;
const map=new maplibregl.Map({container:'map',style:{version:8,sources:{esri:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri'}},layers:[{id:'esri',type:'raster',source:'esri'}]},center:[103.638,1.561],zoom:15});
async function load(){data=await (await fetch('/api/data')).json();
  map.on('load',()=>{map.addSource('all',{type:'geojson',data:{type:'FeatureCollection',features:data.all.map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.location.lon,p.location.lat]},properties:{name:p.name}}))}});
  map.addLayer({id:'all',type:'circle',source:'all',paint:{'circle-radius':4,'circle-color':'#fc0','circle-stroke-color':'#000','circle-stroke-width':1}});
  map.addLayer({id:'allL',type:'symbol',source:'all',minzoom:16.5,layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1],'text-anchor':'top'},paint:{'text-color':'#fff','text-halo-color':'#000','text-halo-width':1}})});
  draw()}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';')}
function draw(){const list=document.getElementById('list');list.innerHTML='';
  document.getElementById('count').textContent='('+data.flagged.filter(r=>!data.overrides[r.id]).length+' left of '+data.flagged.length+')';
  for(const r of data.flagged){const d=data.overrides[r.id];const div=document.createElement('div');div.className='row'+(sel===r.id?' sel':'')+(d?' done':'');
    div.innerHTML='<b>'+esc(r.clean.name)+'</b> <small>'+esc(r.clean.category)+' · conf '+r.clean.confidence+(r.clean.should_drop?' · Gemini: DROP':'')+(r.clean.merge_with&&r.clean.merge_with!==r.id?' · Gemini: merge into '+esc(r.clean.merge_with):'')+'</small>'+
      '<div class=flag>'+r.flags.map(esc).join('<br>')+'</div><div class=src>'+r.members.map(m=>esc(m.name)+' ('+m.src+(m.gcat?': '+esc(m.gcat):'')+')').join('<br>')+(r.buildingName?'<br>building: '+esc(r.buildingName):'')+'<br>Gemini: '+esc(r.clean.reason)+'</div>'+
      (d?'<div><b>decided: '+d.action+'</b> ('+d.by+')'+(d.note?' '+esc(d.note):'')+'</div>':'');
    div.onclick=()=>select(r);list.appendChild(div);
    if(sel===r.id){const f=document.createElement('div');
      f.innerHTML='<input id=n value="'+esc(d?.name??r.clean.name)+'"><select id=c>'+data.categories.map(c=>'<option'+(c===(d?.category??r.clean.category)?' selected':'')+'>'+c+'</option>').join('')+'</select>'+
        '<input id=a placeholder="aliases, comma separated" value="'+esc((d?.aliases??r.clean.aliases).join(', '))+'"><input id=note placeholder="note (why)">'+
        '<select id=m><option value="">merge into…</option>'+data.all.filter(p=>p.id!==r.id).map(p=>[p,Math.hypot(p.location.lat-r.location.lat,p.location.lon-r.location.lon)]).sort((a,b)=>a[1]-b[1]).slice(0,15).map(([p])=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select>'+
        '<button data-a=keep>keep</button><button data-a=fix>fix</button><button data-a=drop>drop</button><button data-a=merge>merge</button>';
      f.onclick=e=>e.stopPropagation();f.querySelectorAll('button').forEach(b=>b.onclick=()=>decide(r,b.dataset.a));div.appendChild(f)}}}
function select(r){sel=r.id;draw();const ll=[r.location.lon,r.location.lat];map.flyTo({center:ll,zoom:18});marker?.remove();marker=new maplibregl.Marker({color:'#e00',draggable:true}).setLngLat(ll).addTo(map)}
async function decide(r,action){const q=id=>document.getElementById(id).value.trim();const d={action,by:'user'};
  if(q('note'))d.note=q('note');
  if(action==='fix'){d.name=q('n');d.category=q('c');d.aliases=q('a')?q('a').split(',').map(s=>s.trim()).filter(Boolean):[];const p=marker.getLngLat();if(Math.abs(p.lat-r.location.lat)>1e-7||Math.abs(p.lng-r.location.lon)>1e-7)d.location={lat:+p.lat.toFixed(6),lon:+p.lng.toFixed(6)}}
  if(action==='merge'){d.mergeInto=q('m');if(!d.mergeInto)return alert('pick a place to merge into')}
  const res=await fetch('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,decision:d})});
  if(!res.ok)return alert(await res.text());data.overrides[r.id]=d;draw()}
load();
</script></body></html>`

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8'))
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE)
    } else if (req.method === 'GET' && req.url === '/api/data') {
      const { Category } = await import('../../src/domain/schemas.ts')
      const rows = readJson<Row[]>('data/raw/places/cleaned.json')
      const all = rows.filter((r) => !r.clean.should_drop).map((r) => ({ id: r.id, name: r.clean.name, location: r.location }))
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        flagged: readJson<Row[]>('data/raw/review/flagged.json'), all, overrides: loadOverrides(), categories: Category.options,
      }))
    } else if (req.method === 'POST' && req.url === '/api/decision') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { id, decision } = JSON.parse(body) as { id: string; decision: unknown }
      const d = Decision.parse(decision)
      const o = loadOverrides()
      o[id] = d
      saveOverrides(o)
      res.writeHead(200).end('ok')
    } else res.writeHead(404).end()
  } catch (e) {
    res.writeHead(400).end(String(e))
  }
}).listen(PORT, () => console.log(`review page: http://localhost:${PORT}`))
