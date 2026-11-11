import {DEFAULT_IMAGE_MODEL} from '../../lib/image-provider.mjs';
import {ALLOWED_MOTIONS} from '../../lib/motions.mjs';
import {getStore,connectLambda} from '@netlify/blobs';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import QRCode from 'qrcode';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
const validId=id=>/^[0-9a-f-]{36}$/.test(id||'');
export async function handler(event){
 connectLambda(event);const store=getStore({name:'malang-motion'}),q=event.queryStringParameters||{};
 if(q.config)return reply(200,{model:process.env.IMAGE_MODEL||DEFAULT_IMAGE_MODEL,enabled:process.env.AI_ENABLED==='true'&&!!process.env.GEMINI_API_KEY,codeRequired:!!process.env.BOOTH_CODE,driveConfigured:!!(process.env.DRIVE_WEBHOOK_URL&&process.env.DRIVE_WEBHOOK_SECRET)});
 if(event.httpMethod==='GET'){
  if(!validId(q.id))return reply(400,{error:'잘못된 작업 번호입니다.'});
  const job=await store.get('jobs/'+q.id,{type:'json'});if(!job)return reply(404,{error:'결과를 찾을 수 없습니다.'});
  if(q.qr){if(job.status!=='done')return reply(409,{error:'아직 생성 중입니다.'});const base=process.env.URL||process.env.DEPLOY_PRIME_URL;const svg=await QRCode.toString(base+'/result.html?id='+q.id,{type:'svg',width:180,margin:2,errorCorrectionLevel:'M',color:{dark:'#263a60',light:'#ffffff'}});return {statusCode:200,headers:{'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=3600'},body:svg}}
  if(q.download||q.view){if(job.status!=='done')return reply(409,{error:'아직 생성 중입니다.'});const data=await store.get('results/'+q.id+'.gif',{type:'arrayBuffer'});if(!data)return reply(404,{error:'결과 파일을 찾을 수 없습니다.'});return {statusCode:200,headers:{'Content-Type':'image/gif','Cache-Control':'private,max-age=3600','Content-Disposition':(q.download?'attachment':'inline')+'; filename="malang-motion.gif"'},isBase64Encoded:true,body:Buffer.from(data).toString('base64')}}
  return reply(200,{id:q.id,status:job.status,message:job.message,error:job.error,stage:job.stage,progress:job.progress,resultMode:job.resultMode,width:job.width,height:job.height,durationMs:job.durationMs,archiveStatus:job.archiveStatus,url:job.status==='done'?'/.netlify/functions/jobs?id='+q.id+'&download=1':undefined});
 }
 if(event.httpMethod!=='POST')return reply(405,{error:'지원하지 않는 요청입니다.'});
 if((event.body||'').length>5700000)return reply(413,{error:'파일 용량이 너무 큽니다.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'요청 형식이 올바르지 않습니다.'})}
 const base=process.env.DEPLOY_PRIME_URL||process.env.URL;if(!base)return reply(503,{error:'배포 주소를 확인해 주세요.'});
 if(body.action==='save'){
  if(typeof body.gif!=='string'||!/^[A-Za-z0-9+/=]+$/.test(body.gif))return reply(400,{error:'GIF 파일을 확인해 주세요.'});const gif=Buffer.from(body.gif,'base64');
  if(gif.length>4200000||!['GIF89a','GIF87a'].includes(gif.subarray(0,6).toString())||gif.length<20)return reply(400,{error:'GIF 파일을 확인해 주세요.'});
  const width=gif.readUInt16LE(6),height=gif.readUInt16LE(8);if(width>768||height>768||width<1||height<1)return reply(400,{error:'GIF 크기를 확인해 주세요.'});
  const id=randomUUID(),token=randomBytes(32).toString('hex');const job={id,token,status:'done',progress:100,stage:4,resultMode:'demo',createdAt:new Date().toISOString(),width,height,durationMs:3000,archiveStatus:process.env.DRIVE_WEBHOOK_URL?'pending':'not_configured'};
  await store.set('results/'+id+'.gif',gif);await store.setJSON('jobs/'+id,job);
  if(process.env.DRIVE_WEBHOOK_URL){try{await fetch(base+'/.netlify/functions/archive-background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,token})})}catch{job.archiveStatus='failed';await store.setJSON('jobs/'+id,job)}}
  return reply(201,{id,resultMode:'demo',width,height,durationMs:3000,archiveStatus:job.archiveStatus});
 }
 if(process.env.AI_ENABLED!=='true'||!process.env.GEMINI_API_KEY)return reply(503,{error:'AI 연결이 아직 준비되지 않았습니다.'});
 if(process.env.BOOTH_CODE){const a=Buffer.from(String(body.code||'')),b=Buffer.from(process.env.BOOTH_CODE);if(a.length!==b.length||!timingSafeEqual(a,b))return reply(403,{error:'체험 코드를 확인해 주세요.'})}
 if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>1000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.image||''))return reply(400,{error:'그림과 움직임 아이디어를 확인해 주세요.'});
 const motion=ALLOWED_MOTIONS.includes(body.motion)?body.motion:'bounce';const id=randomUUID(),token=randomBytes(32).toString('hex');
 await store.setJSON('jobs/'+id,{id,status:'queued',progress:5,stage:0,message:'그림을 준비하고 있어요.',createdAt:new Date().toISOString(),token,motion,prompt:body.prompt.trim(),archiveStatus:'pending'});await store.set('inputs/'+id,body.image.split(',')[1]);
 try{const res=await fetch(base+'/.netlify/functions/render-background',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,token})});if(!res.ok)throw new Error('dispatch');return reply(202,{id})}catch{await store.setJSON('jobs/'+id,{status:'failed',error:'생성을 시작하지 못했습니다.'});return reply(502,{error:'생성을 시작하지 못했습니다.'})}
}
