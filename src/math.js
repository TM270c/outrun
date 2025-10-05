const clamp01 = (t) => (t < 0 ? 0 : (t > 1 ? 1 : t));

const easeLinear = (a,b,t)=> a + (b-a) * clamp01(t);
const easeInQuad = (a,b,t)=> a + (b-a) * Math.pow(clamp01(t), 2);
const easeOutQuad= (a,b,t)=> a + (b-a) * (1 - Math.pow(1 - clamp01(t), 2));
const easeInCub  = (a,b,t)=> a + (b-a) * Math.pow(clamp01(t), 3);
const easeOutCub = (a,b,t)=> a + (b-a) * (1 - Math.pow(1 - clamp01(t), 3));

const easeInOutQuad01 = (t)=> (t<0.5)? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
const easeInOutCub01  = (t)=> (t<0.5)? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

function getEase01(spec){
  const clamp01 = (x)=> x<0?0:x>1?1:x;
  const raw = (spec||'smooth:io').toLowerCase().trim();
  const [kind, modeRaw] = raw.split(':');
  const mode = (modeRaw||'io');
  const K = {
    linear: { in:(t)=>t, out:(t)=>t, io:(t)=>t },
    smooth: { in:(t)=>Math.pow(clamp01(t),2), out:(t)=>1-Math.pow(1-clamp01(t),2), io:easeInOutQuad01 },
    sharp:  { in:(t)=>Math.pow(clamp01(t),3), out:(t)=>1-Math.pow(1-clamp01(t),3), io:easeInOutCub01 },
  };
  return (K[kind]||K.smooth)[mode] || K.smooth.io;
}

const CURVE_EASE = {
  linear: { in: easeLinear,  out: easeLinear },
  smooth: { in: easeInQuad,  out: easeOutQuad },
  sharp:  { in: easeInCub,   out: easeOutCub },
};

const pctRem=(n,total)=>(n%total)/total;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

const computeCurvature=(dy,d2y)=> d2y/Math.pow(1+dy*dy,1.5);
const tangentNormalFromSlope=(dy)=>{ const inv=1/Math.sqrt(1+dy*dy); return { tx:inv, ty:dy*inv, nx:-dy*inv, ny:inv }; };

window.MathUtil = {
  clamp01,
  lerp,
  clamp,
  pctRem,
  easeLinear,
  easeInQuad,
  easeOutQuad,
  easeInCub,
  easeOutCub,
  easeInOutQuad01,
  easeInOutCub01,
  getEase01,
  CURVE_EASE,
  computeCurvature,
  tangentNormalFromSlope,
};

Object.freeze(window.MathUtil);
