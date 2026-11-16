const Q=require('../src/core.js'); const crypto=require('crypto');
const qrcode=require('qrcode-generator'); const jsQR=require('jsqr');
function run(size,chunk,drop,start){
  const bytes=crypto.randomBytes(size); const data=Q.packFile('photo.jpg','image/jpeg',bytes);
  const e=new Q.Encoder(data,chunk); const d=new Q.Decoder(); let n=start,shown=0;
  while(!d.done && shown<100000){ const p=e.packet(n++); shown++; if(Math.random()<drop) continue; d.push(p); }
  const f=Q.unpackFile(d.result); const ok=d.crcOk && Buffer.compare(Buffer.from(f.bytes),bytes)===0 && f.name==='photo.jpg';
  return {size,chunk,drop,K:e.K,framesShown:shown,received:d.packets,overhead:(shown*(1-drop)/e.K).toFixed(2),ok};
}
for(const [s,c,dr,st] of [[1000,500,0,0],[2e6,600,0.3,0],[2e6,600,0.5,5000],[300000,400,0.7,123],[50000,800,0.2,40]]) console.log(run(s,c,dr,st));
// QR roundtrip
const e=new Q.Encoder(Q.packFile('a.bin','x',crypto.randomBytes(5000)),600); const d=new Q.Decoder(); let qrOk=0,ver;
for(let i=0;i<e.K;i++){ const txt=e.packet(i); const qr=qrcode(0,'L'); qr.addData(txt,'Byte'); qr.make(); const m=qr.getModuleCount(); ver=m;
  const sc=4,q=4,W=(m+2*q)*sc; const img=new Uint8ClampedArray(W*W*4).fill(255);
  for(let y=0;y<m;y++)for(let x=0;x<m;x++) if(qr.isDark(y,x)) for(let yy=0;yy<sc;yy++)for(let xx=0;xx<sc;xx++){const o=(((y+q)*sc+yy)*W+(x+q)*sc+xx)*4; img[o]=img[o+1]=img[o+2]=0;}
  const r=jsQR(img,W,W,{inversionAttempts:'dontInvert'}); if(r&&r.data===txt){qrOk++; d.push(r.data);} }
console.log('QR roundtrip',qrOk,'/',e.K,'modules',ver,'decoded',d.done,d.crcOk);
