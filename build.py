import os, json, hashlib
from PIL import Image, ImageDraw
os.makedirs('public', exist_ok=True)
html=open('src/app.html').read()
html=html.replace('/*__QRGEN__*/',open('node_modules/qrcode-generator/dist/qrcode.js').read())
html=html.replace('/*__JSQR__*/',open('node_modules/jsqr/dist/jsQR.js').read())
html=html.replace('/*__CORE__*/',open('src/core.js').read())
assert '</script' not in open('node_modules/jsqr/dist/jsQR.js').read()
open('public/index.html','w').write(html)
ver=hashlib.sha1(html.encode()).hexdigest()[:8]
# icons: QR-ish mark
for n in (192,512):
    im=Image.new('RGB',(n,n),'#0d0f12'); d=ImageDraw.Draw(im); u=n/16
    def finder(x,y):
        d.rounded_rectangle([x*u,y*u,(x+5)*u,(y+5)*u],radius=u,fill='#f2b84b'); d.rectangle([(x+1)*u,(y+1)*u,(x+4)*u,(y+4)*u],fill='#0d0f12'); d.rectangle([(x+2)*u,(y+2)*u,(x+3)*u,(y+3)*u],fill='#f2b84b')
    finder(2,2); finder(9,2); finder(2,9)
    for (x,y) in [(9,9),(11,9),(13,10),(10,11),(12,12),(9,13),(13,13),(11,13)]: d.rectangle([x*u,y*u,(x+1)*u,(y+1)*u],fill='#eef0f3')
    im.save(f'public/icon-{n}.png')
json.dump({"name":"QRBeam","short_name":"QRBeam","description":"Offline file transfer between phones using animated QR codes","start_url":"./","scope":"./","display":"standalone","background_color":"#0d0f12","theme_color":"#0d0f12",
 "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]},open('public/manifest.webmanifest','w'),indent=1)
open('public/sw.js','w').write(f"""const CACHE='qrbeam-{ver}';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();}});
self.addEventListener('fetch',e=>{{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{{ignoreSearch:true}}).then(r=>r||fetch(e.request).then(res=>{{const c=res.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return res;}}).catch(()=>caches.match('index.html'))));}});
""")
