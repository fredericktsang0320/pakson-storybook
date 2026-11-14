'use strict';
(() => {
  const TEN_MINUTES=10*60*1000;
  const hex=bytes=>Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
  async function retire(options={}) {
    const scope=new URL(options.scope);
    if(!scope.pathname.endsWith('/'))throw new TypeError('A complete registration scope ending in / is required.');
    const storage=options.cacheStorage||globalThis.caches;
    const tag=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope.href)));
    const prefix='pakson-storybook-scope-'+tag+'-',controlName='pakson-storybook-control-'+tag;
    const book=new URL('book.json',scope).href;
    const protectedNames=new Set((options.protectedCaches||[]).filter(name=>typeof name==='string'));
    const now=Number.isFinite(options.now)?options.now:Date.now();
    const keepCount=Math.max(0,Math.floor(Number.isFinite(options.maxRetiredToKeep)?options.maxRetiredToKeep:1));
    const names=await storage.keys(),versions=[],stageCandidates=[];
    const result={scope:scope.href,prefix,activeKnown:options.activeKnown===true,deleted:[],kept:[],skipped:[],reasons:{}};
    const keep=(name,why)=>{result.kept.push(name);result.reasons[name]=why;};
    for(let order=0;order<names.length;order++){
      const name=names[order];
      const legacy=/^pakson-audiobook-([a-f0-9]{16})$/.exec(name);
      if(!name.startsWith(prefix)&&!legacy){result.skipped.push(name);continue;}
      if(protectedNames.has(name)){keep(name,'protected');continue;}
      const suffix=legacy?legacy[1]:name.slice(prefix.length),stage=legacy?null:/^([a-f0-9]{16})-stage-(\d{10,})-([a-f0-9]+)$/.exec(suffix);
      if(stage){
        if(protectedNames.has(prefix+stage[1])){keep(name,'protected-stage-version');continue;}
        const created=Number(stage[2]);
        if(now-created>TEN_MINUTES&&created<=now)stageCandidates.push(name);
        else keep(name,'fresh-or-future-stage');
        continue;
      }
      if(!/^[a-f0-9]{16}$/.test(suffix)){keep(name,'unrecognised-name');continue;}
      if(options.activeKnown!==true||!protectedNames.size){keep(name,'active-cache-unknown');continue;}
      // Avoid opening a Cache wrapper just to establish ownership: native Cache
      // handles can retain a deleted container's disk quota until GC.
      const proof=await storage.match(book,{cacheName:name});
      if(!proof){keep(name,'ownership-not-proven');continue;}
      await proof.arrayBuffer(); // Finish the native body lease before retiring its container.
      if(legacy){
        if(options.deferLegacyInspection){keep(name,'legacy-inspection-deferred');continue;}
        const keys=await(await storage.open(name)).keys();
        if(keys.some(key=>{const url=new URL(key.url);return url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname);})){keep(name,'legacy-shared-scope');continue;}
      }
      versions.push({name,version:suffix,order,createdAt:null,legacy:!!legacy});
    }
    // Control records are read only: they supply recency, never ownership.
    if(names.includes(controlName)){
      const control=await storage.open(controlName);
      for(const key of await control.keys()){
        try{
          const response=await control.match(key),record=await response.json();
          if(record.scope!==scope.href)continue;
          const version=versions.find(item=>item.version===record.version),created=Date.parse(record.createdAt);
          if(version&&Number.isFinite(created)&&(version.createdAt===null||created>version.createdAt))version.createdAt=created;
        }catch{}
      }
    }
    let retired=[];
    if(options.activeKnown===true&&protectedNames.size){
      versions.sort((a,b)=>((b.createdAt??-Infinity)-(a.createdAt??-Infinity))||(b.order-a.order));
      for(const item of versions.slice(0,keepCount))keep(item.name,'recent-retired');
      retired=versions.slice(keepCount).map(item=>item.name);
    }else for(const item of versions)keep(item.name,'active-cache-unknown');
    // Never remove entries inside a surviving cache. Only these complete,
    // scoped containers, or old scoped staging containers, may be retired.
    for(const name of [...stageCandidates,...retired]){
      if(protectedNames.has(name)){keep(name,'protected');continue;}
      if(await storage.delete(name)){result.deleted.push(name);result.reasons[name]=stageCandidates.includes(name)?'old-orphan-stage':'retired-version';}
    }
    return result;
  }
  globalThis.PaksonCacheRetirement=Object.freeze({retire});
})();
