const $=id=>document.getElementById(id);
const clean=s=>(s??'').toString().replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
const norm=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const esc=s=>(s??'').toString().replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const words=s=>clean(s).split(/\s+/).filter(Boolean);
function show(el,cls,html){el.className=`output-box ${cls}`;el.innerHTML=html;el.classList.remove('hidden')}

if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
async function extractFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.txt')) return await file.text();
  const ab=await file.arrayBuffer();
  if(name.endsWith('.docx')){if(!window.mammoth)throw new Error('No se pudo cargar el lector DOCX.');const r=await mammoth.extractRawText({arrayBuffer:ab});return r.value;}
  if(name.endsWith('.pdf')){if(!window.pdfjsLib)throw new Error('No se pudo cargar el lector PDF.');const pdf=await pdfjsLib.getDocument({data:ab}).promise;let pages=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),c=await p.getTextContent();pages.push(c.items.map(x=>x.str).join(' '));}return pages.join('\n\n');}
  throw new Error('Formato no admitido. Usa DOCX, PDF o TXT.');
}
document.querySelectorAll('input[type=file][data-target]').forEach(inp=>inp.addEventListener('change',async()=>{
  const file=inp.files?.[0],target=inp.dataset.target,status=document.querySelector(`[data-status="${target}"]`);if(!file)return;
  status.className='file-status';status.textContent='Leyendo archivo...';
  try{const text=await extractFile(file);$(target).value=text.trim();status.className='file-status ok';status.textContent=`Cargado: ${file.name} · ${words(text).length} palabras.`;}
  catch(e){status.className='file-status bad';status.textContent=e.message;}
}));

