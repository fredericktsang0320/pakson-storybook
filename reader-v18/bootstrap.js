'use strict';
(() => {
  try {
    const current='pakson:book:pakson-k3-b5-u01-thank-you-web-v18:';
    const old='pakson:book:pakson-k3-b5-u01-thank-you:';
    if(localStorage.getItem(current+'page')===null){
      const value=localStorage.getItem(old+'page')??localStorage.getItem('pakson:page');
      const page=value===null?null:JSON.parse(value);
      const map=[0,1,2,3,5,6,8,9,11,12,14,16,17,18];
      if(Number.isInteger(page)&&page>=0&&page<map.length)localStorage.setItem(current+'page',JSON.stringify(map[page]));
    }
    if(localStorage.getItem(current+'readingMode')===null){
      const oldMode=localStorage.getItem(old+'readingMode');
      if(oldMode!==null)localStorage.setItem(current+'readingMode',JSON.stringify(JSON.parse(oldMode)==='auto'?'auto':'manual'));
    }
  }catch{}
})();
