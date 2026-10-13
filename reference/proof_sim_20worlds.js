// 20-world robustness run. Usage: for s in 1..20: node reference/proof_sim_20worlds.js <seed>. Prints worst-merchant % for default, early Triage, mature Triage (lifts differ by merchant).
const path=__dirname+'/../';
const fs=require('fs'), vm=require('vm');
const ctx={module:{},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path+'data.js','utf8')+'\n'+fs.readFileSync(path+'engine.js','utf8')+'\nthis.E={MERCHANT_POLICY,decide,scoreAction,checkGates,isAllowed,LIFT_TABLE,LADDER};',ctx);
const {MERCHANT_POLICY,decide,scoreAction,checkGates,isAllowed,LIFT_TABLE,LADDER}=ctx.E;
const TRUE=JSON.parse(JSON.stringify(LIFT_TABLE));
let seed=7; const rnd=()=>{let t=(seed+=0x6D2B79F5)|0; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296;};
const gauss=()=>{let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const pick=w=>{let r=rnd()*w.reduce((a,b)=>a+b[1],0);for(const [k,x] of w){if((r-=x)<=0)return k}return w[w.length-1][0]};
const logU=(a,b)=>Math.round(Math.exp(Math.log(a)+rnd()*(Math.log(b)-Math.log(a))));
const MERCHANTS={
 'Low-ticket fashion':   {aov:[300,1500],  margin:0.45, mix:[['UPI_TIMEOUT',35],['BANK_DECLINE',10],['OTP_FAILED',10],['NO_ATTEMPT',45]], repeat:0.25},
 'High-ticket electronics':{aov:[6000,45000],margin:0.10, mix:[['UPI_TIMEOUT',15],['BANK_DECLINE',45],['OTP_FAILED',25],['NO_ATTEMPT',15]], repeat:0.15},
 'High-margin D2C beauty':{aov:[600,3000],  margin:0.65, mix:[['UPI_TIMEOUT',25],['BANK_DECLINE',20],['OTP_FAILED',15],['NO_ATTEMPT',40]], repeat:0.45},
 'Home decor (Kaara-like)':{aov:[500,6500],  margin:0.35, mix:[['UPI_TIMEOUT',20],['BANK_DECLINE',40],['OTP_FAILED',10],['NO_ATTEMPT',30]], repeat:0.30},
};
function gen(m,n){const out=[];for(let i=0;i<n;i++){const fc=pick(m.mix);const rep=rnd()<m.repeat;
  out.push({id:'X'+i,orderValue:logU(m.aov[0],m.aov[1]),paymentMethod:fc==='UPI_TIMEOUT'?'upi':'card',bank:'B'+(i%7),failureCode:fc,
   sessionEndStage:fc==='NO_ATTEMPT'?(rnd()<0.55?'shipping':'payment_method'):'payment_attempt',isRepeatBuyer:rep,priorOrders:rep?2:0,
   codRiskScore:0.1,consentedChannels:rnd()<0.85?['whatsapp','push','voice','email']:['whatsapp','push'],hasOptedOut:rnd()<0.04,
   contactsThisWeek:rnd()<0.08?3:(rnd()<0.2?1:0),holdoutSeed:rnd(),minutesAgo:5});}return out;}
function setTable(t){for(const k in t){LIFT_TABLE[k].baseline=t[k].baseline;for(const a in t[k].lift)LIFT_TABLE[k].lift[a]=t[k].lift[a];}}
function noisy(sd){const t=JSON.parse(JSON.stringify(TRUE));for(const k in t)for(const a in t[k].lift)t[k].lift[a]*=Math.exp(sd*gauss());return t;}
const NV=(c,a,P)=>a==='hold'?0:scoreAction(c,a,P).netValue + P.contactFatigueCost*(1+0.5*(c.contactsThisWeek||0)); // net margin excl. notional fatigue
const NVF=(c,a,P)=>a==='hold'?0:scoreAction(c,a,P).netValue; // incl fatigue
const RULES={
 'Link to all':(c,P)=>'payment_link',
 'Link to all, call above ₹1,500':(c,P)=>c.orderValue>=1500?'voice_call':'payment_link',
 'Link to all, call above ₹5,000':(c,P)=>c.orderValue>=5000?'voice_call':'payment_link',
 'Call above ₹1,500, coupon otherwise':(c,P)=>c.orderValue>=1500?'voice_call':'discount',
 'Coupon to all':(c,P)=>'discount',
 'Link, coupon if no payment attempt':(c,P)=>c.failureCode==='NO_ATTEMPT'?'discount':'payment_link',
};
const allowedFallback=(c,a,P)=>{ if(a==='hold') return 'hold'; if(isAllowed(a,c,P)) return a; if(a!=='payment_link'&&isAllowed('payment_link',c,P)) return 'payment_link'; return 'hold';};
function run(hetSd, noiseSd, explore, label){
  seed=+process.argv[2]; const out={};
  for(const [mn,m] of Object.entries(MERCHANTS)){
    const cases=gen(m,2000);
    const P={...MERCHANT_POLICY,assumedMarginPct:m.margin,minOrderValueForVoice:0};
    const elig=cases.filter(c=>!checkGates(c,P,{systemicFailure:false}).blocked);
    // merchant-specific truth
    const truth=JSON.parse(JSON.stringify(TRUE)); if(hetSd>0) for(const k in truth) for(const a in truth[k].lift) truth[k].lift[a]*=Math.exp(hetSd*gauss());
    setTable(truth);
    const rr={}; for(const [rn,f] of Object.entries(RULES)) rr[rn]=elig.reduce((t,c)=>t+NV(c,allowedFallback(c,f(c,P),P),P),0);
    const bestNet=Math.max(...Object.values(rr));
    let tot=0; const draws=10;
    for(let d=0;d<draws;d++){
      const est=JSON.parse(JSON.stringify(truth)); for(const k in est) for(const a in est[k].lift) est[k].lift[a]*=Math.exp(noiseSd*gauss());
      let s=0; for(const c of elig){ setTable(est); const a=decide(c,P,{}).chosen.action; setTable(truth);
        const al=LADDER.filter(x=>isAllowed(x,c,P)); const ex=al.reduce((t,x)=>t+NV(c,x,P),0)/al.length; s+=(1-explore)*NV(c,a,P)+explore*ex; }
      tot+=s;
    }
    out[mn]={best:bestNet, def:rr['Link to all, call above ₹1,500'], tri:tot/draws};
  }
  setTable(TRUE);
  const row={scenario:label};
  for(const mn in out){ row[mn.slice(0,12)]= 'def '+Math.round(100*out[mn].def/out[mn].best)+'% | tri '+Math.round(100*out[mn].tri/out[mn].best)+'%'; }
  row.worstDef=Math.min(...Object.values(out).map(o=>Math.round(100*o.def/o.best)));
  row.worstTri=Math.min(...Object.values(out).map(o=>Math.round(100*o.tri/o.best)));
  return row;
}

const S=+process.argv[2];
const r2=run(0.4,0.35,0.10,'early'); 
const r3=run(0.4,0.15,0.05,'mature');
console.log(JSON.stringify({S,defW:r2.worstDef,triE:r2.worstTri,triM:r3.worstTri}));
