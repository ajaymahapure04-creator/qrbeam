const Q=require('../src/core.js');const crypto=require('crypto');
for(const [s,ch,dr] of [[400,500,0],[3000,500,0.2],[20000,600,0.3],[200000,600,0.4],[2e6,600,0.3]]){let tot=0,T=s>1e6?2:10,ok=0;
 for(let t=0;t<T;t++){const b=crypto.randomBytes(s);const e=new Q.Encoder(b,ch);const d=new Q.Decoder();let n=Math.floor(Math.random()*1e5),rec=0;while(!d.done){const p=e.packet(n++);if(Math.random()<dr)continue;rec++;d.push(p);} if(d.crcOk&&Buffer.compare(Buffer.from(d.result),b)===0)ok++; tot+=rec/e.K;}
 console.log(s+'B K='+Math.ceil(s/ch),'avg frames/chunk',(tot/T).toFixed(2),'ok',ok+'/'+T);}
