import fs from 'fs';
const buf=fs.readFileSync('repo/public/models/brain.glb');
const jsonLen=buf.readUInt32LE(12); const json=JSON.parse(buf.slice(20,20+jsonLen).toString());
const binStart=20+jsonLen+8;
const CT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function acc(i){const a=json.accessors[i];const bv=json.bufferViews[a.bufferView];const T=CT[a.componentType];const n=NC[a.type];
  const off=binStart+(bv.byteOffset||0)+(a.byteOffset||0);const stride=bv.byteStride||n*T.BYTES_PER_ELEMENT;
  const out=new Float32Array(a.count*n);const dv=new DataView(buf.buffer,buf.byteOffset);
  for(let k=0;k<a.count;k++)for(let c=0;c<n;c++){const o=off+k*stride+c*T.BYTES_PER_ELEMENT;let v;
    switch(a.componentType){case 5126:v=dv.getFloat32(o,true);break;case 5123:v=dv.getUint16(o,true);break;case 5125:v=dv.getUint32(o,true);break;case 5121:v=dv.getUint8(o);break;case 5122:v=dv.getInt16(o,true);break;default:v=dv.getInt8(o);}
    if(a.normalized){if(a.componentType===5121)v/=255;else if(a.componentType===5123)v/=65535;else if(a.componentType===5122)v=Math.max(v/32767,-1);}
    out[k*n+c]=v;}
  return {data:out,n,count:a.count,type:a.type,ct:a.componentType};}
const t0=json.accessors[json.meshes[0].primitives[0].attributes._TISSUE]; console.log('TISSUE accessor',t0.type,t0.componentType,t0.normalized);
const skip=/cingulate|precuneus|medial-frontal|medial-superior|paracentral|subcallosal|parahippocampal|olfactory-cortex|insula|planum|transverse-temporal|operculum|cuneus|white-matter|corpus|commissure|fornix|caudate|putamen|pallidus|accumbens|claustrum|amygdala|hippocampus|thalamus|subthalamic|septal|hypothalamus|pineal|nigra|ventricle|aqueduct|canal|nuclei|peduncles$|artery|arteries|chiasm|optic|olfactory-bulb|tectum/;
const sel=[];
json.nodes.forEach(nd=>{ if(nd.mesh===undefined) return; if(skip.test(nd.name)) return; sel.push(nd); });
console.log('selected',sel.length);
let tris=[]; let totalA=0; let bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
const region=n=>/cerebell|vermis/.test(n)?1:/pons|medulla|midbrain|cerebral-peduncle/.test(n)?2:0;
const meshes=[];
for(const nd of sel){const pr=json.meshes[nd.mesh].primitives[0];
  if(nd.translation||nd.rotation||nd.scale||nd.matrix) console.log('node transform!',nd.name);
  const P=acc(pr.attributes.POSITION).data, N=acc(pr.attributes.NORMAL).data, T=acc(pr.attributes._TISSUE), I=acc(pr.indices).data;
  meshes.push({P,N,T,I,r:region(nd.name),name:nd.name});
  for(let k=0;k<P.length;k+=3){for(let c=0;c<3;c++){bb[c]=Math.min(bb[c],P[k+c]);bb[c+3]=Math.max(bb[c+3],P[k+c]);}}
}
// per-vertex convexity: neighbours below the tangent plane => ridge (gyral crown)
for(const m of meshes){const {P,N,I}=m;const nv=P.length/3;const sum=new Float32Array(nv),cnt=new Float32Array(nv);
  const add=(i,j)=>{const dx=P[j*3]-P[i*3],dy=P[j*3+1]-P[i*3+1],dz=P[j*3+2]-P[i*3+2];const L=Math.hypot(dx,dy,dz)||1;sum[i]+=(dx*N[i*3]+dy*N[i*3+1]+dz*N[i*3+2])/L;cnt[i]++;};
  for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2];add(a,b);add(a,c);add(b,a);add(b,c);add(c,a);add(c,b);}
  // boundary vertices (edges used by one triangle) have one-sided neighbourhoods: mark invalid
  const ec=new Map();const key=(x,y)=>x<y?x*nv+y:y*nv+x;
  for(let t=0;t<I.length;t+=3){const v=[I[t],I[t+1],I[t+2]];for(let e=0;e<3;e++){const k=key(v[e],v[(e+1)%3]);ec.set(k,(ec.get(k)||0)+1);}}
  const bnd=new Uint8Array(nv);for(const [k,c] of ec){if(c===1){bnd[Math.floor(k/nv)]=1;bnd[k%nv]=1;}}
  // grow the boundary band by two rings
  for(let ring=0;ring<2;ring++){const nb=bnd.slice();for(let t=0;t<I.length;t+=3){const v=[I[t],I[t+1],I[t+2]];if(v.some(x=>bnd[x]))v.forEach(x=>nb[x]=1);}bnd.set(nb);}
  let C=new Float32Array(nv);const valid=new Uint8Array(nv);for(let i=0;i<nv;i++){if(cnt[i]&&!bnd[i]){C[i]=sum[i]/cnt[i];valid[i]=1;}}
  // smooth over neighbourhood a few times so folds, not triangles, dominate
  // fill the boundary band from valid neighbours, then smooth
  for(let it=0;it<12;it++){const acc=new Float32Array(nv),k=new Float32Array(nv);
    for(let t=0;t<I.length;t+=3){const v=[I[t],I[t+1],I[t+2]];for(const x of v)for(const y of v){if(valid[y]){acc[x]+=C[y];k[x]++;}}}
    for(let i=0;i<nv;i++){if(k[i]){if(!valid[i]||it>=8){C[i]=acc[i]/k[i];}}}
    for(let i=0;i<nv;i++)if(k[i])valid[i]=1;}
  m.C=C;}
{const all=[];for(const m of meshes)for(let i=0;i<m.C.length;i+=7)all.push(m.C[i]);all.sort((a,b)=>a-b);const q=f=>all[Math.floor(all.length*f)].toFixed(4);console.log('cv pct',q(0.05),q(0.25),q(0.5),q(0.75),q(0.95));}
console.log('bbox',bb.map(v=>v.toFixed(3)).join(','), 'tissue n', meshes[0].T.n, 'sample', Array.from(meshes[0].T.data.slice(0,8)).map(v=>v.toFixed(3)));
fs.writeFileSync('meshinfo.json',JSON.stringify({bb}));
// area-weighted sampling
const cum=[];let A=0;const triRefs=[];
for(let mi=0;mi<meshes.length;mi++){const {P,I}=meshes[mi];for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3;
  const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
  const ar=0.5*Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);A+=ar;cum.push(A);triRefs.push(mi,t);}}
