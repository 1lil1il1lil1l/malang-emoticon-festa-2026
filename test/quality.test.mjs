import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {encodeAnimation} from '../lib/motion.mjs';
test('3D shading survives GIF quantization without posterized colour blocks',async()=>{const html=await readFile('index.html','utf8'),sources=JSON.parse(html.split('const characterSources=')[1].split(';const characterImages')[0]);const source=Buffer.from(sources.bear.split(',')[1],'base64');const raw=await sharp(source).resize(480,480,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).ensureAlpha().raw().toBuffer();const gif=await encodeAnimation([raw,raw],[1500,1500]);const decoded=await sharp(gif).ensureAlpha().raw().toBuffer();let error=0;for(let i=0;i<raw.length;i++)error+=(raw[i]-decoded[i])**2;assert.ok(error/raw.length<12,`Colour MSE ${error/raw.length} is too high`);await mkdir('test-artifacts',{recursive:true});await writeFile('test-artifacts/quality.gif',gif);await sharp(raw,{raw:{width:480,height:480,channels:4}}).png().toFile('test-artifacts/quality-reference.png');console.log('3D colour MSE:',(error/raw.length).toFixed(2))});
