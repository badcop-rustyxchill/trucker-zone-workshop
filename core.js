export const clone = value => JSON.parse(JSON.stringify(value));
export const round = n => Math.round(n * 10000) / 10000;
export const vector = p => ({x:round(p?.x ?? 0),y:round(p?.y ?? 0),z:round(p?.z ?? 0)});
export const toView = p => [p.x,p.y,-p.z];
export const fromView = p => vector({x:p.x,y:p.y,z:-p.z});
export const arrayKey = tab => tab === 'spawns' ? 'Spawn points' : 'Delivery zones';

export function settingsKey(config, monument) {
  return Object.keys(config.Monuments).find(k => k.toLowerCase() === monument.key.toLowerCase() || k.toLowerCase() === monument.prefab.toLowerCase()) ?? monument.key;
}
export function settings(config, monument, create = false) {
  const key = settingsKey(config, monument);
  if (!config.Monuments[key] && create) config.Monuments[key] = {'Enabled':true,'Display name':monument.name,'Allowed delivery types':[],'Spawn points':[],'Delivery zones':[]};
  return config.Monuments[key];
}
export function points(config, monument, tab) { return settings(config,monument)?.[arrayKey(tab)] ?? []; }
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.Monuments || typeof value.Monuments !== 'object' || Array.isArray(value.Monuments)) throw new Error('Choose a TruckerEvent configuration containing a Monuments object.');
  const vec = (p,label) => {if(!p || !['x','y','z'].every(a=>typeof p[a]==='number' && Number.isFinite(p[a]))) throw new Error(`${label} needs finite x, y and z coordinates.`);};
  for (const [key,s] of Object.entries(value.Monuments)) {
    if (!s || typeof s!=='object' || Array.isArray(s)) throw new Error(`Invalid monument settings: ${key}`);
    for (const field of ['Spawn points','Delivery zones']) {
      if (s[field]!==undefined && !Array.isArray(s[field])) throw new Error(`${key}: ${field} must be an array.`);
      for (const [i,p] of (s[field]??[]).entries()) {
        vec(p?.['Local position'],`${key}, ${field} #${i+1}`);
        if(field==='Spawn points') vec(p['Local rotation'],`${key}, rotation #${i+1}`);
        else if(typeof p.Radius!=='number'||!Number.isFinite(p.Radius)||p.Radius<=0) throw new Error(`${key}, zone #${i+1}: radius must be greater than zero.`);
      }
    }
  }
  return clone(value);
}
export function exportConfig(config) {
  const value = validateConfig(config);
  for(const s of Object.values(value.Monuments)) for(const field of ['Spawn points','Delivery zones']) for(const p of s[field]??[]) {
    p['Local position']=vector(p['Local position']);
    if(field==='Spawn points') p['Local rotation']=vector(p['Local rotation']);
    else p.Radius=round(p.Radius);
  }
  return value;
}
export function newPoint(tab,p={x:0,y:0,z:0}) {
  return tab==='spawns' ? {'Local position':vector(p),'Local rotation':{x:0,y:0,z:0}} : {'Local position':vector(p),'Radius':10};
}
export function sampleTerrain(t,x,z) {
  if(!t) return null;
  const u=(x-t.origin.x)/t.size.x, v=(z-t.origin.z)/t.size.z;
  if(u<0||v<0||u>1||v>1) return null;
  const fx=u*(t.width-1),fz=v*(t.height-1),x0=Math.floor(fx),z0=Math.floor(fz),x1=Math.min(x0+1,t.width-1),z1=Math.min(z0+1,t.height-1);
  const interp=a => (a[z0*t.width+x0]*(1-(fx-x0))+a[z0*t.width+x1]*(fx-x0))*(1-(fz-z0))+ (a[z1*t.width+x0]*(1-(fx-x0))+a[z1*t.width+x1]*(fx-x0))*(fz-z0);
  if(t.alpha && interp(t.alpha)<.5) return null;
  if(t.blend && interp(t.blend)<.02) return null;
  return interp(t.heights);
}