console.log('tris',cum.length,'area',A.toFixed(4));
let s=12345;const rnd=()=>((s=(s*16807)%2147483647)-1)/2147483646;
const NPTS=+process.argv[2]||60000;
const cx=(bb[0]+bb[3])/2,cy=(bb[1]+bb[4])/2,cz=(bb[2]+bb[5])/2;const half=Math.max(bb[3]-bb[0],bb[4]-bb[1],bb[5]-bb[2])/2;
const out=new Int16Array(NPTS*4); const aux=new Uint8Array(NPTS*3); const nrm=new Int8Array(NPTS*3);
const tn=meshes[0].T.n;
for(let k=0,tries=0;k<NPTS&&tries<NPTS*20;tries++){const r=rnd()*A;let lo=0,hi=cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<r)lo=m+1;else hi=m;}
  const mi=triRefs[lo*2],t=triRefs[lo*2+1];const {P,N,T,I,C}=meshes[mi];const a=I[t],b=I[t+1],c=I[t+2];
  let u=rnd(),v=rnd();if(u+v>1){u=1-u;v=1-v;}const w=1-u-v;
  const px=P[a*3]*w+P[b*3]*u+P[c*3]*v,py=P[a*3+1]*w+P[b*3+1]*u+P[c*3+1]*v,pz=P[a*3+2]*w+P[b*3+2]*u+P[c*3+2]*v;
  const ao=T.data[a*tn]*w+T.data[b*tn]*u+T.data[c*tn]*v;
  const cv=C[a]*w+C[b]*u+C[c]*v; // <0 ridge, >0 groove
  const ridge=Math.min(1,Math.max(0,(0.06-cv)/0.21));
  if(rnd()>Math.pow(ridge,1.6)*0.85+0.1) continue; // favour gyral crowns
  let nx=N[a*3]*w+N[b*3]*u+N[c*3]*v,ny=N[a*3+1]*w+N[b*3+1]*u+N[c*3+1]*v,nz=N[a*3+2]*w+N[b*3+2]*u+N[c*3+2]*v;const nl=Math.hypot(nx,ny,nz)||1;
  // keep only outward-facing surface: drop parcel side walls and inner faces
  { const ex=(px-cx)/(0.5*(bb[3]-bb[0]))**2, ey=(py-cy)/(0.5*(bb[4]-bb[1]))**2, ez=(pz-cz)/(0.5*(bb[5]-bb[2]))**2; const el=Math.hypot(ex,ey,ez)||1;
    const outward=(nx*ex+ny*ey+nz*ez)/(nl*el); if(outward < (meshes[mi].r===0?0.12:0.0)) continue; }
  nrm[k*3]=Math.round(nx/nl*127);nrm[k*3+1]=Math.round(ny/nl*127);nrm[k*3+2]=Math.round(nz/nl*127);
  out[k*4]=Math.round((px-cx)/half*32767);out[k*4+1]=Math.round((py-cy)/half*32767);out[k*4+2]=Math.round((pz-cz)/half*32767);out[k*4+3]=0;
  aux[k*3]=Math.max(0,Math.min(255,Math.round(ao*255)));aux[k*3+1]=meshes[mi].r;aux[k*3+2]=Math.round(ridge*255);k++;}
// pack: header + positions(int16 x3) + ao(u8) + region(u8)
const pos=new Int16Array(NPTS*3);for(let k=0;k<NPTS;k++){pos[k*3]=out[k*4];pos[k*3+1]=out[k*4+1];pos[k*3+2]=out[k*4+2];}
const header=new Uint32Array([NPTS]);
fs.writeFileSync('brain-points.bin',Buffer.concat([Buffer.from(header.buffer),Buffer.from(pos.buffer),Buffer.from(nrm.buffer),Buffer.from(aux.buffer)]));
let aos=[];for(let k=0;k<NPTS;k++)aos.push(aux[k*3+2]);aos.sort((x,y)=>x-y);console.log('ao pct',aos[0],aos[NPTS*0.1|0],aos[NPTS*0.5|0],aos[NPTS*0.9|0],aos[NPTS-1]);
console.log('written',fs.statSync('brain-points.bin').size);
