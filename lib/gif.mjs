// Adaptive 256-colour median-cut palette. GIF uses indexed colour by definition.
export function buildPalette(rgba){
 const hist=new Map();for(let i=0;i<rgba.length;i+=16){const k=(rgba[i]>>3)*1024+(rgba[i+1]>>3)*32+(rgba[i+2]>>3);hist.set(k,(hist.get(k)||0)+1)}
 let boxes=[[...hist].map(([k,n])=>({r:((k>>10)&31)*8+4,g:((k>>5)&31)*8+4,b:(k&31)*8+4,n}))];
 function info(v){let lo=[255,255,255],hi=[0,0,0],n=0;for(const c of v){const rgb=[c.r,c.g,c.b];for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],rgb[i]);hi[i]=Math.max(hi[i],rgb[i])}n+=c.n}const ranges=hi.map((h,i)=>h-lo[i]);const range=Math.max(...ranges);return {axis:['r','g','b'][ranges.indexOf(range)],score:range*Math.sqrt(n)}}
 while(boxes.length<256){let best=-1,score=-1;boxes.forEach((b,i)=>{if(b.length>1){const z=info(b);if(z.score>score){score=z.score;best=i}}});if(best<0)break;let box=boxes.splice(best,1)[0];const axis=info(box).axis;box.sort((a,b)=>a[axis]-b[axis]);const half=box.reduce((a,c)=>a+c.n,0)/2;let total=0,cut=1;for(let i=0;i<box.length-1;i++){total+=box[i].n;if(total>=half){cut=i+1;break}}boxes.push(box.slice(0,cut),box.slice(cut))}
 const palette=boxes.map(b=>{const n=b.reduce((a,c)=>a+c.n,0);return ['r','g','b'].map(k=>Math.round(b.reduce((a,c)=>a+c[k]*c.n,0)/n))});while(palette.length<256)palette.push([255,255,255]);return palette;
}
export function encodeGIF(frames,width=512,height=512,palette=buildPalette(frames[0]),delays=frames.map(()=>10)){
 const out=[];const put=(...v)=>out.push(...v);const word=n=>put(n&255,n>>8);const str=s=>{for(const c of s)put(c.charCodeAt(0))};str('GIF89a');word(width);word(height);put(0xf7,0,0);for(const rgb of palette)put(...rgb);put(0x21,0xff,11);str('NETSCAPE2.0');put(3,1,0,0,0);
 const cache=new Int16Array(32768);cache.fill(-1);
 for(let f=0;f<frames.length;f++){const rgba=frames[f];put(0x21,0xf9,4,4);word(delays[f]??10);put(0,0,0x2c);word(0);word(0);word(width);word(height);put(0,8);
 let packed=[],acc=0,bits=0,size=9,next=258,dict=new Map();const code=n=>{acc|=n<<bits;bits+=size;while(bits>=8){packed.push(acc&255);acc>>>=8;bits-=8}};
 function index(i){const r=rgba[i],g=rgba[i+1],b=rgba[i+2],key=(r>>3)*1024+(g>>3)*32+(b>>3);if(cache[key]>=0)return cache[key];let best=0,dist=Infinity;for(let j=0;j<256;j++){const c=palette[j],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<dist){dist=d;best=j}}cache[key]=best;return best}
 code(256);let prefix=index(0);for(let i=4;i<rgba.length;i+=4){const k=index(i),key=prefix*256+k;const found=dict.get(key);if(found!==undefined){prefix=found;continue}if(next>(1<<size)&&size<12)size++;code(prefix);if(next<4096){dict.set(key,next++)}else{code(256);dict.clear();size=9;next=258}prefix=k}if(next>(1<<size)&&size<12)size++;code(prefix);code(257);if(bits)packed.push(acc&255);for(let i=0;i<packed.length;i+=255){const block=packed.slice(i,i+255);put(block.length,...block)}put(0)}put(0x3b);return new Uint8Array(out)
}