function getCitations(t){
  const out=[]; const s=(t||'').replace(/\n/g,' ');
  const par=[...s.matchAll(/\(([^()]{2,90}?),\s*((?:19|20)\d{2}|s\.\s*f\.|s\.f\.)[^)]*\)/gi)];
  par.forEach(m=>out.push({author:clean(m[1]).split(/[;&]/)[0].replace(/\bet al\.?/i,'').trim(),year:m[2].match(/(?:19|20)\d{2}/)?.[0]||'s.f.'}));
  const narr=[...s.matchAll(/\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñüÜ .'-]{1,55})\s*\(((?:19|20)\d{2}|s\.\s*f\.|s\.f\.)\)/g)];
  narr.forEach(m=>out.push({author:clean(m[1]).split(/\s+y\s+|\s*&\s*/i)[0].trim(),year:m[2].match(/(?:19|20)\d{2}/)?.[0]||'s.f.'}));
  return out;
}
function splitRefs(t){
  let raw=(t||'').replace(/\r/g,'').trim(); if(!raw)return[];
  let arr=raw.split(/\n\s*\n+/).map(clean).filter(x=>x.length>15);
  if(arr.length<=1) arr=raw.split(/\n+/).map(clean).filter(x=>x.length>15);
  return arr;
}
function refKey(r){
  const n=norm(r); const yr=n.match(/\b(?:19|20)\d{2}\b/)?.[0]||'s.f.';
  const lead=n.split(/[.(]/)[0].replace(/[^a-z0-9ñ ]/g,' ').trim();
  return {lead,year:yr};
}
function firstTokenName(s){return norm(s).replace(/[^a-z0-9ñ ]/g,' ').trim().split(/\s+/)[0]||''}
function isAlphaSorted(refs){const keys=refs.map(r=>norm(r).replace(/^\W+/,'').slice(0,80));return keys.every((x,i)=>!i||keys[i-1].localeCompare(x,'es')<=0)}

$('reviewRefsBtn').addEventListener('click',()=>{
  const citations=getCitations($('citationsText').value),refs=splitRefs($('referencesText').value);
  if(!refs.length){show($('refsOutput'),'bad','<h4>🔵 FALTA INFORMACIÓN</h4><p>Pega o carga la lista de referencias bibliográficas.</p>');return;}
  const rkeys=refs.map(refKey); let missing=[],unused=[];
  for(const c of citations){const a=firstTokenName(c.author);if(a&&!rkeys.some(r=>firstTokenName(r.lead)===a&&r.year===c.year))missing.push(`${c.author} (${c.year})`)}
  for(const r of refs){const k=refKey(r),a=firstTokenName(k.lead);if(citations.length&&a&&!citations.some(c=>firstTokenName(c.author)===a&&c.year===k.year))unused.push(r)}
  const normRefs=refs.map(norm),dups=refs.filter((r,i)=>normRefs.indexOf(norm(r))!==i);
  const webBare=refs.filter(r=>/^\s*[A-ZÁÉÍÓÚÑ0-9 ._-]+\.\s*\(\d{4}\)\.\s*https?:\/\//i.test(r)||(/^\s*https?:\/\//i.test(r)));
  const noYear=refs.filter(r=>!/(\((?:19|20)\d{2}\)|\bs\.\s*f\.)/i.test(r));
  const sorted=isAlphaSorted(refs); let issues=[];
  if(missing.length)issues.push(`${missing.length} cita(s) no encuentran referencia coincidente por autor/institución y año.`);
  if(unused.length)issues.push(`${unused.length} referencia(s) no muestran una cita coincidente en el texto pegado.`);
  if(!sorted)issues.push('La lista no parece estar ordenada alfabéticamente por el primer autor o institución.');
  if(dups.length)issues.push(`Se detectaron ${dups.length} referencia(s) duplicada(s) idéntica(s).`);
  if(noYear.length)issues.push(`${noYear.length} referencia(s) no muestran año o s.f. de manera reconocible.`);
  if(webBare.length)issues.push('Algunas referencias web parecen contener solo institución/año/URL. Verifica que también incluyan el título del recurso según APA 6.');
  const cls=issues.length>=4?'bad':issues.length?'warn':'ok';
  show($('refsOutput'),cls,`<h4>${issues.length>=4?'🟠 REQUIERE REVISIÓN':issues.length?'🟡 CUMPLE PARCIALMENTE':'🟢 CUMPLE LOS CONTROLES BÁSICOS'}</h4>
  <div class="review-kpis"><div class="review-kpi"><span class="k">Citas detectadas</span><span class="v">${citations.length}</span><span class="d">Autor-año</span></div><div class="review-kpi"><span class="k">Referencias</span><span class="v">${refs.length}</span><span class="d">Entradas</span></div><div class="review-kpi"><span class="k">Sin referencia</span><span class="v">${missing.length}</span><span class="d">Citas</span></div><div class="review-kpi"><span class="k">Sin cita</span><span class="v">${unused.length}</span><span class="d">Referencias</span></div></div>
  ${issues.length?`<h4>Qué debe revisarse</h4><ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  ${missing.length?`<h4>Citas que requieren comprobación</h4><ul>${[...new Set(missing)].slice(0,30).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  ${unused.length?`<h4>Referencias que podrían estar sin cita</h4><ul>${unused.slice(0,15).map(x=>`<li>${esc(x.slice(0,220))}${x.length>220?'…':''}</li>`).join('')}</ul>`:''}
  <div class="rule-c6"><b>Importante:</b> este control es heurístico. La comprobación final debe realizarse también en Word, verificando cada cita y sus datos bibliográficos completos.</div>`);
});
$('clearRefsBtn').addEventListener('click',()=>{$('citationsText').value='';$('referencesText').value='';$('refsOutput').classList.add('hidden')});

function makeReference(){
  const type=$('refType').value,a=clean($('refAuthor').value),y=clean($('refYear').value),t=clean($('refTitle').value),e=clean($('refExtra').value),p=clean($('refPlace').value),u=clean($('refUrl').value);
  if(!a||!y||!t){show($('refBuilderOutput'),'bad','Completa como mínimo Autor/Institución, Año y Título.');return;}
  let r='';
  if(type==='book')r=`${a} (${y}). ${t}. ${p?`${p}: `:''}${e||'[Editorial]'}.`;
  if(type==='article')r=`${a} (${y}). ${t}. ${e||'[Nombre de la Revista]'}${p?`, ${p}`:''}.`;
  if(type==='web')r=`${a} (${y}). ${t}. Recuperado de ${u||'[URL]'}`;
  if(type==='thesis')r=`${a} (${y}). ${t} (Tesis de licenciatura/Proyecto de grado). ${e||'[Institución]'}${p?`, ${p}`:''}.`;
  if(type==='standard')r=`${a} (${y}). ${t}. ${p?`${p}: `:''}${e||'Autor'}.`;
  show($('refBuilderOutput'),'ok',`<h4>Modelo orientativo</h4><div class="code-ref">${esc(r)}</div><p class="small-note">Comprueba nombres propios, cursivas, DOI/URL, tipo documental y datos exigidos por el chatbot APA 6 antes de incorporarlo al proyecto.</p>`);
}
$('buildRefBtn').addEventListener('click',makeReference);

function parseGlossary(t){
  return (t||'').split(/\n+/).map(clean).filter(Boolean).map(line=>{const m=line.match(/^([^:–—-]{1,80})\s*[:–—-]\s*(.+)$/);return m?{term:clean(m[1]),def:clean(m[2])}:null}).filter(Boolean);
}
$('reviewGlossaryBtn').addEventListener('click',()=>{
  const entries=parseGlossary($('glossaryText').value);if(!entries.length){show($('glossaryOutput'),'bad','<h4>🔵 FALTA INFORMACIÓN</h4><p>Escribe cada entrada como <b>Término: definición</b>.</p>');return;}
  const terms=entries.map(x=>norm(x.term)),dups=entries.filter((x,i)=>terms.indexOf(norm(x.term))!==i),long=entries.filter(x=>words(x.def).length>45),short=entries.filter(x=>words(x.def).length<3);
  const sorted=entries.every((x,i)=>!i||x.term.localeCompare(entries[i-1].term,'es',{sensitivity:'base'})>=0);
  let issues=[];if(!sorted)issues.push('El glosario no está en orden alfabético.');if(dups.length)issues.push(`${dups.length} término(s) están duplicados.`);if(long.length)issues.push(`${long.length} definición(es) son extensas; conviene sintetizarlas.`);if(short.length)issues.push(`${short.length} definición(es) parecen demasiado breves para aclarar el término.`);
  show($('glossaryOutput'),issues.length?'warn':'ok',`<h4>${issues.length?'🟡 REVISAR GLOSARIO':'🟢 ESTRUCTURA BÁSICA CORRECTA'}</h4><p>Se detectaron <b>${entries.length}</b> términos.</p>${issues.length?`<ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="rule-c6"><b>Criterio:</b> incluye solo términos, siglas o expresiones técnicas que realmente aparezcan en el proyecto y cuya comprensión pueda requerir aclaración.</div>`);
});

$('classifyMaterialBtn').addEventListener('click',()=>{
  const d=clean($('materialDescription').value),origin=$('materialOrigin').value;if(!d){show($('classifyOutput'),'bad','Describe primero el material.');return;}
  const n=norm(d),ownHints=/codigo|algorit|diagrama|matriz|encuesta|cuestionario|calculo|registro|plano|manual|pcb|software|programa|medicion|tabla propia/.test(n),thirdHints=/datasheet|hoja de datos|fabricante|cotizacion|carta|certificado|norma|proveedor|manual del fabricante|institucion|permiso|mapa oficial|estadistica/.test(n);
  let kind,why;
  if(origin==='own'){kind='APÉNDICE';why='Se indicó que el material fue elaborado por el estudiante o investigador.'}
  else if(origin==='third'){kind='ANEXO';why='Se indicó que el material fue elaborado o emitido por un tercero.'}
  else if(ownHints&&!thirdHints){kind='APÉNDICE PROBABLE';why='La descripción contiene señales de producción propia.'}
  else if(thirdHints&&!ownHints){kind='ANEXO PROBABLE';why='La descripción contiene señales de documentación externa.'}
  else{kind='REQUIERE VERIFICAR AUTORÍA';why='La descripción no permite distinguir con certeza quién elaboró el material.'}
  show($('classifyOutput'),kind.includes('REQUIERE')?'warn':'ok',`<h4>${esc(kind)}</h4><p>${esc(why)}</p><p><b>Pregunta decisiva:</b> ¿quién creó originalmente el documento o contenido? Si fue producido específicamente por el estudiante → <b>Apéndice</b>. Si proviene de fabricante, institución, proveedor u otro tercero → <b>Anexo</b>.</p>`);
});

function inventoryCheck(text,prefix){
  const lines=(text||'').split(/\n+/).map(clean).filter(Boolean);const labels=lines.map(x=>x.match(new RegExp(`^${prefix}\\s+([A-Z])\\.?`, 'i'))?.[1]?.toUpperCase()).filter(Boolean);
  let gaps=[];labels.forEach((l,i)=>{const expected=String.fromCharCode(65+i);if(l!==expected)gaps.push(`${l} donde se esperaba ${expected}`)});
  return {lines,labels,gaps};
}
$('integralReviewBtn').addEventListener('click',()=>{
  const refs=splitRefs($('referencesText').value),gl=parseGlossary($('glossaryText').value),ap=inventoryCheck($('appendixInventory').value,'APÉNDICE'),an=inventoryCheck($('annexInventory').value,'ANEXO');
  let issues=[];if(!refs.length)issues.push('No se cargó la lista de referencias bibliográficas.');if(!gl.length)issues.push('No se cargó o no se reconoció el glosario.');if(ap.lines.length&&ap.labels.length!==ap.lines.length)issues.push('Algún apéndice no está rotulado como APÉNDICE A, B, C…');if(an.lines.length&&an.labels.length!==an.lines.length)issues.push('Algún anexo no está rotulado como ANEXO A, B, C…');if(ap.gaps.length)issues.push('La secuencia de letras de los apéndices presenta saltos o desorden.');if(an.gaps.length)issues.push('La secuencia de letras de los anexos presenta saltos o desorden.');
  const c=getCitations($('citationsText').value),rk=refs.map(refKey);const miss=c.filter(x=>!rk.some(r=>firstTokenName(r.lead)===firstTokenName(x.author)&&r.year===x.year));if(miss.length)issues.push(`${miss.length} cita(s) no encuentran referencia autor-año correspondiente.`);
  const status=issues.length>=4?['bad','🔴 REQUIERE CORRECCIÓN']:issues.length?['warn','🟡 CUMPLE PARCIALMENTE']:['ok','🟢 CUMPLE CONTROLES BÁSICOS'];
  show($('integralOutput'),status[0],`<h4>${status[1]} — PARTE FINAL</h4><div class="review-kpis"><div class="review-kpi"><span class="k">Referencias</span><span class="v">${refs.length}</span><span class="d">Entradas</span></div><div class="review-kpi"><span class="k">Glosario</span><span class="v">${gl.length}</span><span class="d">Términos</span></div><div class="review-kpi"><span class="k">Apéndices</span><span class="v">${ap.lines.length}</span><span class="d">Inventariados</span></div><div class="review-kpi"><span class="k">Anexos</span><span class="v">${an.lines.length}</span><span class="d">Inventariados</span></div></div>${issues.length?`<h4>Qué falta o debe corregirse</h4><ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="report-section"><h4>Control final</h4><p>Verifica en Word la sangría francesa de las referencias, la paginación y saltos de página, la calidad de escaneo de anexos, la legibilidad de códigos y tablas extensas, y que cada elemento complementario haya sido llamado desde el texto cuando corresponda.</p></div>`);
});

function deepPrompt(){return `ACTÚA COMO REVISOR METODOLÓGICO Y DOCUMENTAL DE UN PROYECTO DE GRADO DE INGENIERÍA ELECTRÓNICA.

REVISA EXCLUSIVAMENTE LA PARTE FINAL NO NUMERADA DEL DOCUMENTO:
1. REFERENCIAS BIBLIOGRÁFICAS
2. GLOSARIO
3. APÉNDICES
4. ANEXOS

CITAS QUE EL ESTUDIANTE DECLARA HABER UTILIZADO:
${$('citationsText').value||'[NO INGRESADAS]'}

REFERENCIAS BIBLIOGRÁFICAS:
${$('referencesText').value||'[NO INGRESADAS]'}

GLOSARIO:
${$('glossaryText').value||'[NO INGRESADO]'}

INVENTARIO DE APÉNDICES:
${$('appendixInventory').value||'[NO INGRESADO]'}

INVENTARIO DE ANEXOS:
${$('annexInventory').value||'[NO INGRESADO]'}

CRITERIOS OBLIGATORIOS:
- Se utiliza APA 6 para las referencias bibliográficas, respetando el reglamento institucional cuando corresponda.
- Toda fuente incluida en referencias debe haber sido citada en el documento y toda cita utilizada debe tener su referencia final.
- Referencias en orden alfabético, sin numeración y con sangría francesa en Word.
- No inventes autores, títulos, años, DOI, URL, editoriales, normas ni datos bibliográficos faltantes. Señala lo que debe verificarse.
- El administrador de fuentes de Word puede generar la bibliografía si las citas/fuentes fueron registradas previamente, pero el resultado debe revisarse manualmente.
- El glosario debe ser alfabético, breve, claro y contener solo términos que realmente aparezcan en el proyecto; no sustituye el marco teórico.
- APÉNDICE = material elaborado por el estudiante/investigador: código, algoritmos, diagramas propios, cuestionarios, matrices, tablas extensas de medición, cálculos, planos, manuales propios.
- ANEXO = material elaborado por terceros: datasheets, cartas, certificados, normas, mapas oficiales, cotizaciones, permisos, extractos de manuales, estadísticas institucionales.
- Cada apéndice o anexo debe comenzar en página nueva, rotularse consecutivamente A, B, C… y tener título descriptivo.
- El material complementario debe ser pertinente y debe mencionarse desde el cuerpo del proyecto cuando corresponda.
- No acumular material irrelevante ni trasladar a apéndices/anexos información que debería formar parte de los capítulos principales.

RESPONDE CON:
1. DICTAMEN GENERAL: 🟢 CUMPLE / 🟡 CUMPLE PARCIALMENTE / 🟠 REQUIERE REVISIÓN / 🔴 NO CUMPLE / 🔵 FALTA INFORMACIÓN.
2. A. REFERENCIAS: correspondencia cita↔referencia, orden, duplicados, datos faltantes y posibles problemas APA 6.
3. B. WORD: qué debe revisar el estudiante al generar la bibliografía automáticamente.
4. C. GLOSARIO: pertinencia, orden alfabético, definiciones demasiado extensas o insuficientes.
5. D. APÉNDICES: comprobar que cada elemento sea realmente producción propia y esté bien rotulado.
6. E. ANEXOS: comprobar procedencia externa, pertinencia, fuente y rotulación.
7. F. ELEMENTOS MAL CLASIFICADOS: indicar qué debería pasar de apéndice a anexo o viceversa y explicar por qué.
8. G. INFORMACIÓN FALTANTE Y CÓMO CORREGIRLA.
9. H. LISTA FINAL DE COMPROBACIÓN ANTES DE ENTREGA.

REGLA DE INTEGRIDAD:
NO inventes ni completes datos bibliográficos que no estén presentes. Si falta un dato, escribe exactamente qué debe buscar o verificar el estudiante.`}
$('copyPromptBtn').addEventListener('click',async()=>{await navigator.clipboard.writeText(deepPrompt());$('promptStatus').textContent='Prompt copiado.';setTimeout(()=>$('promptStatus').textContent='',1600)});
