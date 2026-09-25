"""Render the registered CAD partitions inside the existing industrial sectors.

Source meshes remain in CAD metres. The single registration and Blender basis
change are baked into vertices. No CAD placement is added by React.
"""
import json
import hashlib
import math
import re
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def _arrays(mesh):
    mesh.calc_loop_triangles()
    v=np.empty(len(mesh.vertices)*3,dtype=np.float64)
    mesh.vertices.foreach_get('co',v)
    f=np.empty(len(mesh.loop_triangles)*3,dtype=np.int32)
    mesh.loop_triangles.foreach_get('vertices',f)
    return v.reshape(-1,3),f.reshape(-1,3)


def _protected_hull(vertices):
    """Build source supports once per definition, shared by every occurrence/LOD."""
    bm=bmesh.new()
    for point in vertices:bm.verts.new(point)
    bm.verts.ensure_lookup_table();bm.verts.index_update()
    result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
    hull_faces=[part for part in result['geom'] if isinstance(part,bmesh.types.BMFace)]
    ids=sorted({v.index for face in hull_faces for v in face.verts})
    remap={source:index for index,source in enumerate(ids)}
    points=np.asarray([bm.verts[index].co[:] for index in ids],dtype=np.float64)
    polygons=[[remap[v.index] for v in face.verts] for face in hull_faces]
    if not len(points) or not polygons:
        bm.free();raise ValueError('CAD source hull is empty')
    center=points.mean(0);planes=[]
    for face in hull_faces:
        a,b,c=[np.asarray(v.co,dtype=np.float64) for v in list(face.verts)[:3]]
        normal=np.cross(b-a,c-a);length=np.linalg.norm(normal)
        if length<1e-15:continue
        normal/=length
        if normal@(a-center)<0:normal=-normal
        # Support offset from ALL source points avoids near-collinear facet
        # roundoff wrongly classifying interior CAD points as outside.
        planes.append(np.r_[normal,-float((vertices@normal).max())])
    tree=BVHTree.FromPolygons([Vector(p) for p in points],polygons,all_triangles=False)
    bm.free()
    directions=[*np.eye(3),*-np.eye(3)]
    for index in range(512):
        y=1-2*(index+.5)/512;r=math.sqrt(max(0,1-y*y));angle=index*math.pi*(3-math.sqrt(5))
        directions.append(np.array([r*math.cos(angle),y,r*math.sin(angle)]))
    protected=set(ids)
    for direction in directions:protected.add(int(np.argmax(vertices@direction)))
    protected=sorted(protected)
    sparse_directions=[np.asarray((x,y,z),dtype=float) for x in (-1,0,1) for y in (-1,0,1) for z in (-1,0,1) if x or y or z]
    sparse_directions.extend(directions[6::16])
    sparse=sorted({int(np.argmax(vertices@d)) for d in sparse_directions})
    support_ids=[int(np.argmax(vertices@d)) for d in directions]
    hull_triangles=np.asarray([[face[0],face[i],face[i+1]] for face in polygons for i in range(1,len(face)-1)],dtype=np.int32)
    return {'hullVertices':points,'hullTriangles':hull_triangles,'sparseIndices':sparse,'supportIndices':support_ids,'indices':protected,'coordinates':{tuple(vertices[i]) for i in protected},
            'planes':np.asarray(planes),'tree':tree,'directions':directions,
            'sourceSupport':np.array([float((vertices@d).max()) for d in directions])}


# Individually identified thin perforated panels. These are leaf components,
# never complete platforms, stairs, pipes or the silo body. Their original convex
# outer contour and thickness are retained; small perforations are omitted only
# in low/blockout. High keeps the source perforated topology.
_LOW_PERFORATED_PANELS={
    640:'PLTF4X2-ST-M000 Superior Elevador: 2x1m floor panel',
    752:'PLTF4X2-ST-M000 Superior Elevador: second 2x1m floor panel',
    1041:'PLTF2X1-ST-M000 Lat Dir Aberta Elevador: 1.025x1m floor panel',
    1381:'PLTF2X1-ST-M000 Lat Dir Aberta: 2x1m floor panel',
    3747:'PLTF2X1-ST-M000 Esquerda: 2x1m floor panel',
    1496:'Grade de Protecao: 1x2.23m thin perforated panel',
    1498:'Grade de Protecao: 0.89x2.23m thin perforated panel',
}


