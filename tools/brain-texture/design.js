function seeded(seed){let s=seed;return()=>((s=(s*16807)%2147483647)-1)/2147483646;}
function makeNoise(rand){const perm=new Uint8Array(512);const p=Array.from({length:256},(_,i)=>i);for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)perm[i]=p[i&255];
const grad=(h,x,y)=>{const a=(h&7)*(Math.PI/4);return Math.cos(a)*x+Math.sin(a)*y;};const fade=t=>t*t*t*(t*(t*6-15)+10);
return(x,y)=>{const X=Math.floor(x)&255,Y=Math.floor(y)&255;const xf=x-Math.floor(x),yf=y-Math.floor(y);const u=fade(xf),v=fade(yf);const aa=perm[perm[X]+Y],ab=perm[perm[X]+Y+1],ba=perm[perm[X+1]+Y],bb=perm[perm[X+1]+Y+1];const x1=grad(aa,xf,yf)+u*(grad(ba,xf-1,yf)-grad(aa,xf,yf));const x2=grad(ab,xf,yf-1)+u*(grad(bb,xf-1,yf-1)-grad(ab,xf,yf-1));return x1+v*(x2-x1);};}
const P=window.PARAMS||{};
const K=(window.PARAMS&&window.PARAMS.K)||3, W=400, H=300, TW=W*K, TH=H*K;
function layer(draw){const c=document.createElement('canvas');c.width=TW;c.height=TH;const g=c.getContext('2d');g.scale(K,K);g.fillStyle='#fff';g.strokeStyle='#fff';g.lineJoin='round';g.lineCap='round';draw(g);const d=g.getImageData(0,0,TW,TH).data;return(x,y)=>{const xi=Math.min(TW-1,Math.max(0,Math.round(x*K))),yi=Math.min(TH-1,Math.max(0,Math.round(y*K)));return d[(yi*TW+xi)*4+3]/255;};}
const rand=seeded(31);
const cere=layer(g=>{g.fill(new Path2D(CEREBRUM));g.fill(new Path2D(TEMPORAL));});
const cbl=layer(g=>g.fill(new Path2D(CEREBELLUM)));
const stem=layer(g=>g.fill(new Path2D(STEM)));
const fiss=layer(g=>{g.filter='blur(2px)';g.lineWidth=6;g.stroke(new Path2D(SULCI[0]));g.lineWidth=3.5;g.stroke(new Path2D(SULCI[1]));});
const gap=layer(g=>{g.filter='blur(2px)';g.lineWidth=4.5;g.stroke(new Path2D(CEREBELLUM));g.stroke(new Path2D(STEM));});
const inner=layer(g=>{g.filter='blur(6px)';g.fill(new Path2D(CEREBRUM));g.fill(new Path2D(TEMPORAL));g.fill(new Path2D(CEREBELLUM));});
const n1=makeNoise(rand),n2=makeNoise(rand),n3=makeNoise(rand);
const F=P.f||0.06;
// ridge value: 0 at groove centre, rises over a gyrus
function ridge(x,y){
  const wx=n2(x*0.018,y*0.018)*1.5, wy=n3(x*0.018+7,y*0.018+3)*1.5;
  const ny=(y-30)/190;
  const sx=F*(1.2-0.45*ny), sy=F*(0.8+0.45*ny);
  return Math.abs(n1(x*sx+wx,y*sy+wy));
}
function foliaR(x,y){return Math.abs(Math.sin(y*0.42+n1(x*0.03,y*0.03)*2.2+Math.sin(x*0.04)*2.0))*0.3;}
const out=document.getElementById('out').getContext('2d');
if(!P.transparent){out.fillStyle='#060913';out.fillRect(0,0,TW,TH);}
out.globalCompositeOperation='lighter';
const N=P.n||420000; const hot=[];
const S0=P.s0||0.035, S1=P.s1||0.2;

function hval(x,y,region){
  if(region===0){ const r=ridge(x,y)*(1-fiss(x,y)*0.97); return Math.min(1,Math.max(0,(r-S0)/(S1-S0))); }
  if(region===1){ const r=foliaR(x,y)*(1-gap(x,y)*0.95); return Math.min(1,Math.max(0,(r-0.02)/0.2)); }
  return 0.6*(1-gap(x,y)*0.8);
}
for(let i=0;i<N;i++){
  const x=rand()*W,y=rand()*H;
  const c=cere(x,y),b=cbl(x,y),s=stem(x,y);
  if(c<0.5&&b<0.5&&s<0.5)continue;
  const region=c>=0.5?0:b>=0.5?1:2;
  const h=hval(x,y,region);
  const e=1.4;
  const dh=(h-hval(x+e,y+e,region)); // >0 where the surface faces the top-left light
  const tube=Math.pow(h,0.45);              // rounded crown
  let shade=Math.min(1,Math.max(0,(P.base||0.6)+dh*(P.k||4.5)))*tube;
  const rimBand=Math.exp(-Math.pow((h-(P.rc||0.28))/(P.rw||0.12),2))*0.55;
  const edge=1-inner(x,y);
  const sil=Math.min(1,Math.max(0,(edge-0.1)/0.4));
  const light=0.55+0.45*(1-y/H)*(0.85+0.15*(1-x/W));
  let p=(shade*0.9+rimBand*(P.rim||0.6)+sil*0.65)*light;
  if(region===2) p=(0.22+0.2*Math.abs(Math.sin(x*1.3)))*light+sil*0.35;
  // warm veins: sparse orange motes that trace the grooves, clustered by noise
  if(region===0 && h>0.0 && h<0.2 && n2(x*0.03+11,y*0.03+5)>0.12 && rand()<(P.vein||0.05)*light){
    out.fillStyle=`rgba(255,${120+Math.floor(rand()*70)},60,${0.55+0.4*rand()})`;
    const vs=(1.4+rand()*1.2)*K/3; out.fillRect(x*K-vs/2,y*K-vs/2,vs,vs);
  }
  if(rand()>p*(P.dens||0.55))continue;
  const X=x*K,Y=y*K;
  const bright=Math.min(1,shade*0.85+rimBand*0.5+sil*0.45);
  const col = bright>0.8? '185,225,255' : bright>0.55 ? '120,185,255' : bright>0.3 ? '80,140,240' : '55,95,205';
  const a=Math.min(1,(0.25+0.65*bright)*light);
  out.fillStyle=`rgba(${col},${a})`;
  const sz=(bright>0.78?2.1:bright>0.5?1.7:1.3)*K/3;
  out.fillRect(X-sz/2,Y-sz/2,sz,sz);
  if(region===0 && h<0.12 && rand()<(P.hot||0.006)) hot.push([X,Y]);
}
// orange glowing nodes in the grooves
function spark(x,y,r,rgb,a){const g=out.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,240,215,${a})`);g.addColorStop(0.15,`rgba(${rgb},${a*0.9})`);g.addColorStop(1,`rgba(${rgb},0)`);out.fillStyle=g;out.fillRect(x-r,y-r,r*2,r*2);}
for(const [x,y] of hot){ const big=rand()<0.2; spark(x,y,(big?16:7)*K/3,'255,120,50',big?0.85:0.65);}
window.HOT=hot; document.title='hot:'+hot.length;
