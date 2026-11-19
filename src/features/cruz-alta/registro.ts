import type { GroundPoint } from "./scene-types";
// Parâmetros da similaridade ajustada com quatro pontos de controle, em metros.
// X cresce para leste e Z para sul. O piso cênico é relativo, sem datum vertical.
export const origin={latitude:-28.66355384,longitude:-53.60602301};
const a=0.00002437445584, b=0.40389939532285, x0=258.735079782470, z0=-235.225100675031;
export function sheetToGround([u,v]:GroundPoint):GroundPoint{return [a*u-b*v+x0,b*u+a*v+z0];}
export function groundToSheet([x,z]:GroundPoint):GroundPoint{
 const east=x-x0,south=z-z0,det=a*a+b*b;
 return [(a*east+b*south)/det,(-b*east+a*south)/det];
}
const radians=Math.PI/180, radius=6378137;
const groundScale=Math.cos(origin.latitude*radians);
function mercatorY(lat:number){return radius*Math.log(Math.tan(Math.PI/4+lat*radians/2));}
export function geoToGround(latitude:number,longitude:number):GroundPoint{
 return [radius*(longitude-origin.longitude)*radians*groundScale,(mercatorY(origin.latitude)-mercatorY(latitude))*groundScale];
}
export function groundToGeo([x,z]:GroundPoint){
 return {latitude:(2*Math.atan(Math.exp((mercatorY(origin.latitude)-z/groundScale)/radius))-Math.PI/2)/radians,
 longitude:origin.longitude+x/(radius*radians*groundScale)};
}
export const photoCorners:GroundPoint[]=([[55.27708,53.85742],[1758.89908,53.85742],[1758.89908,1293.87822],[55.27708,1293.87822]] as GroundPoint[]).map(([x,y])=>sheetToGround([x*.7,y*.7]));