def _reduce(vertices,faces,object_id,lod,cache):
    key=(object_id,lod)
    if key in cache:return cache[key]
    target=100 if lod=='low' else 300
    if float(np.ptp(vertices,axis=0).max())<=0.15:target=40 if lod=='low' else 100
    if object_id==3730:target=8000 if lod=='low' else 22000
    if object_id==3728:target=1600 if lod=='low' else 4000
    critical={3730,3728,481,485,487,906,910,1508,4121,4123}
    if object_id in critical-{3730,3728}:target=5000
    stats=cache.setdefault('_definition_stats',{})
    if len(faces)<=target:
        result=(vertices,faces);cache[key]=result
        stats[key]={'sourceObjectId':object_id,'lod':lod,'sourceTriangles':len(faces),'triangles':len(faces),'method':'source below target','localEnvelopeErrorMeters':0.0}
        return result
    # Blender stores mesh coordinates as float32; use that representation for
    # exact protected-vertex identity and compare envelopes with source float64.
    base_v=vertices.astype(np.float32).astype(np.float64)
    hull_key=('_hull',object_id)
    if hull_key not in cache:cache[hull_key]=_protected_hull(base_v)
    hull=cache[hull_key]
    if lod=='low' and object_id in _LOW_PERFORATED_PANELS:
        reduced_v=hull['hullVertices'];reduced_f=hull['hullTriangles']
        error=float(max(np.abs(reduced_v.min(0)-vertices.min(0)).max(),np.abs(reduced_v.max(0)-vertices.max(0)).max()))
        support_error=float(max(abs(float((reduced_v@d).max())-expected) for d,expected in zip(hull['directions'],hull['sourceSupport'])))
        if max(error,support_error)>0.002:raise ValueError('CAD low panel envelope changed: '+str(object_id))
        stats[key]={'sourceObjectId':object_id,'lod':lod,'sourceTriangles':len(faces),'triangles':len(reduced_f),
                    'method':'allowlisted low perforated leaf panel, original convex outer contour and thickness',
                    'panelIdentification':_LOW_PERFORATED_PANELS[object_id],'perforationsOmitted':True,
                    'localEnvelopeErrorMeters':error,'sampledSupportErrorMeters':support_error,'surfaceErrorCertified':False}
        result=(reduced_v,reduced_f);cache[key]=result;return result
    protected=set(hull['indices'] if object_id in critical else hull['sparseIndices'])
    attempts=[]
    for attempt in range(4):
        mesh=bpy.data.meshes.new('CAD-simplify-'+str(object_id))
        mesh.from_pydata(vertices.tolist(),[],faces.tolist());mesh.update()
        obj=bpy.data.objects.new('CAD-decimate',mesh);bpy.context.scene.collection.objects.link(obj)
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        group=obj.vertex_groups.new(name='CAD-source-envelope');group.add(sorted(protected),1.,'REPLACE')
        mod=obj.modifiers.new('Protected source tessellation reduction','DECIMATE')
        mod.ratio=target/len(faces);mod.vertex_group=group.name
        # Measured: invert=True protects weight-one points. No welding or
        # coplanar dissolve: those changed topology/extrema in source samples.
        mod.vertex_group_factor=1000.;mod.invert_vertex_group=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        reduced_v,reduced_f=_arrays(obj.data)
        protected_coordinates={tuple(base_v[i]) for i in protected}
        projected=0;max_projection=0.;planes=hull['planes']
        for index,point in enumerate(reduced_v):
            if tuple(point) in protected_coordinates:continue
            if (planes[:,:3]@point+planes[:,3]).max()<=2e-6:continue
            hit=hull['tree'].find_nearest(Vector(point))
            if hit[0] is not None:
                reduced_v[index]=hit[0];projected+=1;max_projection=max(max_projection,hit[3])
        error=float(max(np.abs(reduced_v.min(0)-vertices.min(0)).max(),np.abs(reduced_v.max(0)-vertices.max(0)).max()))
        support_errors=np.array([abs(float((reduced_v@d).max())-expected) for d,expected in zip(hull['directions'],hull['sourceSupport'])])
        support_error=float(support_errors.max())
        kd=KDTree(len(reduced_v))
        for index,point in enumerate(reduced_v):kd.insert(Vector(point),index)
        kd.balance();protected_error=max(kd.find(Vector(point))[2] for point in protected_coordinates)
        reduced_mesh=obj.data;same_mesh=reduced_mesh==mesh
        bpy.data.objects.remove(obj,do_unlink=True)
        if reduced_mesh.users==0:bpy.data.meshes.remove(reduced_mesh)
        if not same_mesh and mesh.users==0:bpy.data.meshes.remove(mesh)
        attempts.append({'targetTriangles':target,'triangles':len(reduced_f),'protectedVertices':len(protected),'sampledSupportErrorMeters':support_error})
        if max(error,support_error,protected_error)<=0.002:break
        # Add exact source supports only in failing directions, then retry the
        # original mesh. Last retry protects the full hull; no silent source
        # fallback can make an unbounded output look like a reduced asset.
        protected.update(hull['supportIndices'][i] for i in np.flatnonzero(support_errors>0.0015))
        if attempt>=2:protected.update(hull['indices'])
    else:
        raise ValueError('CAD protected reduction exceeded 2mm: '+str(object_id)+' '+lod+' '+str(max(error,support_error,protected_error)))
    areas=np.linalg.norm(np.cross(reduced_v[reduced_f[:,1]]-reduced_v[reduced_f[:,0]],reduced_v[reduced_f[:,2]]-reduced_v[reduced_f[:,0]]),axis=1)
    stats[key]={'sourceObjectId':object_id,'lod':lod,'sourceTriangles':len(faces),'triangles':len(reduced_f),
                'method':'original topology, adaptive protected supports, exterior-point projection',
                'protectedVertices':len(protected),'protectedVertexMaxErrorMeters':protected_error,
                'projectedVertices':projected,'maxProjectionMeters':max_projection,
                'localEnvelopeErrorMeters':error,'sampledSupportErrorMeters':support_error,
                'degenerateTriangles':int((areas<1e-12).sum()),'surfaceErrorCertified':False,'attempts':attempts}
    result=(reduced_v,reduced_f);cache[key]=result
    return result


