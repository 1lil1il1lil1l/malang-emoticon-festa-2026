import {getStore,connectLambda} from '@netlify/blobs';
import {normalizeImage,sheetToGIF,fallbackGIF,SIZE,DURATION_MS} from '../../lib/motion.mjs';
import {archiveToDrive} from '../../lib/drive-archive.mjs';
import {generateSheet} from '../../lib/image-provider.mjs';
import {generateVideo,DEFAULT_VIDEO_MODEL} from '../../lib/video-provider.mjs';
import {videoToGIF} from '../../lib/video-gif.mjs';
import {fallbackMotion} from '../../lib/motions.mjs';

// mode: 'video' (기본, Gemini Omni 4초 영상 → GIF) 또는 'sheet' (예전 2×2 4컷 → GIF)
export async function renderJob({job,store,mode='video',generate,toGIF=videoToGIF,apiKey,model,videoModel}){
 const key='jobs/'+job.id;const update=async(status,message)=>{job.status=status;job.message=message;job.stage={preparing:0,generating:1,converting:2,saving:3}[status]??0;job.progress={preparing:10,generating:35,converting:72,saving:92}[status]??0;job.updatedAt=new Date().toISOString();await store.setJSON(key,job)};
 await update('preparing','그림을 준비하고 있어요.');
 const encoded=await store.get('inputs/'+job.id);if(!encoded)throw new Error('MISSING_INPUT');const original=await normalizeImage(Buffer.from(encoded,'base64'));
 job.generationMode=mode;
 let gif,width=SIZE,height=SIZE,durationMs=DURATION_MS;
 try{
  if(mode==='sheet'){
   await update('generating','AI가 요청한 움직임을 4컷으로 그리고 있어요.');
   const sheet=await (generate||generateSheet)({image:original,prompt:job.prompt,motion:job.motion,apiKey,model});job.generation=sheet.generationMetadata||null;
   await update('converting','4컷을 자연스러운 GIF로 엮고 있어요.');gif=await sheetToGIF(sheet);durationMs=3000;
   await store.set('sheets/'+job.id,sheet);job.message='AI가 만든 4컷 이모티콘이 완성됐어요.';
  }else{
   await update('generating','AI가 그림을 움직이는 영상으로 만들고 있어요. 1~2분쯤 걸려요.');
   const video=await (generate||generateVideo)({image:original,prompt:job.prompt,motion:job.motion,apiKey,model:videoModel||DEFAULT_VIDEO_MODEL});job.generation=video.generationMetadata||null;
   await update('converting','영상을 4초 GIF로 바꾸고 있어요.');gif=await toGIF(video);width=gif.width||width;height=gif.height||height;durationMs=gif.durationMs||4000;
   await store.set('videos/'+job.id+'.mp4',video);job.message='AI가 만든 움직이는 이모티콘이 완성됐어요.';
  }
  job.resultMode='ai';
 }catch(error){
  job.fallbackReason=String(error.message||'GENERATION_FAILED').slice(0,300);console.error('AI fallback',job.id,job.fallbackReason);
  await update('converting','AI 생성 대신 선택한 기본 모션으로 만들고 있어요.');
  gif=await fallbackGIF(original,fallbackMotion(job.motion));width=SIZE;height=SIZE;durationMs=DURATION_MS;job.resultMode='fallback';job.message='AI 생성이 완료되지 않아 기본 모션으로 대신 만들었어요.';
 }
 await update('saving','이모티콘을 보관하고 QR을 준비하고 있어요.');await store.set('results/'+job.id+'.gif',gif);job.status='done';job.progress=100;job.stage=4;job.message=job.resultMode==='ai'?'AI 이모티콘이 완성됐어요.':'AI 생성 대신 기본 모션으로 완성했어요.';job.width=width;job.height=height;job.durationMs=durationMs;delete job.token;await store.setJSON(key,job);await store.delete('inputs/'+job.id);await archiveToDrive({id:job.id,gif,store,job});return job;
}
export async function handler(event){
 connectLambda(event);const store=getStore({name:'malang-motion'});let input;try{input=JSON.parse(event.body||'{}')}catch{return {statusCode:400}}
 if(!/^[0-9a-f-]{36}$/.test(input.id||''))return {statusCode:400};const key='jobs/'+input.id;const job=await store.get(key,{type:'json'});
 if(!job||job.token!==input.token||job.status!=='queued')return {statusCode:403};job.id=input.id;
 const mode=process.env.GENERATION_MODE==='sheet'?'sheet':'video';
 try{await renderJob({job,store,mode,apiKey:process.env.GEMINI_API_KEY,model:process.env.IMAGE_MODEL,videoModel:process.env.VIDEO_MODEL})}catch(error){job.status='failed';job.error='결과를 만들거나 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';delete job.token;await store.setJSON(key,job);await store.delete('inputs/'+input.id)}
 return {statusCode:200};
}
