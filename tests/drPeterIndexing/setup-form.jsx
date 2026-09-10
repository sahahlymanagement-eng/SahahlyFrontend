// Local browser fixture only: all API requests use this adapter; no network marking.
import React from 'react';
import { createRoot } from 'react-dom/client';
import api from '../../src/api/api';
import DrPeterIndexingTools from '../../src/components/DrPeterIndexingTools';
api.defaults.adapter = async config => {
  let data;
  if (config.method === 'get' && config.url.endsWith('/exams')) data = [];
  else if (config.method === 'get' && config.url.includes('/partner/assignments/')) data = new Blob(['%PDF-1.4\n' + 'fixture '.repeat(100)], {type:'application/pdf'});
  else if (config.method === 'post' && config.url.endsWith('/exams')) {
    document.getElementById('captured').textContent = JSON.stringify(Object.fromEntries([...config.data.entries()].map(([key,value])=>[key, typeof value === 'string' ? value : value.name])),null,2);
    throw new Error('Fixture captured the indexing request. No AI call was made.');
  } else throw new Error('Unexpected fixture API request: '+config.url);
  return {data,status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')).render(<main style={{fontFamily:'Arial',padding:24}}><h1>Connected assignment indexing — form verification</h1><DrPeterIndexingTools assignment={{id:42,name:'Mock 2'}} selectedIds={new Set()} canMark gradeModel="gemini-2.5-flash" loadRoster={async()=>[{submissionId:101,name:'Fixture student'}]}/><pre id="captured" aria-label="Captured indexing request"/></main>);
