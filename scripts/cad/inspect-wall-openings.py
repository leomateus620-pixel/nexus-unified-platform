"""Extract rectangular voids on the exterior planes of the three CAD wall meshes."""
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
cache=ROOT/'assets/industrial/raw/cad'
manifest=json.loads((cache/'cad-manifest.json').read_text(encoding='utf8'))
archive=np.load(cache/'geometry-cache.npz')
result=[]
for oid in (481,4123,906):
    occurrence=next(x for x in manifest['instances'].values() if x['sourceObjectId']==oid)
    g=manifest['objects'][str(oid)]['geometry']
    v,f=archive[g['verticesKey']],archive[g['facesKey']]
    m=np.asarray(occurrence['worldMatrixMeters'])
    v=v@m[:3,:3].T+m[:3,3]
    entry={'sourceObjectId':oid,'sourceInstancePath':occurrence['sourceInstancePath'],'bounds':{'min':v.min(0).tolist(),'max':v.max(0).tolist()},'faces':[]}
    for fixed_axis in (0,2):
        horizontal_axis=2 if fixed_axis==0 else 0
        for side in ('min','max'):
            plane=float(v[:,fixed_axis].min() if side=='min' else v[:,fixed_axis].max())
            triangles=v[f[np.all(abs(v[f][:,:,fixed_axis]-plane)<1e-6,axis=1)]][:,:,[horizontal_axis,1]]
            if not len(triangles):continue
            us=np.unique(np.round(triangles[:,:,0].ravel(),8));ys=np.unique(np.round(triangles[:,:,1].ravel(),8))
            missing=set()
            for i in range(len(us)-1):
                for j in range(len(ys)-1):
                    p=np.array([(us[i]+us[i+1])/2,(ys[j]+ys[j+1])/2])
                    a=triangles[:,0];b=triangles[:,1];c=triangles[:,2]
                    cross=lambda x,y:x[:,0]*y[:,1]-x[:,1]*y[:,0]
                    ab=cross(b-a,p-a);bc=cross(c-b,p-b);ca=cross(a-c,p-c)
                    filled=np.any(((ab>=-1e-9)&(bc>=-1e-9)&(ca>=-1e-9))|((ab<=1e-9)&(bc<=1e-9)&(ca<=1e-9)))
                    if not filled:missing.add((i,j))
            holes=[]
            while missing:
                seed=missing.pop();connected={seed};queue=[seed]
                while queue:
                    i,j=queue.pop()
                    for nxt in ((i-1,j),(i+1,j),(i,j-1),(i,j+1)):
                        if nxt in missing:missing.remove(nxt);connected.add(nxt);queue.append(nxt)
                lo=[min(us[i] for i,j in connected),min(ys[j] for i,j in connected)]
                hi=[max(us[i+1] for i,j in connected),max(ys[j+1] for i,j in connected)]
                area=sum((us[i+1]-us[i])*(ys[j+1]-ys[j]) for i,j in connected)
                rectangular=abs(area-(hi[0]-lo[0])*(hi[1]-lo[1]))<1e-6
                if area<.000001:continue
                center=[0.,float((lo[1]+hi[1])/2),0.];center[fixed_axis]=plane;center[horizontal_axis]=float((lo[0]+hi[0])/2)
                direction=np.zeros(3);direction[fixed_axis]=1 if side=='min' else -1
                origin=np.asarray(center)-direction*.005
                tri=v[f];edge1=tri[:,1]-tri[:,0];edge2=tri[:,2]-tri[:,0]
                h=np.cross(np.broadcast_to(direction,edge2.shape),edge2);det=np.sum(edge1*h,axis=1)
                eligible=np.abs(det)>1e-10
                inv=np.zeros_like(det);inv[eligible]=1/det[eligible]
                q0=origin-tri[:,0];u=np.sum(q0*h,axis=1)*inv;q=np.cross(q0,edge1)
                vv=np.sum(direction*q,axis=1)*inv;t=np.sum(edge2*q,axis=1)*inv
                blocked=eligible&(u>=0)&(vv>=0)&(u+vv<=1)&(t>=0)&(t<=.5)
                hit_indices=np.nonzero(blocked)[0]
                nearest=[]
                if len(hit_indices):
                    closest=float(t[blocked].min())
                    inset_plane=float(origin[fixed_axis]+closest*direction[fixed_axis])
                    near=np.nonzero(np.all(abs(tri[:,:,fixed_axis]-inset_plane)<1e-7,axis=1)&
                                    np.all((tri[:,:,horizontal_axis]>=lo[0]-1e-7)&(tri[:,:,horizontal_axis]<=hi[0]+1e-7)&
                                           (tri[:,:,1]>=lo[1]-1e-7)&(tri[:,:,1]<=hi[1]+1e-7),axis=1))[0]
                    nearest=[{'triangleIndex':int(idx),'distanceFromExteriorPlaneMeters':float(t[idx]-.005),'verticesCadMeters':tri[idx].tolist()} for idx in near]
                holes.append({'horizontalRangeCadMeters':[float(lo[0]),float(hi[0])],'verticalRangeCadMeters':[float(lo[1]),float(hi[1])],'centerCadMeters':center,'widthMeters':float(hi[0]-lo[0]),'heightMeters':float(hi[1]-lo[1]),'rectangular':bool(rectangular),'touchesWallBase':bool(abs(lo[1]-v[:,1].min())<1e-6),'areaSquareMeters':float(area),'centerRayClearThroughHalfMeter':bool(not np.any(blocked)),'nearestInsetSurface':nearest})
            entry['faces'].append({'fixedAxis':'X' if fixed_axis==0 else 'Z','side':side,'planeCadMeters':plane,'triangleCount':len(triangles),'openings':sorted(holes,key=lambda h:h['horizontalRangeCadMeters'][0])})
    result.append(entry)
archive.close()
output=ROOT/'docs/industrial/evidence/cad-wall-openings.json'
output.write_text(json.dumps({'sourceHash':manifest['source']['sha256'],'method':'Empty rectangles in the union of actual CAD triangles on each exterior wall plane; an inward center ray additionally checks for no wall triangle within 0.5 m. Geometric openings only, without asserted operational function; center rays are not a full solid-topology proof.','walls':result},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for e in result:
    print(e['sourceObjectId'],json.dumps(e['faces'],ensure_ascii=False),flush=True)
