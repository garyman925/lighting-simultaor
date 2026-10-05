import { contentOf, fingerprint } from './schema';
import type { ProjectContent } from './schema';

/** Domain snapshots only; one explicit gesture = one history step. */
export class ProjectHistory {
  present:ProjectContent;
  private past:ProjectContent[]=[];
  private future:ProjectContent[]=[];
  private before:ProjectContent|null=null;
  constructor(value:ProjectContent,private limit=100){this.present=contentOf(value);}
  get canUndo(){return this.past.length>0||!!this.before&&fingerprint(this.before)!==fingerprint(this.present);}
  get canRedo(){return this.future.length>0;}
  get inTransaction(){return this.before!==null;}
  begin(){if(!this.before)this.before=contentOf(this.present);}
  end(){if(!this.before)return;const before=this.before;this.before=null;if(fingerprint(before)!==fingerprint(this.present))this.push(before);}
  private push(value:ProjectContent){this.past.push(value);if(this.past.length>this.limit)this.past.shift();this.future=[];}
  update(next:ProjectContent){
    if(fingerprint(next)===fingerprint(this.present))return false;
    if(!this.before)this.push(this.present);this.present=contentOf(next);return true;
  }
  undo(){this.end();const previous=this.past.pop();if(previous){this.future.push(this.present);this.present=previous;}}
  redo(){this.end();const next=this.future.pop();if(next){this.past.push(this.present);this.present=next;}}
}
