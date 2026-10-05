import { validateProject } from './schema';
import type { ProjectDocument } from './schema';
export interface ProjectRepository {
  list():Promise<{projects:ProjectDocument[];warnings:string[]}>;
  get(id:string):Promise<ProjectDocument|undefined>;
  put(project:ProjectDocument,expectedRevision:string|null):Promise<void>;
  remove(id:string):Promise<void>;
  last():Promise<string|undefined>;
  activate(id:string):Promise<void>;
}
export class IndexedDBProjects implements ProjectRepository {
  private connection:Promise<IDBDatabase>|undefined;
  constructor(private factory:IDBFactory|undefined=globalThis.indexedDB,private name='luma-studio-projects'){}
  private db():Promise<IDBDatabase>{
    if(this.connection)return this.connection;
    this.connection=new Promise((resolve,reject)=>{
      if(!this.factory){reject(new Error('Browser storage is unavailable. Export JSON to keep your work.'));return;}
      const request=this.factory.open(this.name,1);
      let settled=false;
      const fail=(error:unknown)=>{settled=true;reject(error);};
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
        if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings');
      };
      request.onblocked=()=>fail(new Error('Storage upgrade is blocked. Close other LUMA tabs and retry.'));
      request.onerror=()=>fail(request.error??new Error('Cannot open browser storage.'));
      request.onsuccess=()=>{
        const db=request.result;if(settled){db.close();return;}
        db.onversionchange=()=>{db.close();this.connection=undefined;};resolve(db);
      };
    });
    this.connection.catch(()=>{this.connection=undefined;});return this.connection;
  }
  private async transaction<T>(stores:string[],mode:IDBTransactionMode,operation:(tx:IDBTransaction,done:(value:T)=>void)=>void):Promise<T>{
    const db=await this.db();
    return new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(stores,mode);let value:T;
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??new Error('Storage transaction aborted.'));tx.onerror=()=>reject(tx.error??new Error('Storage write failed.'));
      try{operation(tx,v=>{value=v;});}catch(error){tx.abort();reject(error);}
    });
  }
  async list(){
    const values=await this.transaction<unknown[]>(['projects'],'readonly',(tx,done)=>{const r=tx.objectStore('projects').getAll();r.onsuccess=()=>done(r.result);});
    const projects:ProjectDocument[]=[],warnings:string[]=[];
    for(const value of values){try{projects.push(validateProject(value).project);}catch{warnings.push('An incompatible or damaged project was left untouched in storage.');}}
    return {projects:projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),warnings};
  }
  async get(id:string){const value=await this.transaction<unknown>(['projects'],'readonly',(tx,done)=>{const r=tx.objectStore('projects').get(id);r.onsuccess=()=>done(r.result);});return value===undefined?undefined:validateProject(value).project;}
  async put(project:ProjectDocument,expectedRevision:string|null){
    // Read + compare + write in one transaction prevents stale tabs silently overwriting work.
    let conflict=false;
    try{await this.transaction<void>(['projects','settings'],'readwrite',(tx,done)=>{
      const store=tx.objectStore('projects'),r=store.get(project.id);
      r.onsuccess=()=>{
        const previous=r.result as ProjectDocument|undefined;
        if((previous?.revision??null)!==expectedRevision){conflict=true;tx.abort();return;}
        store.put(project);tx.objectStore('settings').put(project.id,'lastProject');done(undefined);
      };
    });}catch(error){if(conflict)throw new Error('This project changed in another tab. Save As a new project to keep your edits, or reopen the saved version.');throw error;}
  }
  async remove(id:string){await this.transaction<void>(['projects','settings'],'readwrite',(tx,done)=>{
    tx.objectStore('projects').delete(id);const r=tx.objectStore('settings').get('lastProject');r.onsuccess=()=>{if(r.result===id)tx.objectStore('settings').delete('lastProject');done(undefined);};
  });}
  last(){return this.transaction<string|undefined>(['settings'],'readonly',(tx,done)=>{const r=tx.objectStore('settings').get('lastProject');r.onsuccess=()=>done(r.result);});}
  async activate(id:string){await this.transaction<void>(['settings'],'readwrite',(tx,done)=>{tx.objectStore('settings').put(id,'lastProject');done(undefined);});}
}
