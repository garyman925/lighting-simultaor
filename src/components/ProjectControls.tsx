import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ProjectController } from '../project/controller';
import type { ProjectDocument } from '../project/schema';
import { serializeProject } from '../project/schema';
import '../project.css';

export function ProjectControls({controller}:{controller:ProjectController}){
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot),p=state.project;
  const [open,setOpen]=useState(false),[projects,setProjects]=useState<ProjectDocument[]>([]),[warning,setWarning]=useState('');
  const [name,setName]=useState(p.name),[importText,setImportText]=useState(''),[exportText,setExportText]=useState('');
  const [deleting,setDeleting]=useState<ProjectDocument|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>setName(p.name),[p.name]);
  const refresh=async()=>{try{const result=await controller.list();setProjects(result.projects);setWarning(result.warnings.join(' '));}catch(error){controller.report(error);}};
  useEffect(()=>{if(open){dialog.current?.showModal();void refresh();}else dialog.current?.close();},[open]);
  useEffect(()=>{
    const before=(event:BeforeUnloadEvent)=>{if(controller.getSnapshot().status!=='Saved'){event.preventDefault();event.returnValue='';}};
    const visibility=()=>{if(document.visibilityState==='hidden')void controller.save();};
    const key=(event:KeyboardEvent)=>{
      const target=event.target instanceof HTMLElement?event.target:null;
      if(target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
      if(event.altKey||!(event.ctrlKey||event.metaKey))return;
      const k=event.key.toLowerCase();
      if(k==='z'){event.preventDefault();event.shiftKey?controller.redo():controller.undo();}
      else if(k==='y'&&event.ctrlKey){event.preventDefault();controller.redo();}
      else if(k==='s'){event.preventDefault();void controller.save();}
    };
    window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',key);};
  },[controller]);
  const run=async(action:()=>Promise<unknown>)=>{await action();await refresh();};
  const exportJson=()=>{
    const json=serializeProject(controller.getSnapshot().project);setExportText(json);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;
    a.download=`${p.name.replace(/[^\p{L}\p{N}_-]+/gu,'-')||'project'}.luma.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <>
    <div className="project-toolbar">
      <button onClick={()=>setOpen(true)} disabled={!state.ready}>Project ▾</button>
      <strong title={p.name}>{p.name}</strong><span role="status" data-testid="save-status" className={state.status==='Saved'?'saved':'unsaved'}>{!state.ready?'Restoring…':state.status}</span>
      <button disabled={!state.ready||state.busy||state.status==='Saving…'} onClick={()=>void controller.save()}>Save</button>
      <button aria-label="Undo" title="Undo · Ctrl/Cmd Z" disabled={!state.canUndo||state.busy} onClick={controller.undo}>↶ Undo</button>
      <button aria-label="Redo" title="Redo · Ctrl/Cmd Shift Z" disabled={!state.canRedo||state.busy} onClick={controller.redo}>↷ Redo</button>
    </div>
    {state.error&&<div className="project-error" role="alert">{state.error} <span>Your current work is still in this tab.</span> <button onClick={()=>void controller.save()}>Retry save</button><button onClick={()=>{setOpen(true);exportJson();}}>Export JSON backup</button></div>}
    <dialog ref={dialog} className="project-dialog" aria-label="Projects" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
      <div className="project-dialog-heading"><div><span className="eyebrow">LOCAL WORKSPACE · VS05A</span><h2>Projects</h2></div><button onClick={()=>setOpen(false)} aria-label="Close Projects">Close</button></div>
      <p>Saved in this browser on this device. Export JSON for an independent backup.</p>
      {state.error&&<p role="alert" className="project-warning">{state.error}</p>}
      {(warning||state.notice)&&<p role="status">{warning||state.notice}</p>}
      <fieldset disabled={state.busy||!state.ready}>
        <label className="project-label">Project name<input aria-label="Project name" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
        <div className="project-buttons"><button onClick={()=>void run(()=>controller.rename(p.id,name))}>Rename</button><button onClick={()=>void run(()=>controller.saveAs(`${name} copy`))}>Save As / Duplicate</button><button onClick={()=>void run(()=>controller.create())}>New Project</button></div>
        <p className="micro-note">New / Open saves current edits first. If saving fails, your current project stays open.</p>
        <label className="project-label">Shoot Notes<textarea aria-label="Shoot Notes" maxLength={20000} value={p.notes} onChange={e=>controller.edit({notes:e.target.value})} placeholder="Shoot brief, setup reminders, shot list…"/></label>
        <div className="project-buttons"><button onClick={()=>void run(()=>controller.save())}>Save Project</button><button onClick={exportJson}>Export Project JSON</button><label className="import-file">Import Project JSON<input aria-label="Import Project JSON file" type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>5_000_000){controller.report(new Error('Project file is too large (maximum 5 MB).'));return;}try{await run(async()=>controller.importJson(await file.text()));}catch(error){controller.report(error);}}}/></label></div>
        <details><summary>Paste JSON to import</summary><textarea aria-label="Import JSON text" value={importText} onChange={e=>setImportText(e.target.value)} maxLength={5_000_000}/><button onClick={()=>void run(async()=>{if(await controller.importJson(importText))setImportText('');})}>Import as new project</button></details>
        {exportText&&<details open><summary>JSON backup — copy if download is unavailable</summary><textarea aria-label="Project JSON backup" readOnly value={exportText}/></details>}
        <div className="project-list-heading"><h3>Saved projects</h3><button onClick={()=>void refresh()}>Refresh list</button></div>
        <ul className="project-list">{projects.map(project=><li key={project.id}><div><strong>{project.name}</strong>{project.id===p.id&&<small> · Current</small>}<time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleString()}</time></div>
          <div className="project-buttons"><button aria-label={`Open ${project.name}`} onClick={()=>void run(()=>controller.open(project.id))}>Open</button><button aria-label={`Rename ${project.name}`} onClick={()=>{const next=window.prompt('Project name',project.name);if(next!==null)void run(()=>controller.rename(project.id,next));}}>Rename</button><button aria-label={`Duplicate ${project.name}`} onClick={()=>void run(()=>controller.duplicate(project.id))}>Duplicate</button><button aria-label={`Delete ${project.name}`} onClick={()=>setDeleting(project)}>Delete</button></div></li>)}</ul>
        {!projects.length&&<p>No saved projects yet.</p>}
        {deleting&&<div className="delete-confirm" role="alert"><p>Delete “{deleting.name}” from this browser? This cannot be undone.</p><button onClick={()=>void run(async()=>{await controller.remove(deleting.id);setDeleting(null);})}>Confirm delete</button><button onClick={()=>setDeleting(null)}>Cancel delete</button></div>}
      </fieldset>
    </dialog>
  </>;
}
