(function(){
  const controls=document.createElement('nav');
  controls.className='site-controls';
  controls.setAttribute('aria-label','Tema y navegación');
  const button=document.createElement('button');
  button.type='button';
  function apply(theme,save){
    document.documentElement.dataset.theme=theme;
    if(save){try{localStorage.setItem('doinglio.theme',theme)}catch(_){}}
    const light=theme==='light';
    button.textContent=light?'🌙 Activar oscuro':'☀ Activar claro';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',light?'#f3ecdf':'#080807');
  }
  button.onclick=()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light',true);
  controls.appendChild(button);
  const back=document.createElement('a');
  back.href='https://duiliomf.github.io/doinglio/';
  back.target='_self';
  back.textContent='← Volver a DoingLio';
  controls.appendChild(back);
  document.body.appendChild(controls);
  apply((()=>{try{return localStorage.getItem('doinglio.theme')||'dark'}catch(_){return 'dark'}})(),false);

  async function version(){
    const auth=document.getElementById('lola-auth-version');
    const hero=document.getElementById('lola-version');
    try{
      const r=await fetch('VERSION?cache='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw Error('VERSION');
      const v=(await r.text()).trim();
      if(!/^\d+$/.test(v))throw Error('bad version');
      let label='L'+Number(v);
      try{
        const p=await fetch('https://duiliomf.github.io/doinglio/BUILD?cache='+Date.now(),{cache:'no-store'});
        const d=(await p.text()).trim();
        if(p.ok&&/^\d+$/.test(d))label='D'+Number(d)+'.L'+Number(v);
      }catch(_){}
      if(auth)auth.textContent='DOINGLIO · LOLA REDES · '+label;
      if(hero)hero.textContent='ESPECIALISTA DE DOINGLIO · '+label;
    }catch(_){
      if(auth)auth.textContent='DOINGLIO · LOLA REDES · versión sin verificar';
      if(hero)hero.textContent='ESPECIALISTA DE DOINGLIO · versión sin verificar';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',version,{once:true});
  else version();
})();