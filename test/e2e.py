import asyncio, os, hashlib
from playwright.async_api import async_playwright
async def main():
    data=os.urandom(60000); open('/tmp/test.bin','wb').write(data)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':400,'height':860},device_scale_factor=2)
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+os.path.abspath('public/index.html'))
        await pg.screenshot(path='shot_home.png')
        await pg.click('#goSend'); await pg.set_input_files('#file','/tmp/test.bin')
        await pg.select_option('#fps','30'); await pg.click('#startSend'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='shot_send.png', full_page=True)
        # simulate a receiver scanning the live canvas, dropping ~35% of frames
        res=await pg.evaluate('''async()=>{const c=document.getElementById('qr');const d=new QRBeam.Decoder();let reads=0,t0=performance.now(),tries=0;
          while(!d.done && performance.now()-t0<60000){ await new Promise(r=>requestAnimationFrame(r)); tries++; if(Math.random()<0.35) continue;
            const x=c.getContext('2d').getImageData(0,0,c.width,c.height); const r=jsQR(x.data,c.width,c.height,{inversionAttempts:'dontInvert'}); if(r){reads++;d.push(r.data);} }
          if(!d.done) return {done:false,solved:d.solved,K:d.K,reads};
          const f=QRBeam.unpackFile(d.result); let h=0; for(const b of f.bytes) h=(h*31+b)>>>0;
          return {done:true,crc:d.crcOk,name:f.name,len:f.bytes.length,h,K:d.K,reads,secs:(performance.now()-t0)/1000};}''')
        h=0
        for x in data: h=(h*31+x)&0xffffffff
        print(res,'expected hash',h,'match',res.get('h')==h); print('page errors',errs)
        await b.close()
asyncio.run(main())
