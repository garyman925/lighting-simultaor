import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { contentOf, newProject, parseProject, serializeProject, validateProject } from '../src/project/schema';
import { ProjectHistory } from '../src/project/history';
import { IndexedDBProjects } from '../src/project/repository';
import { ProjectController } from '../src/project/controller';
import { addLight, deleteLight, makePortraitScene, makeThreeLightScene, updateLight } from '../src/domain/scene';
import { updateModel } from '../src/domain/model';
import { makeModifier, withGrid } from '../src/domain/equipment';

describe('project trust boundary and migrations',()=>{
  it('round-trips ten lights, pose, notes, skin, equipment, exposure and render settings',()=>{
    const p=newProject('Ten lights');p.notes='Shoot notes\nsecond line';
    for(let i=1;i<10;i++)p.scene=addLight(p.scene,`light-${i}`);
    p.scene=updateModel(p.scene,{hairStyle:'curly',bodyPreset:'full',pose:'Profile Left',headYaw:12,headPitch:-8});
    p.scene.lights[2].modifier=withGrid(makeModifier('stripbox','40x180'),true);p.scene.camera.iso=800;p.scene.render.quality='High';
    expect(parseProject(serializeProject(p)).project).toEqual(p);
  });
  it.each(['{}','null','[]','{','{"projectVersion":99}','{"projectVersion":1,"scene":{}}'])('rejects malformed or unknown JSON: %s',json=>expect(()=>parseProject(json)).toThrow());
  it('rejects huge input',()=>expect(()=>parseProject(' '.repeat(5_000_001))).toThrow('too large'));
  it('migrates exported VS01/02 legacy scene and supplies model defaults',()=>{
    const raw=JSON.parse(JSON.stringify(makePortraitScene()));raw.schemaVersion=1;delete raw.model.skin;delete raw.model.pose;
    raw.lights[0].modifier={presetId:'softbox-120',widthM:.9,heightM:1.2};
    const result=validateProject(raw);expect(result.project.projectVersion).toBe(1);expect(result.project.scene.schemaVersion).toBe(2);
    expect(result.project.scene.model.pose).toBe('Front');expect(result.project.scene.lights[0].modifier.widthM).toBe(.9);expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('defaults optional fields and rejects missing required structure',()=>{
    const p=newProject();delete (p.scene as Partial<typeof p.scene>).environment;
    expect(validateProject(p).project.scene.environment.widthM).toBe(8);
    expect(()=>validateProject({...p,scene:{schemaVersion:2}})).toThrow('missing');
  });
  it('sanitizes nonfinite, zero quaternion, illegal colours, duplicate IDs and strips foreign objects',()=>{
    const p=newProject();p.scene.model.heightCm=Infinity;p.scene.camera.fNumber=0;p.scene.model.transform.quaternion=[0,0,0,0];p.scene.model.hairColor='javascript:bad';
    p.scene.lights.push(structuredClone(p.scene.lights[0]));
    const result=validateProject({...p,renderer:{secret:'excluded'},scene:{...p.scene,selected:'camera'}});
    expect(result.project.scene.model.heightCm).toBe(175);expect(result.project.scene.camera.fNumber).toBe(1);
    expect(result.project.scene.model.transform.quaternion).toEqual([0,0,0,1]);expect(result.project.scene.lights[0].id).not.toBe(result.project.scene.lights[1].id);
    expect(serializeProject(result.project)).not.toMatch(/javascript|excluded|selected/);expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('rejects unsupported equipment and oversized light lists',()=>{
    const p=newProject();(p.scene.lights[0].modifier as {equipmentId:string}).equipmentId='alien';expect(()=>validateProject(p)).toThrow('equipment');
    p.scene.lights=Array.from({length:101},()=>p.scene.lights[0]);expect(()=>validateProject(p)).toThrow('100 lights');
  });
});

describe('domain snapshot transactions',()=>{
  it('coalesces 200 continuous transform frames to one step, including exact light settings/order',()=>{
    const p=newProject(),h=new ProjectHistory(p),before=contentOf(p);h.begin();
    for(let i=0;i<200;i++)h.update({...h.present,scene:updateLight(h.present.scene,'light-key',{name:`Frame ${i}`})});
    h.end();h.undo();expect(h.present).toEqual(before);expect(h.canUndo).toBe(false);h.redo();expect(h.present.scene.lights[0].name).toBe('Frame 199');
  });
  it('restores deleted light ID, settings and order; redo deletes it again',()=>{
    const p=newProject('Three',makeThreeLightScene()),h=new ProjectHistory(p);h.update({...h.present,scene:deleteLight(p.scene,'light-fill')});
    h.undo();expect(h.present.scene).toEqual(p.scene);h.redo();expect(h.present.scene.lights.map(l=>l.id)).toEqual(['light-key','light-rim']);
  });
  it('ignores cancelled gestures and no-ops; new edits discard redo',()=>{
    const p=newProject(),h=new ProjectHistory(p);h.begin();h.update({...p,name:'a'});h.update(p);h.end();expect(h.canUndo).toBe(false);
    h.update({...p,name:'b'});h.undo();h.update({...p,name:'c'});expect(h.canRedo).toBe(false);
  });
  it('history is bounded and excludes project identity and transient UI',()=>{
    const h=new ProjectHistory(newProject(),2);for(let i=0;i<5;i++)h.update({...h.present,name:`p${i}`});h.undo();h.undo();expect(h.canUndo).toBe(false);
    expect(Object.keys(h.present)).toEqual(['name','notes','scene']);
  });
});

const repository=()=>new IndexedDBProjects(new IDBFactory());
describe('IndexedDB repository',()=>{
  it('atomic CRUD and last-project recovery persist across repository connections',async()=>{
    const factory=new IDBFactory(),r=new IndexedDBProjects(factory),p=newProject();await r.put(p,null);
    const reopened=new IndexedDBProjects(factory);expect(await reopened.last()).toBe(p.id);expect(await reopened.get(p.id)).toEqual(p);
    await reopened.put({...p,name:'Renamed',revision:'new'},p.revision);expect((await r.list()).projects[0].name).toBe('Renamed');
    await reopened.remove(p.id);expect(await r.get(p.id)).toBeUndefined();expect(await r.last()).toBeUndefined();
  });
  it('prevents stale tab overwrite and resurrection after deletion',async()=>{
    const r=repository(),p=newProject();await r.put(p,null);await r.put({...p,revision:'new'},p.revision);
    await expect(r.put({...p,name:'stale'},p.revision)).rejects.toThrow('another tab');expect((await r.get(p.id))?.name).toBe(p.name);
    await r.remove(p.id);await expect(r.put(p,p.revision)).rejects.toThrow('another tab');
  });
  it('unavailable storage fails clearly',async()=>{const r=new IndexedDBProjects(undefined);await expect(r.list()).rejects.toThrow('unavailable');});
  it('damaged records remain untouched and healthy projects remain usable',async()=>{
    const factory=new IDBFactory(),r=new IndexedDBProjects(factory),p=newProject();await r.put(p,null);
    const db=await new Promise<IDBDatabase>((resolve)=>{const req=factory.open('luma-studio-projects',1);req.onsuccess=()=>resolve(req.result);});
    await new Promise<void>(resolve=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:'broken',projectVersion:999});tx.oncomplete=()=>resolve();});
    const result=await r.list();expect(result.projects).toHaveLength(1);expect(result.warnings).toHaveLength(1);await expect(r.get('broken')).rejects.toThrow('version');db.close();
  });
});

afterEach(()=>vi.useRealTimers());
describe('save / history / debounce integration',()=>{
  it('unrelated focus loss cannot close a gizmo or slider gesture',async()=>{
    const c=new ProjectController(repository());await c.initialize();await c.save();const before=contentOf(c.getSnapshot().project);
    c.begin('gizmo');c.end('old-button');for(let i=0;i<40;i++)c.edit({notes:`frame${i}`});c.end('gizmo');
    c.undo();expect(contentOf(c.getSnapshot().project)).toEqual(before);expect(c.getSnapshot().canUndo).toBe(false);
    c.begin('old-text');c.edit({name:'text'});c.begin('slider');c.end('old-text');c.edit({notes:'slider1'});c.edit({notes:'slider2'});c.end('slider');
    c.undo();expect(c.getSnapshot().project.notes).toBe('');expect(c.getSnapshot().project.name).toBe('text');await c.save();
  });
  it('debounce actually writes on expiry, not on each frame',async()=>{
    const r=repository(),c=new ProjectController(r,900);await c.initialize();await c.save();
    const spy=vi.spyOn(r,'put').mockResolvedValue();vi.useFakeTimers();
    c.edit({notes:'a'});await vi.advanceTimersByTimeAsync(500);c.edit({notes:'b'});
    await vi.advanceTimersByTimeAsync(899);expect(spy).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(1);expect(spy.mock.calls[0][0].notes).toBe('b');expect(c.getSnapshot().status).toBe('Saved');
  });
  it('autosaves once after a burst, keeps history, and identifies the saved revision on undo',async()=>{
    const r=repository(),c=new ProjectController(r,900);await c.initialize();await c.save();
    const spy=vi.spyOn(r,'put');vi.useFakeTimers();c.begin();
    for(let i=0;i<50;i++)c.edit({notes:`note ${i}`});c.end();
    await vi.advanceTimersByTimeAsync(899);expect(spy).not.toHaveBeenCalled();vi.useRealTimers();await c.save();expect(spy).toHaveBeenCalledTimes(1);
    c.edit({name:'changed'});expect(c.getSnapshot().status).toBe('Unsaved');c.undo();expect(c.getSnapshot().status).toBe('Saved');
    c.undo();expect(c.getSnapshot().project.notes).toBe('');expect(c.getSnapshot().status).toBe('Unsaved');await c.save();
  });
  it('isolates projects, notes, duplication, import and history boundaries',async()=>{
    const r=repository(),c=new ProjectController(r);await c.initialize();c.edit({name:'First',notes:'keep'});c.setScene(makeThreeLightScene());await c.save();const first=c.getSnapshot().project;
    await c.create('Second');expect(c.getSnapshot().canUndo).toBe(false);expect(c.getSnapshot().project.scene.lights).toHaveLength(1);
    await c.open(first.id);expect(c.getSnapshot().project.notes).toBe('keep');expect(c.getSnapshot().project.scene.lights).toHaveLength(3);expect(c.getSnapshot().canUndo).toBe(false);
    await c.duplicate(first.id);expect(c.getSnapshot().project.id).not.toBe(first.id);expect(c.getSnapshot().project.notes).toBe('keep');
    await c.importJson(serializeProject(first));expect(c.getSnapshot().project.id).not.toBe(first.id);expect(contentOf(c.getSnapshot().project)).toEqual(contentOf(first));
    const reloaded=new ProjectController(r);await reloaded.initialize();expect(reloaded.getSnapshot().project).toEqual(c.getSnapshot().project);expect(reloaded.getSnapshot().canUndo).toBe(false);
  });
  it('quota failure keeps edits, blocks New, supports export and recovery',async()=>{
    const r=repository(),c=new ProjectController(r);await c.initialize();await c.save();const id=c.getSnapshot().project.id;
    const spy=vi.spyOn(r,'put').mockRejectedValue(new Error('Quota exceeded'));c.edit({notes:'do not lose'});expect(await c.create()).toBe(false);
    expect(c.getSnapshot().project.id).toBe(id);expect(c.getSnapshot().error).toContain('Quota');expect(c.getSnapshot().status).toBe('Unsaved');
    expect(parseProject(serializeProject(c.getSnapshot().project)).project.notes).toBe('do not lose');spy.mockRestore();await c.save();expect(c.getSnapshot().status).toBe('Saved');
  });
  it('in-flight save cannot mark newer edits saved; switching waits for latest revision',async()=>{
    const r=repository(),c=new ProjectController(r);await c.initialize();await c.save();const id=c.getSnapshot().project.id;
    const original=r.put.bind(r);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    vi.spyOn(r,'put').mockImplementationOnce(async(p,expected)=>{await gate;await original(p,expected);});
    c.edit({notes:'one'});const saving=c.save();c.edit({notes:'two'});release();await saving;expect(c.getSnapshot().status).toBe('Unsaved');
    await c.create();expect((await r.get(id))?.notes).toBe('two');
  });
  it('save-as recovers a cross-tab conflict without overwriting the other tab',async()=>{
    const r=repository(),c=new ProjectController(r);await c.initialize();await c.save();const p=c.getSnapshot().project;
    await r.put({...p,revision:'other',notes:'other tab'},p.revision);c.edit({notes:'my edits'});expect(await c.save()).toBe(false);
    expect(await c.saveAs('Recovery')).toBe(true);expect(c.getSnapshot().project.notes).toBe('my edits');expect((await r.get(p.id))?.notes).toBe('other tab');
  });
  it('invalid import leaves project and history intact',async()=>{
    const c=new ProjectController(repository());await c.initialize();await c.save();c.edit({notes:'edit'});const before=c.getSnapshot().project;
    expect(await c.importJson('{')).toBe(false);expect(c.getSnapshot().project).toEqual(before);expect(c.getSnapshot().canUndo).toBe(true);await c.save();
  });
});
