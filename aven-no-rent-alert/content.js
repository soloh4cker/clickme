(() => {
  'use strict';
  const KEY='noRentGuests';
  const SELECTOR='.primary-guest-info__label-ellipsis';
  const ROOT='aven-no-rent-alert-root';
  const titles=new Set(['mr','mrs','ms','miss','dr','prof','sir','madam']);
  let guests=[],currentGuest='',dismissed='',timer=0;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’`]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const tokens=(v,removeTitles=false)=>{const a=norm(v).split(' ').filter(Boolean);return removeTitles?a.filter(x=>!titles.has(x)):a};
  function containsAll(haystack,needles){const counts=new Map();haystack.forEach(x=>counts.set(x,(counts.get(x)||0)+1));for(const x of needles){const n=counts.get(x)||0;if(!n)return false;counts.set(x,n-1)}return true}
  function matches(name,g){const first=tokens(g.firstName),last=tokens(g.lastName);return first.length&&last.length&&containsAll(tokens(name,true),[...first,...last])}
  function visible(e){if(!(e instanceof Element))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}
  function displayedName(){const all=[...document.querySelectorAll(SELECTOR)],use=all.filter(visible);for(const e of(use.length?use:all)){const t=clean(e.textContent);if(t)return t}return''}
  function remove(){document.getElementById(ROOT)?.remove()}
  function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
  function signature(name,list){return norm(name)+'::'+list.map(g=>[g.id,norm(g.firstName),norm(g.lastName),norm(g.reason),norm(g.confirmationNumber)].join(':')).sort().join('|')}
  function row(parent,label,value){const r=node('div','nr-row'),l=node('div','nr-label',label),v=node('div','nr-value',clean(value)||'Not provided');r.append(l,v);parent.append(r)}
  async function copy(value,button){const old=button.textContent;try{await navigator.clipboard.writeText(value);button.textContent='Copied'}catch{const t=document.createElement('textarea');t.value=value;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();document.execCommand('copy');t.remove();button.textContent='Copied'}setTimeout(()=>{if(button.isConnected)button.textContent=old},1400)}
  function show(name,list,sig){remove();const root=node('div');root.id=ROOT;root.dataset.signature=sig;root.setAttribute('role','alertdialog');const card=node('section','nr-card'),head=node('header','nr-head'),icon=node('div','nr-icon','!'),wrap=node('div','nr-titlewrap'),title=node('h2','nr-title','NO-RENT LIST MATCH'),sub=node('p','nr-sub',`${list.length} matching restricted-guest record${list.length===1?'':'s'} found`),close=node('button','nr-close','×');close.type='button';close.setAttribute('aria-label','Close no-rent warning');close.addEventListener('click',()=>{dismissed=sig;remove()});wrap.append(title,sub);head.append(icon,wrap,close);const body=node('div','nr-body'),current=node('p','nr-current');const strong=node('strong','', 'Guest shown in Aven: ');current.append(strong,document.createTextNode(name));body.append(current);for(const g of list){const m=node('article','nr-match'),n=node('p','nr-name',`${clean(g.lastName)}, ${clean(g.firstName)}`);m.append(n);row(m,'Reason',g.reason);row(m,'Past confirmation #',g.confirmationNumber);if(clean(g.confirmationNumber)){const b=node('button','nr-copy','Copy confirmation #');b.type='button';b.addEventListener('click',()=>copy(g.confirmationNumber,b));m.append(b)}body.append(m)}body.append(node('p','nr-footer','Please review the past reservation before proceeding.'));card.append(head,body);root.append(card);document.documentElement.append(root)}
  function scan(){const name=displayedName(),key=norm(name);if(key!==currentGuest){currentGuest=key;dismissed='';remove()}if(!name)return remove();const list=guests.filter(g=>matches(name,g));if(!list.length)return remove();const sig=signature(name,list);if(sig===dismissed)return;const existing=document.getElementById(ROOT);if(!existing||existing.dataset.signature!==sig)show(name,list,sig)}
  function schedule(){clearTimeout(timer);timer=setTimeout(scan,180)}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY]){guests=Array.isArray(changes[KEY].newValue)?changes[KEY].newValue:[];dismissed='';schedule()}});
  chrome.storage.local.get(KEY).then(r=>{guests=Array.isArray(r[KEY])?r[KEY]:[];scan()}).catch(console.error);
  setInterval(schedule,2000);
})();
