#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');
const root=__dirname;
const obsolete=[
  'demo.html',
  'V9_3_16_DEMO_VISIBLE_2026-08-26.txt',
  'assets/community/demo.webp',
  'assets/voice/demo',
  'tests/demo-unified.js',
  'tests/session-priority-wakelock.js',
  'tests/v9316-demo-visible.js'
];
for(const rel of obsolete){
  const target=path.join(root,rel);
  try{fs.rmSync(target,{recursive:true,force:true});console.log('OK',rel)}catch(error){console.error('ERROR',rel,error.message);process.exitCode=1}
}
if(!process.exitCode)console.log('HOTFIX 07 aplicado: archivos obsoletos de Demo retirados.');
