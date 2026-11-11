import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('public',{recursive:true});await copyFile('index.html','public/index.html');await copyFile('result.html','public/result.html');
