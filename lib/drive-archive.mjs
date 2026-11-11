export const DRIVE_FOLDER_ID='1wsIsRFmxzpC7-qzOIM5cpYqfIY_F2q0p';
export async function archiveToDrive({id,gif,store,job,fetchImpl=fetch,url=process.env.DRIVE_WEBHOOK_URL,secret=process.env.DRIVE_WEBHOOK_SECRET}){
 if(!url||!secret){job.archiveStatus='not_configured';await store.setJSON('jobs/'+id,job);return}
 job.archiveStatus='pending';await store.setJSON('jobs/'+id,job);
 try{const endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com')throw new Error('INVALID_DRIVE_WEBHOOK');
  const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify({secret,id,fileName:'malang-'+id+'.gif',mimeType:'image/gif',base64:Buffer.from(gif).toString('base64')})});
  const result=await response.json();if(!response.ok||!result.ok||!result.fileId)throw new Error('DRIVE_UPLOAD_FAILED');job.archiveStatus='saved';job.driveFileId=result.fileId;
 }catch{job.archiveStatus='failed'}await store.setJSON('jobs/'+id,job);
}
