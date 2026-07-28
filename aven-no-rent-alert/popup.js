(() => {
  'use strict';
  const KEY = 'noRentGuests';
  const $ = id => document.getElementById(id);
  const el = {form:$('guestForm'),editId:$('editId'),first:$('firstName'),last:$('lastName'),reason:$('reason'),conf:$('confirmationNumber'),save:$('saveButton'),cancel:$('cancelEdit'),title:$('formTitle'),search:$('search'),list:$('list'),count:$('count'),empty:$('empty'),export:$('exportButton'),import:$('importButton'),file:$('importFile'),status:$('status')};
  let guests=[];
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const makeId=()=>crypto.randomUUID?crypto.randomUUID():`g-${Date.now()}-${Math.random()}`;

  function message(text,type=''){el.status.textContent=text;el.status.className=`status ${type}`;clearTimeout(message.t);message.t=setTimeout(()=>{el.status.textContent='';el.status.className='status'},3000)}
  function sort(){guests.sort((a,b)=>clean(a.lastName).localeCompare(clean(b.lastName),undefined,{sensitivity:'base'})||clean(a.firstName).localeCompare(clean(b.firstName),undefined,{sensitivity:'base'}))}
  async function persist(text){await chrome.storage.local.set({[KEY]:guests});render();if(text)message(text,'success')}
  function reset(){el.form.reset();el.editId.value='';el.title.textContent='Add guest';el.save.textContent='Add to no-rent list';el.cancel.classList.add('hidden')}
  function edit(g){el.editId.value=g.id;el.first.value=g.firstName;el.last.value=g.lastName;el.reason.value=g.reason||'';el.conf.value=g.confirmationNumber||'';el.title.textContent='Edit guest';el.save.textContent='Save changes';el.cancel.classList.remove('hidden');document.documentElement.scrollTop=0}
  function button(text,classes,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=classes;b.addEventListener('click',fn);return b}

  function render(){
    const q=norm(el.search.value); const filtered=guests.filter(g=>!q||[g.firstName,g.lastName,g.reason,g.confirmationNumber].some(v=>norm(v).includes(q)));
    el.list.replaceChildren();el.count.textContent=guests.length;el.empty.classList.toggle('hidden',filtered.length>0);el.empty.textContent=guests.length&&filtered.length===0?'No saved guest matches your search.':'No guests have been added yet.';
    for(const g of filtered){
      const card=document.createElement('article');card.className='card';const head=document.createElement('div');head.className='card-head';const name=document.createElement('p');name.className='name';name.textContent=`${clean(g.lastName)}, ${clean(g.firstName)}`;const actions=document.createElement('div');actions.className='actions';actions.append(button('Edit','small',()=>edit(g)),button('Delete','small delete',async()=>{if(confirm(`Remove ${g.firstName} ${g.lastName} from the no-rent list?`)){guests=guests.filter(x=>x.id!==g.id);if(el.editId.value===g.id)reset();await persist('Guest removed.')}}));head.append(name,actions);const details=document.createElement('p');details.className='details';details.textContent=`Reason: ${clean(g.reason)||'Not provided'}\nConfirmation #: ${clean(g.confirmationNumber)||'Not provided'}`;details.style.whiteSpace='pre-line';card.append(head,details);el.list.append(card)
    }
  }

  el.form.addEventListener('submit',async e=>{e.preventDefault();const first=clean(el.first.value),last=clean(el.last.value),reason=clean(el.reason.value),confirmationNumber=clean(el.conf.value),id=el.editId.value;if(!first||!last)return message('First and last name are required.','error');const now=new Date().toISOString();if(id){const i=guests.findIndex(g=>g.id===id);if(i<0)return message('Entry not found.','error');guests[i]={...guests[i],firstName:first,lastName:last,reason,confirmationNumber,updatedAt:now};sort();await persist('Changes saved.')}else{const duplicate=guests.some(g=>norm(g.firstName)===norm(first)&&norm(g.lastName)===norm(last));if(duplicate&&!confirm('A guest with the same name already exists. Add another entry anyway?'))return;guests.push({id:makeId(),firstName:first,lastName:last,reason,confirmationNumber,createdAt:now,updatedAt:now});sort();await persist('Guest added.')}reset()});
  el.cancel.addEventListener('click',reset);el.search.addEventListener('input',render);
  el.export.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'aven-no-rent-backup',version:1,exportedAt:new Date().toISOString(),guests},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`aven-no-rent-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  el.import.addEventListener('click',()=>{el.file.value='';el.file.click()});
  el.file.addEventListener('change',async()=>{try{const f=el.file.files?.[0];if(!f)return;const p=JSON.parse(await f.text()),arr=Array.isArray(p)?p:p.guests;if(!Array.isArray(arr))throw Error('No guest list found.');const cleaned=arr.map(g=>({id:clean(g.id)||makeId(),firstName:clean(g.firstName),lastName:clean(g.lastName),reason:clean(g.reason),confirmationNumber:clean(g.confirmationNumber),createdAt:clean(g.createdAt)||new Date().toISOString(),updatedAt:new Date().toISOString()})).filter(g=>g.firstName&&g.lastName);if(!confirm(`Import ${cleaned.length} guest(s)? This replaces the current list.`))return;guests=cleaned;sort();await persist('Backup imported.');reset()}catch(err){message(err.message||'Import failed.','error')}});
  chrome.storage.local.get(KEY).then(r=>{guests=Array.isArray(r[KEY])?r[KEY]:[];sort();render()}).catch(()=>message('Could not load saved list.','error'));
})();