def _paths(binding,instances):
    excluded=binding.get('excludedPaths',[])
    selected=[]
    for root in binding.get('sourcePaths') or [binding['sourceInstancePath']]:
        for path,item in instances.items():
            if path!=root and not path.startswith(root+'/'):continue
            if any(path==ex or path.startswith(ex+'/') for ex in excluded):continue
            selected.append((path,item))
    return list({p:(p,i) for p,i in selected}.values())


def _material(path,instances,object_id,owner):
    names=[];cursor=path
    while cursor in instances:
        item=instances[cursor];names.append(item.get('sourceName',''))
        cursor=item.get('parentSourceInstancePath')
        if cursor is None:break
    name=' '.join(names).lower()
    if object_id==3730:return 'zinc'
    if object_id==3728:return 'roof'
    if owner['id'] in {'ED-04','ED-05'}:
        if any(f':{n}/' in path+'/' for n in (4121,910)):return 'roof' if owner['id']=='ED-05' else 'concrete'
        return 'white'
    if any(f':{n}/' in path+'/' for n in (487,1508)):return 'concrete'
    if any(f':{n}/' in path+'/' for n in (485,)):return 'roof'
    if any(f':{n}/' in path+'/' for n in (481,)):return 'paint'
    if any(word in name for word in ['guarda','srg','sra','pso','plataforma']):return 'yellow'
    if 'escada' in name:return 'zinc-edge'
    if 'tubula' in name or 'elevador' in name:return 'paint'
    if 'caixa d' in name:return 'white'
    return 'zinc-edge'


def _source_face_materials(path,faces,default_material,owner):
    """Reuse appearance on existing CAD closure faces; never add duplicate panes.

    Source 4123 retains its original face order (below the reduction target).
    These twelve triangles are independently identified in cad-wall-openings.
    """
    if owner['id']=='ED-04' and path.endswith(':4123'):
        glazed=np.zeros(len(faces),dtype=bool)
        glazed[[144,145,146,147,148,149,150,151,154,155,156,157]]=True
        return [(faces[~glazed],default_material),(faces[glazed],'window')]
    return [(faces,default_material)]


