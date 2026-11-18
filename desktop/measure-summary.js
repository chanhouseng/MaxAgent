'use strict';
// Operates only on a pre-created isolated fixture directory, never on originals.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const dir=process.env.MAXAGENT_SUMMARY_FIXTURE;if(!dir)throw Error('Missing isolated fixture directory');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));process.env.CODEX_HOME=path.join(dir,'codex');process.env.CLAUDE_CONFIG_DIR=path.join(dir,'claude');
const Module=require('node:module'),load=Module._load;Module._load=function(req,parent){if(req==='./adapters/dsh'&&parent?.filename.endsWith(path.join('desktop','harness.js')))return {createDshAdapter:()=>({list:()=>[]})};return load.apply(this,arguments)};
const targets=new Set(manifest.files.map(f=>path.resolve(dir,f))),tracked=new Set();let bytes=0;const open=fs.openSync,read=fs.readSync,close=fs.closeSync;
fs.openSync=function(f,...args){const fd=open.call(this,f,...args);if(typeof f==='string'&&targets.has(path.resolve(f)))tracked.add(fd);return fd};
fs.readSync=function(fd,...args){const n=read.call(this,fd,...args);if(tracked.has(fd))bytes+=n;return n};fs.closeSync=function(fd){tracked.delete(fd);return close.call(this,fd)};
const h=require('./harness');function measure(){bytes=0;const start=performance.now();const rows=h.list().filter(x=>['codex','claude'].includes(x.tool));return {ms:Math.round(performance.now()-start),bytes,rows:rows.length}}
const originals=manifest.files.map(f=>({file:path.join(dir,f),size:fs.statSync(path.join(dir,f)).size}));try{const first=measure(),unchanged=measure();const addition=JSON.stringify({type:'maxagent_fixture_event',value:'local'})+'\n';for(const x of originals)fs.appendFileSync(x.file,addition);const appended=measure();console.log(JSON.stringify({fileBytes:originals.map(x=>x.size),appendedBytes:Buffer.byteLength(addition)*originals.length,first,unchanged,appended}))}finally{for(const x of originals)fs.truncateSync(x.file,x.size)}
