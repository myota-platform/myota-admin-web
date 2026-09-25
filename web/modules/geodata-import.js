async function renderGeodata() { const view=$('geodata-view'); view.innerHTML=`<div class="page-heading"><div><p class="eyebrow">POSTGIS WORKFLOW</p><h1>Geodata review</h1><p class="muted">Candidates stay distinct from approved references until a scoped approver decides.</p></div></div><div class="toolbar"><select id="geo-programme"><option value="">All programmes</option>${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select><select id="geo-status"><option value="">All statuses</option><option value="CANDIDATE">Candidate</option><option value="PROPOSED">Proposed</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button class="secondary" id="geo-refresh">Refresh</button><button class="primary" id="geo-import-toggle">Import GeoJSON</button></div><div id="geo-import" class="panel" hidden><div class="panel-heading"><h2>Manual import</h2><span class="muted">Imported features enter as candidates.</span></div><form id="geo-import-form" class="form-grid"><label>Programme<select id="import-programme">${state.programmes.map(p=>`<option value="${esc(p.slug)}">${esc(p.name)}</option>`).join('')}</select></label><label>Source name<input id="import-source" value="Manual administration import" required></label><label class="wide">GeoJSON feature collection<textarea id="import-features" required>{"type":"FeatureCollection","features":[]}</textarea></label><div class="form-actions wide"><button class="primary">Queue import</button></div></form></div><article class="panel"><div class="panel-heading"><h2>Entity queue</h2><span id="geo-count" class="muted"></span></div><div id="geo-table" class="table-list"></div></article>`; $('geo-refresh').onclick=loadGeoTable; $('geo-import-toggle').onclick=()=>{$('geo-import').hidden=!$('geo-import').hidden}; $('geo-import-form').onsubmit=submitImport; await loadGeoTable(); }
async function loadGeoTable() { const query=new URLSearchParams(); if($('geo-programme').value)query.set('programme',$('geo-programme').value); if($('geo-status').value)query.set('status',$('geo-status').value); query.set('pageSize','100'); try { const data=await api(`/v1/geodata/entities?${query}`); $('geo-count').textContent=`${data.total} entities`; $('geo-table').innerHTML=(data.items||[]).map(e=>`<div class="table-row entity-row"><span><strong>${esc(e.name)}</strong><small>${esc(e.programmeSlug)} · ${esc(e.entityType)} · ${esc(e.provenance?.adapter||'manual')}</small></span><span class="status-pill ${esc(e.status.toLowerCase())}">${esc(e.status)}</span>${e.status==='PROPOSED'?`<span class="row-actions"><button class="approve" data-id="${esc(e.id)}">Approve</button><button class="reject" data-id="${esc(e.id)}">Reject</button></span>`:'<span class="muted">No action</span>'}</div>`).join('')||'<p class="muted empty">No entities match these filters.</p>'; document.querySelectorAll('.approve').forEach(b=>b.onclick=()=>reviewEntity(b.dataset.id,'APPROVED')); document.querySelectorAll('.reject').forEach(b=>b.onclick=()=>reviewEntity(b.dataset.id,'REJECTED')); } catch(error) { $('geo-table').innerHTML=`<div class="error-card">${esc(error.message)}</div>`; } }
async function reviewEntity(id, decision) { try { await api(`/v1/geodata/entities/${id}/review`,{method:'POST',body:JSON.stringify({decision,reviewerId:state.account.id,note:'Reviewed in administration web'}),headers:{'Idempotency-Key':crypto.randomUUID()}}); notify(`Entity ${decision.toLowerCase()}`,'success'); await loadGeoTable(); } catch(error) { notify(error.message,'error'); } }
async function submitImport(event) {
  event.preventDefault();
  try {
    const collection = JSON.parse($('import-features').value);
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('GeoJSON must be a FeatureCollection with a features array.');
    }
    const programmeSlug = $('import-programme')?.value || state.currentProgramme || state.programmes[0]?.slug;
    if (!programmeSlug) throw new Error('Select a programme before importing.');
    const data = await api('/v1/geodata/imports/manual', {
      method: 'POST',
      body: JSON.stringify({
        programmeSlug,
        adapter: 'MANUAL',
        source: {name: $('import-source').value, license: 'programme-supplied', retrievedAt: new Date().toISOString()},
        features: collection.features
      }),
      headers: {'Idempotency-Key': crypto.randomUUID()}
    });
    const created = data.created?.length || 0;
    const updated = data.updated?.length || 0;
    const skipped = data.skipped?.length || 0;
    notify(`GeoJSON import queued: ${created} created, ${updated} updated, ${skipped} skipped`, 'success');
    $('geo-import').hidden = true;
    state.geoSelected = null;
    state.geoLoadedViewportKey = '';
    await loadGeoReview();
  } catch (error) {
    notify(error.message, 'error');
  }
}
