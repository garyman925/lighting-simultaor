import { ProjectHistory } from './history';
import { contentOf, fingerprint, newProject, parseProject } from './schema';
import type { ProjectContent, ProjectDocument } from './schema';
import type { ProjectRepository } from './repository';
import type { SceneDocument } from '../domain/scene';
export interface ProjectState {
  project:ProjectDocument; status:'Saved'|'Saving…'|'Unsaved'; error:string; notice:string;
  ready:boolean; busy:boolean; canUndo:boolean; canRedo:boolean; boundary:number;
}
export class ProjectController {
  private history=new ProjectHistory(newProject());
  private document=newProject();
  private savedFingerprint='';
  private revision:string|null=null;
  private listeners=new Set<()=>void>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private pending:Promise<boolean>|undefined;
  private initialization:Promise<void>|undefined;
  private transactionOwner:unknown;
  private state:ProjectState;
  constructor(private repository:ProjectRepository,private debounceMs=900){
    this.history=new ProjectHistory(this.document);
    this.state={project:this.document,status:'Unsaved',error:'',notice:'',ready:false,busy:false,canUndo:false,canRedo:false,boundary:0};
  }
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private emit(patch:Partial<ProjectState>={}){
    this.state={...this.state,project:{...this.document,...contentOf(this.history.present)},canUndo:this.history.canUndo,canRedo:this.history.canRedo,...patch};
    this.listeners.forEach(fn=>fn());
  }
  private get dirty(){return fingerprint(this.history.present)!==this.savedFingerprint;}
  private changed(){
    clearTimeout(this.timer);
    this.emit({status:this.pending?'Saving…':this.dirty?'Unsaved':'Saved'});
    if(this.dirty&&this.state.ready&&!this.state.error)this.timer=setTimeout(()=>{void this.save();},this.debounceMs);
  }
  begin=(owner:unknown='gesture')=>{if(this.transactionOwner!==owner)this.history.end();this.transactionOwner=owner;this.history.begin();};
  end=(owner?:unknown)=>{if(owner!==undefined&&owner!==this.transactionOwner)return;this.history.end();this.transactionOwner=undefined;this.emit();};
  setScene=(update:SceneDocument|((scene:SceneDocument)=>SceneDocument))=>{
    if(!this.state.ready||this.state.busy)return;
    const scene=typeof update==='function'?update(this.history.present.scene):update;
    if(scene.lights.length>100){this.report(new Error('A project supports up to 100 lights. Remove a light before adding another.'));return;}
    if(this.history.update({...this.history.present,scene}))this.changed();
  };
  edit=(patch:Partial<Pick<ProjectContent,'name'|'notes'>>)=>{if(this.state.ready&&!this.state.busy&&this.history.update({...this.history.present,...patch}))this.changed();};
  undo=()=>{if(this.state.busy)return;this.history.undo();this.changed();};
  redo=()=>{if(this.state.busy)return;this.history.redo();this.changed();};
  private replace(project:ProjectDocument,saved:boolean){
    clearTimeout(this.timer);this.document=project;this.history=new ProjectHistory(project);
    this.savedFingerprint=saved?fingerprint(project):'';this.revision=saved?project.revision:null;
    this.emit({error:'',notice:'',status:saved?'Saved':'Unsaved',boundary:this.state.boundary+1});
  }
  initialize(){
    if(this.initialization)return this.initialization;
    this.initialization=(async()=>{
      try{const id=await this.repository.last();if(id){const project=await this.repository.get(id);if(project)this.replace(project,true);}}
      catch(error){this.report(error);}
      finally{this.emit({ready:true});this.changed();}
    })();return this.initialization;
  }
  report=(error:unknown)=>{clearTimeout(this.timer);this.emit({error:error instanceof Error?error.message:String(error),status:this.dirty?'Unsaved':'Saved'});};
  async save():Promise<boolean>{
    clearTimeout(this.timer);
    if(this.pending){const ok=await this.pending;return ok&&this.dirty?this.save():ok;}
    if(!this.dirty)return true;
    const snapshot={...this.document,...contentOf(this.history.present),updatedAt:new Date().toISOString(),revision:crypto.randomUUID()};
    const hash=fingerprint(snapshot),expected=this.revision;
    this.emit({status:'Saving…',error:''});
    this.pending=(async()=>{
      try{await this.repository.put(snapshot,expected);this.document=snapshot;this.revision=snapshot.revision;this.savedFingerprint=hash;return true;}
      catch(error){this.report(error);return false;}
    })();
    const ok=await this.pending;this.pending=undefined;this.changed();return ok;
  }
  /** Save the departing project first. Failure keeps the editor on that project. */
  private async transition(operation:()=>Promise<void>){
    if(this.state.busy)return false;
    this.end();this.emit({busy:true});
    try{if(!await this.save())return false;await operation();return true;}
    catch(error){this.report(error);return false;}
    finally{this.emit({busy:false});this.changed();}
  }
  create=(name='Untitled project')=>this.transition(async()=>{this.replace(newProject(name),false);await this.save();});
  open=(id:string)=>this.transition(async()=>{const p=await this.repository.get(id);if(!p)throw new Error('This project no longer exists.');await this.repository.activate(id);this.replace(p,true);});
  /** Explicit recovery action: may bypass a conflict on the original project. */
  async saveAs(name:string){
    if(this.state.busy)return false;this.end();clearTimeout(this.timer);this.emit({busy:true});
    try{
      if(this.pending)await this.pending;
      const p={...newProject(name),...contentOf(this.history.present),name:name.trim()||'Untitled project'};
      await this.repository.put(p,null);this.replace(p,true);return true;
    }catch(error){this.report(error);return false;}finally{this.emit({busy:false});}
  }
  async importJson(json:string){
    try{
      const {project,warnings}=parseProject(json);
      return await this.transition(async()=>{
        const p={...project,id:crypto.randomUUID(),revision:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await this.repository.put(p,null);this.replace(p,true);this.emit({notice:warnings.join(' ')||'Imported as a new project.'});
      });
    }catch(error){this.report(error);return false;}
  }
  list=()=>this.repository.list();
  async rename(id:string,name:string){
    if(id===this.document.id){this.edit({name:name.trim()||'Untitled project'});this.end();return this.save();}
    try{const p=await this.repository.get(id);if(!p)throw new Error('Project no longer exists.');await this.repository.put({...p,name:name.trim()||'Untitled project',updatedAt:new Date().toISOString(),revision:crypto.randomUUID()},p.revision);await this.repository.activate(this.document.id);return true;}
    catch(error){this.report(error);return false;}
  }
  async duplicate(id:string){
    if(id===this.document.id)return this.saveAs(`${this.history.present.name} copy`);
    return this.transition(async()=>{const p=await this.repository.get(id);if(!p)throw new Error('Project no longer exists.');const copy={...p,id:crypto.randomUUID(),name:`${p.name} copy`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:crypto.randomUUID()};await this.repository.put(copy,null);this.replace(copy,true);});
  }
  remove=(id:string)=>this.transition(async()=>{await this.repository.remove(id);if(id===this.document.id){this.replace(newProject(),false);await this.save();}});
}
