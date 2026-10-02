/** Nonblocking GPU elapsed queries. Never infer FPS from CPU submission or sparse renders. */
export class GpuTimer {
  private extension:{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
  private pending:WebGLQuery[]=[];
  private active:WebGLQuery|null=null;
  private values:number[]=[];
  constructor(private gl:WebGL2RenderingContext) {
    this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }
  get supported(){return !!this.extension;}
  get milliseconds(){return this.values.length?this.values.reduce((a,b)=>a+b,0)/this.values.length:null;}
  poll() {
    const gl=this.gl,e=this.extension;if(!e)return;
    if(gl.getParameter(e.GPU_DISJOINT_EXT)){this.pending.forEach(q=>gl.deleteQuery(q));this.pending=[];this.values=[];return;}
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)) {
      const q=this.pending.shift()!,ns=gl.getQueryParameter(q,gl.QUERY_RESULT);gl.deleteQuery(q);
      if(Number.isFinite(ns)&&ns>0){this.values.push(ns/1e6);if(this.values.length>60)this.values.shift();}
    }
  }
  begin(){this.poll();if(!this.extension||this.active||this.pending.length>=8)return;this.active=this.gl.createQuery();if(this.active)this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,this.active);}
  end(){if(this.active&&this.extension){this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}}
  /** Background-tab scheduling can span elapsed queries; discard that measurement epoch. */
  reset(){this.end();this.pending.forEach(q=>this.gl.deleteQuery(q));this.pending=[];this.values=[];}
  dispose(){this.reset();}
}
