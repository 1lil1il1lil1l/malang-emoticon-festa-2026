// Apps Script > Project Settings > Script Properties:
// MALANG_ARCHIVE_SECRET = Netlify DRIVE_WEBHOOK_SECRET와 같은 비밀값
const TARGET_FOLDER_ID = '1wsIsRFmxzpC7-qzOIM5cpYqfIY_F2q0p';
function doPost(e) {
  function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('MALANG_ARCHIVE_SECRET');
    if (!expected || data.secret !== expected) return json({ok:false,error:'unauthorized'});
    if (!/^[0-9a-f-]{36}$/.test(data.id || '') || data.mimeType !== 'image/gif' || typeof data.base64 !== 'string' || data.base64.length > 5600000) return json({ok:false,error:'invalid_input'});
    lock.waitLock(10000);
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const name = 'malang-' + data.id + '.gif';
    const existing = folder.getFilesByName(name);
    const file = existing.hasNext() ? existing.next() : folder.createFile(Utilities.newBlob(Utilities.base64Decode(data.base64), 'image/gif', name));
    return json({ok:true,fileId:file.getId()});
  } catch (error) { return json({ok:false,error:'upload_failed'}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