def _cached_reduce(v,f,oid,lod,memory,directory):
    key=(oid,lod)
    if key in memory:return memory[key]
    filename=directory/(str(oid)+'-'+lod+'.npz')
    if filename.exists():
        with np.load(filename,allow_pickle=False) as cached:
            result=(cached['vertices'],cached['faces'])
            memory.setdefault('_definition_stats',{})[key]=json.loads(str(cached['statistics']))
        memory[key]=result
        return result
    result=_reduce(v,f,oid,lod,memory)
    np.savez_compressed(filename,vertices=result[0],faces=result[1],statistics=json.dumps(memory['_definition_stats'][key]))
    return result


def render_cad(data,cache_path,selected,collections,materials,make_collection,root):
    manifest=json.loads((cache_path/'cad-manifest.json').read_text(encoding='utf8'))
    archive=np.load(cache_path/'geometry-cache.npz')
    instances=manifest['instances'];objects=manifest['objects']
    registration=data['cadRegistration']
    raw_matrix=registration.get('matrixColumnMajorMeters') or registration.get('matrixColumnMajor')
    if raw_matrix is None:raise ValueError('Registration matrix missing')
    transform=np.asarray(raw_matrix,dtype=np.float64).reshape(4,4,order='F')
    expected_hash=next(e['cad']['sourceSha256'] for e in data['elements'] if e.get('cad'))
    source_hash=manifest.get('source',{}).get('sha256',manifest.get('sha256'))
    if source_hash!=expected_hash:raise ValueError('CAD cache/catalog hash mismatch')
    wall_openings=json.loads((root/'docs/industrial/evidence/cad-wall-openings.json').read_text(encoding='utf8'))
    if wall_openings['sourceHash']!=source_hash:raise ValueError('Wall-opening source mismatch')
    reduction_source=Path(__file__).read_text(encoding='utf8').split('def _paths(')[0].encode()
    cache_key=hashlib.sha256(source_hash.encode()+reduction_source).hexdigest()[:24]
    reduction_directory=cache_path/'reduced'/cache_key
    reduction_directory.mkdir(parents=True,exist_ok=True)
    simplified={};source_cache={};reports=[];assignments={}
    # Every source occurrence has one owner; LOD replication is a separate pass.
    owners=[]
    for owner in data['elements']:
        if not owner.get('cad'):continue
        leaves=[]
        for path,item in _paths(owner['cad'],instances):
            oid=item['sourceObjectId'];obj=objects[str(oid)]
            if not obj.get('geometry'):continue
            if path in assignments:raise ValueError('Duplicated CAD occurrence: '+path)
            assignments[path]=owner['id'];leaves.append((path,item,obj))
        if not leaves:raise ValueError('Empty CAD partition: '+owner['id'])
        owners.append((owner,leaves))
    for owner,leaves in owners:
        sector='buildings' if owner['category']=='buildings' else 'grain-handling'
        variants=[(sector,'high')]
        if owner['category']=='silos':variants=[('silos-high','high'),('silos-low','low')]
        variants.append(('blockout','low'))
        for sector,lod in variants:
            if sector not in selected:continue
            if sector not in collections:collections[sector]=make_collection(sector)
            co=collections[sector];parts={};original_bounds=[];source_triangles=0;skipped=[]
            for path,item,obj in leaves:
                oid=item['sourceObjectId'];geom=obj['geometry']
                if oid not in source_cache:
                    source_cache[oid]=(archive[geom['verticesKey']],archive[geom['facesKey']])
                v,f=source_cache[oid];source_triangles+=len(f)
                world=transform@np.asarray(item['worldMatrixMeters'],dtype=np.float64)
                original=v@world[:3,:3].T+world[:3,3]
                original_bounds.append((path,original.min(0),original.max(0)))
                size=np.ptp(v,axis=0)
                # Hardware below 6 cm is represented by its parent assembly.
                # Record every omitted occurrence; restore any critical extremum.
                small=float(size.max()) < (0.06 if lod=='high' else 0.09)
                if small:
                    skipped.append(path);continue
                sv,sf=_cached_reduce(v,f,oid,lod,simplified,reduction_directory)
                final=sv@world[:3,:3].T+world[:3,3]
                parts[path]=(final,sf,_material(path,instances,oid,owner))
            target_min=np.min([x[1] for x in original_bounds],axis=0)
            target_max=np.max([x[2] for x in original_bounds],axis=0)
            # Preserve the true assembly silhouette even when its extremum is
            # on a small fitting or a rotated, simplified subcomponent.
            for iteration in range(2):
                actual_min=np.min([p[0].min(0) for p in parts.values()],axis=0) if parts else np.full(3,np.inf)
                actual_max=np.max([p[0].max(0) for p in parts.values()],axis=0) if parts else np.full(3,-np.inf)
                restore=set()
                for axis in range(3):
                    if abs(actual_min[axis]-target_min[axis])>0.002:
                        restore.update(p for p,lo,hi in original_bounds if abs(lo[axis]-target_min[axis])<1e-7)
                    if abs(actual_max[axis]-target_max[axis])>0.002:
                        restore.update(p for p,lo,hi in original_bounds if abs(hi[axis]-target_max[axis])<1e-7)
                if not restore:break
                for path,item,obj in leaves:
                    if path not in restore:continue
                    oid=item['sourceObjectId'];v,f=source_cache[oid];world=transform@np.asarray(item['worldMatrixMeters'])
                    parts[path]=(v@world[:3,:3].T+world[:3,3],f,_material(path,instances,oid,owner))
                    if path in skipped:skipped.remove(path)
            buckets={}
            for path,(v,f,material) in parts.items():
                for material_faces,face_material in _source_face_materials(path,f,material,owner):
                    bucket=buckets.setdefault(face_material,{'vertices':[],'faces':[],'count':0,'paths':[]})
                    bucket['vertices'].append(v);bucket['faces'].append(material_faces+bucket['count']);bucket['count']+=len(v);bucket['paths'].append(path)
            visual_details=[]
            parent=bpy.data.objects.new(owner['id'],None);co.objects.link(parent)
            parent['elementId']=owner['id'];parent['name']=owner['name'];parent['cadSourceHash']=source_hash
            parent['sourceInstancePath']=owner['cad']['sourceInstancePath'];parent['placement']='baked-nexus-meters'
            parent['anchors']=json.dumps(owner.get('anchors',{}));parent['cadOccurrenceCount']=len(leaves)
            if owner['id']=='ED-04':parent['appearanceDetails']='Retained window material on six existing CAD recessed closure panels; glazing appearance INFERRED, no added geometry'
            triangle_count=0;all_bounds=[]
            for material,bucket in buckets.items():
                v=np.concatenate(bucket['vertices']);f=np.concatenate(bucket['faces']);triangle_count+=len(f)
                all_bounds.append((v.min(0),v.max(0)))
                blender_v=v[:,[0,2,1]].copy();blender_v[:,1]*=-1
                mesh=bpy.data.meshes.new(owner['id']+'-'+material+'-cad');mesh.from_pydata(blender_v.tolist(),[],f.tolist());mesh.update()
                mesh.materials.append(materials['concrete' if sector=='blockout' else material])
                uv=mesh.uv_layers.new(name='UVMap')
                ids=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',ids)
                positions=v[ids]
                normals=np.empty(len(mesh.polygons)*3,dtype=np.float64)
                mesh.polygons.foreach_get('normal',normals)
                normals=normals.reshape(-1,3)[:,[0,2,1]];normals[:,2]*=-1
                loop_counts=np.empty(len(mesh.polygons),dtype=np.int32)
                mesh.polygons.foreach_get('loop_total',loop_counts)
                loop_normals=np.repeat(normals,loop_counts,axis=0)
                dominant=np.argmax(np.abs(loop_normals),axis=1)
                # Box projection per face keeps UVs non-degenerate on vertical
                # supports, end caps and underground walls at the same density.
                uvs=positions[:,[0,2]]/2
                uvs[dominant==0]=positions[dominant==0][:,[2,1]]/2
                uvs[dominant==2]=positions[dominant==2][:,[0,1]]/2
                box_uvs=uvs.copy()
                if material=='zinc' and owner['category']=='silos':
                    center=owner['position'];side=np.abs(loop_normals[:,1])<.6
                    cylindrical=np.column_stack((np.arctan2(positions[:,2]-center[2],positions[:,0]-center[0])*8/(2*math.pi),positions[:,1]/2))
                    uvs[side]=cylindrical[side]
                    triangles_uv=uvs.reshape(-1,3,2)
                    wrap=side.reshape(-1,3).all(axis=1)&(np.ptp(triangles_uv[:,:,0],axis=1)>4)
                    triangles_uv[:,:,0][wrap[:,None]&(triangles_uv[:,:,0]<0)]+=8
                    delta=triangles_uv[:,1:]-triangles_uv[:,0:1]
                    degenerate=np.abs(delta[:,0,0]*delta[:,1,1]-delta[:,0,1]*delta[:,1,0])<1e-10
                    triangles_uv[degenerate]=box_uvs.reshape(-1,3,2)[degenerate]
                # Integer tile shifts retain appearance and avoid losing tiny
                # CAD bevel UV differences far from the map's origin.
                triangles_uv=uvs.reshape(-1,3,2)
                triangles_uv-=np.floor(triangles_uv.mean(axis=1,keepdims=True))
                uv.data.foreach_set('uv',np.asarray(uvs,dtype=np.float32).ravel())
                # Smooth curved sheet metal while retaining real folds/edges.
                mesh.polygons.foreach_set('use_smooth',np.ones(len(mesh.polygons),dtype=bool))
                mesh.set_sharp_from_angle(angle=math.radians(30))
                obj=bpy.data.objects.new(mesh.name,mesh);co.objects.link(obj);obj.parent=parent;obj['elementId']=owner['id']
            lo=np.min([b[0] for b in all_bounds],axis=0);hi=np.max([b[1] for b in all_bounds],axis=0)
            error=float(max(np.abs(lo-target_min).max(),np.abs(hi-target_max).max()))
            if error>0.002001:raise ValueError('CAD envelope changed: '+owner['id']+' '+str(error))
            reports.append({'id':owner['id'],'sector':sector,'lod':lod,'sourceTriangles':source_triangles,'triangles':triangle_count,'retainedVisualDetailTriangles':sum(len(f) for v,f,m in visual_details),'sourceOccurrences':len(leaves),'retainedOccurrences':len(parts),'omittedMicroDetailPaths':skipped,'sourcePaths':list(parts),'targetBounds':{'min':target_min.tolist(),'max':target_max.tolist()},'bounds':{'min':lo.tolist(),'max':hi.tolist()},'maxEnvelopeErrorMeters':error})
            print('CAD_PARTITION',owner['id'],sector,triangle_count,'triangles',len(skipped),'micro-details omitted',flush=True)
    report={'sourceHash':source_hash,'registration':registration,'method':'Source meshes, coplanar dissolve, bounded secondary decimation, baked single global transform. Tiny hardware omitted with source paths recorded; critical extrema restored from source. Existing PBR material families retained.','surfaceErrorCertified':False,'exportEnvelopeToleranceMeters':0.005,'partitions':reports,'occurrenceOwners':assignments}
    report['definitionReductions']=list(simplified.get('_definition_stats',{}).values())
    report['method']='Source meshes, protected original convex supports, inverted vertex-group decimation and bounded exterior-point projection, baked single global transform. Tiny hardware omissions and critical extrema are recorded. Existing PBR material families retained.'
    destination=root/'docs/industrial/evidence/cad-generation.json'
    if destination.exists():
        previous=json.loads(destination.read_text(encoding='utf8'))
        if previous.get('sourceHash')==source_hash and previous.get('registration',{}).get('matrixColumnMajorMeters')==raw_matrix:
            report['partitions']=[p for p in previous.get('partitions',[]) if p['sector'] not in selected]+reports
            definitions={(d['sourceObjectId'],d['lod']):d for d in previous.get('definitionReductions',[])}
            definitions.update({(d['sourceObjectId'],d['lod']):d for d in report['definitionReductions']})
            report['definitionReductions']=list(definitions.values())
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    archive.close()
