import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const SIZE=480;
export const DURATION_MS=3000;
export const FRAME_ORDER=[0,1,2,3,2,1];
export const FRAME_DELAYS=FRAME_ORDER.map(()=>50);
export const OUTPUT_DELAYS=Array(30).fill(100);
export async function normalizeImage(input){return sharp(input,{limitInputPixels:40000000}).rotate().resize(512,512,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).png().toBuffer()}
export async function splitSheet(input){
 const image=sharp(input,{limitInputPixels:20000000});const meta=await image.metadata();
 if(!meta.width||!meta.height||meta.width<640||meta.height<640||Math.abs(meta.width/meta.height-1)>.02)throw new Error('INVALID_SHEET_DIMENSIONS');
 const w=Math.floor(meta.width/2),h=Math.floor(meta.height/2),mx=Math.round(w*.02),my=Math.round(h*.02);const frames=[];
 for(let i=0;i<4;i++){
  const cut=image.clone().extract({left:(i%2)*w+mx,top:Math.floor(i/2)*h+my,width:w-2*mx,height:h-2*my}).resize(SIZE,SIZE,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).ensureAlpha();
  const raw=await cut.raw().toBuffer();let marked=0;for(let p=0;p<raw.length;p+=4)if(Math.min(raw[p],raw[p+1],raw[p+2])<235)marked++;
  if(marked<SIZE*SIZE*.003)throw new Error('EMPTY_PANEL');frames.push(raw);
 }
 if(new Set(frames.map(f=>createHash('sha256').update(f).digest('hex'))).size<2)throw new Error('NO_MOTION_PANELS');return frames;
}
export async function encodeAnimation(frames,delays){
 if(frames.length!==delays.length||delays.reduce((a,b)=>a+b,0)!==DURATION_MS)throw new Error('INVALID_TIMELINE');
 const gif=await sharp(Buffer.concat(frames),{raw:{width:SIZE,height:SIZE*frames.length,channels:4,pageHeight:SIZE}}).gif({colours:256,dither:.85,effort:7,loop:0,delay:delays,interFrameMaxError:0,interPaletteMaxError:0}).toBuffer();
 if(gif.length>4200000)throw new Error('GIF_TOO_LARGE');return gif;
}
export async function assembleGIF(frames,order=FRAME_ORDER,delays=FRAME_DELAYS){
 if(order.length!==delays.length||delays.reduce((a,b)=>a+b,0)!==300)throw new Error('INVALID_TIMELINE');
 const rendered=[],timing=[];
 for(let n=0;n<order.length;n++){
  const from=frames[order[n]],to=frames[order[(n+1)%order.length]],steps=5;
  for(let k=0;k<steps;k++){
   const mix=k<3?0:(k-2)/3;
   if(mix===0)rendered.push(from);else{const blend=Buffer.allocUnsafe(from.length);for(let i=0;i<from.length;i+=4){blend[i]=Math.round(from[i]*(1-mix)+to[i]*mix);blend[i+1]=Math.round(from[i+1]*(1-mix)+to[i+1]*mix);blend[i+2]=Math.round(from[i+2]*(1-mix)+to[i+2]*mix);blend[i+3]=255}rendered.push(blend)}
   timing.push(delays[n]*10/steps);
  }
 }
 return encodeAnimation(rendered,timing);
}
export async function sheetToGIF(sheet){return assembleGIF(await splitSheet(sheet))}
export async function fallbackGIF(input,motion='bounce'){
 const normalized=await normalizeImage(input),frames=[];
 for(let i=0;i<30;i++){
  const phase=i/30*Math.PI*2;const scale=motion==='pulse'?1+Math.sin(phase)*.08:1;const angle=motion==='spin'?i/30*360:motion==='sway'?Math.sin(phase)*10:0;
  let layer=await sharp(normalized).resize(Math.round(370*scale),Math.round(370*scale)).rotate(angle,{background:'#ffffff'}).png().toBuffer();let meta=await sharp(layer).metadata();
  if(meta.width>448||meta.height>448){layer=await sharp(layer).resize(448,448,{fit:'inside'}).png().toBuffer();meta=await sharp(layer).metadata()}
  const top=Math.max(0,Math.floor((SIZE-meta.height)/2-(motion==='bounce'?Math.abs(Math.sin(phase))*20:0)));
  const raw=await sharp({create:{width:SIZE,height:SIZE,channels:4,background:'#ffffff'}}).composite([{input:layer,left:Math.floor((SIZE-meta.width)/2),top}]).ensureAlpha().raw().toBuffer();frames.push(raw);
 }
 return encodeAnimation(frames,OUTPUT_DELAYS);
}
