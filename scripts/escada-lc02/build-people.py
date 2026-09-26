"""Generate two CC0-based clothed workers, two LODs each, using Blender 4.5 + MPFB 2.0.17.

Run from the repository root with Blender --background --factory-startup --python-exit-code 1.
The pinned upstream archives live in .cache/lc02; see prepare-people-assets.py.
No addon preferences are saved. The application consumes only the generated GLBs.
"""
import bpy, addon_utils, importlib, json, math, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/lc02'
ASSETS = CACHE / 'system-assets'
OUT = ROOT / 'public/models/escada-lc02/people'
OUT.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.extensions.repos.new(name='LC02 build', module='lc02_build', custom_directory=str(CACHE / 'mpfb2-2.0.17/src'))
addon_utils.enable('bl_ext.lc02_build.mpfb', default_set=True, persistent=False)
HumanService = importlib.import_module('bl_ext.lc02_build.mpfb.services.humanservice').HumanService
TargetService = importlib.import_module('bl_ext.lc02_build.mpfb.services.targetservice').TargetService

def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def image(path, limit=2048, normal=False):
    name = path.stem + ('-normal' if normal else '') + '.jpg'
    dst = CACHE / name
    if dst.exists():
        img = bpy.data.images.load(str(dst), check_existing=True)
    else:
        img = bpy.data.images.load(str(path), check_existing=True)
        w,h=img.size
        if max(w,h)>limit: img.scale(round(w*limit/max(w,h)), round(h*limit/max(w,h)))
        img.filepath_raw=str(dst); img.file_format='JPEG'; img.save()
    if normal: img.colorspace_settings.name='Non-Color'
    return img

def material(name, color=(1,1,1,1), texture=None, normal=None, roughness=.65):
    mat=bpy.data.materials.new(name); mat.use_nodes=True; mat.diffuse_color=color
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=color
    bsdf.inputs['Roughness'].default_value=roughness
    if texture:
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image(texture)
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image(normal, normal=True)
        norm=mat.node_tree.nodes.new('ShaderNodeNormalMap'); norm.inputs['Strength'].default_value=.45
        mat.node_tree.links.new(tex.outputs['Color'], norm.inputs['Color'])
        mat.node_tree.links.new(norm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat

def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)
    for face in obj.data.polygons: face.use_smooth=True

def helmet(rig, mat):
    # Rounded shell + projecting rim; own geometry, no normative PPE specification.
    center=rig.data.bones['head'].tail_local.copy()
    center.z -= .013
    verts=[]; faces=[]; n=28
    rings=[(1.08,-.013),(1.20,-.01),(1.20,-.004),(1.0,.002),(.97,.034),(.8,.07),(.48,.094),(.01,.106)]
    for radius,z in rings:
        for k in range(n):
            a=k*math.tau/n
            front=max(0,-math.sin(a))*.011 if radius>1.05 else 0
            verts.append((center.x+.096*radius*math.cos(a),center.y+.108*radius*math.sin(a)-front,center.z+z))
    for row in range(len(rings)-1):
        for k in range(n): faces.append((row*n+k,row*n+(k+1)%n,(row+1)*n+(k+1)%n,(row+1)*n+k))
    mesh=bpy.data.meshes.new('helmet'); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new('helmet',mesh); bpy.context.collection.objects.link(obj)
    assign(obj,mat); obj.parent=rig
    obj.vertex_groups.new(name='head').add(list(range(len(verts))),1,'REPLACE')
    mod=obj.modifiers.new('Rig','ARMATURE'); mod.object=rig
    return obj

def boot_cuffs(rig, boots):
    # Convert the fitted leather footwear into ankle boots with padded uppers.
    # These use the same foot weights as the laced lower shoe, so they remain flat in IK.
    pieces=[boots]
    leather=material('boot_cuffs',(.055,.044,.032,1),roughness=.83)
    for side in ['l','r']:
        ankle=rig.data.bones['foot_'+side].head_local
        verts=[];faces=[];n=20
        for z,radius in [(ankle.z-.015,1.05),(ankle.z+.035,1),(ankle.z+.105,1.1),(ankle.z+.112,1.03)]:
            for k in range(n):
                a=k*math.tau/n
                verts.append((ankle.x+.05*radius*math.cos(a),ankle.y+.053*radius*math.sin(a),z))
        for row in range(3):
            for k in range(n):faces.append((row*n+k,row*n+(k+1)%n,(row+1)*n+(k+1)%n,(row+1)*n+k))
        mesh=bpy.data.meshes.new('padded-upper');mesh.from_pydata(verts,[],faces);mesh.update()
        cuff=bpy.data.objects.new('padded-upper',mesh);bpy.context.collection.objects.link(cuff)
        assign(cuff,leather);cuff.parent=rig
        cuff.vertex_groups.new(name='foot_'+side).add(list(range(len(verts))),1,'REPLACE')
        pieces.append(cuff)
    active(boots)
    for piece in pieces:piece.select_set(True)
    bpy.ops.object.join()

def bake_geometry(obj):
    active(obj)
    if obj.data.shape_keys: TargetService.bake_targets(obj)
    for mod in list(obj.modifiers):
        if mod.type != 'ARMATURE': bpy.ops.object.modifier_apply(modifier=mod.name)
    # Strip metadata vertex groups; the complete fitted skeleton is already available.
    bone_names=set(obj.parent.data.bones.keys())
    for group in list(obj.vertex_groups):
        if group.name not in bone_names: obj.vertex_groups.remove(group)

def tris(objects):
    total=0
    for obj in objects:
        obj.data.calc_loop_triangles(); total+=len(obj.data.loop_triangles)
    return total

report=[]
for variant in ['a','b']:
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    macro=TargetService.get_default_macro_info_dict()
    macro.update(gender=1 if variant=='a' else 0, age=.4, muscle=.55 if variant=='a' else .4, weight=.48, height=.54)
    macro['race']={'caucasian':.65,'african':.25,'asian':.1} if variant=='a' else {'caucasian':.15,'african':.7,'asian':.15}
    body=HumanService.create_human(macro_detail_dict=macro)
    rig=HumanService.add_builtin_rig(body,'game_engine'); rig.name='Worker_'+variant
    suit=HumanService.add_mhclo_asset(str(ASSETS/'clothes/male_worksuit01/male_worksuit01.mhclo'),body,subdiv_levels=0,material_type='GAMEENGINE')
    boots=HumanService.add_mhclo_asset(str(ASSETS/'clothes/shoes02/shoes02.mhclo'),body,subdiv_levels=0,material_type='GAMEENGINE')
    eyes=HumanService.add_mhclo_asset(str(ASSETS/'eyes/low-poly/low-poly.mhclo'),body,asset_type='Eyes',subdiv_levels=0,material_type='GAMEENGINE')
    skinpath='skins/young_caucasian_male/young_lightskinned_male_diffuse.png' if variant=='a' else 'skins/young_african_female/young_darkskinned_female_diffuse.png'
    assign(body,material('skin_'+variant,texture=ASSETS/skinpath,roughness=.62))
    assign(suit,material('uniform',texture=ASSETS/'clothes/male_worksuit01/male_worksuit01_diffuse.png',normal=ASSETS/'clothes/male_worksuit01/male_worksuit01_normal.png'))
    assign(boots,material('boots',texture=ASSETS/'clothes/shoes02/shoes02_diffuse.png',roughness=.8))
    assign(eyes,material('eyes',texture=ASSETS/'eyes/materials/brown_eye.png',roughness=.28))
    boot_cuffs(rig,boots)
    cap=helmet(rig,material('helmet',(1,.64,.025,1),roughness=.34))
    near=[body,suit,boots,eyes,cap]
    for name,obj in zip(['body','uniform','boots','eyes','helmet'],near):
        obj.name='near_'+name; bake_geometry(obj)
    # Delete all hidden anatomy before decimation/export. Preserve face, hands and clothing contours.
    before=tris(near)
    ratio=min(1,18500/before)
    for obj in near:
        if obj in [eyes,cap]: continue
        active(obj); mod=obj.modifiers.new('Presentation budget','DECIMATE'); mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    far=[]
    ratio=min(1,7300/tris(near))
    for obj in near:
        duplicate=obj.copy(); duplicate.data=obj.data.copy(); duplicate.name=obj.name.replace('near_','far_')
        bpy.context.collection.objects.link(duplicate); far.append(duplicate)
        if obj not in [eyes,cap]:
            active(duplicate); mod=duplicate.modifiers.new('Distance budget','DECIMATE'); mod.ratio=ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    # Fit both variants to real-world metres including footwear and helmet.
    top=max((obj.matrix_world @ Vector(corner)).z for obj in near for corner in obj.bound_box)
    bottom=min((obj.matrix_world @ Vector(corner)).z for obj in near for corner in obj.bound_box)
    factor=(1.78 if variant=='a' else 1.72)/(top-bottom)
    rig.scale=(factor,)*3; rig.location.z=-bottom*factor
    rig['source']='MakeHuman system assets CC0 + MPFB 2.0.17; original helmet; illustrative worker'
    rig['metres']=True
    bpy.context.view_layer.update()
    # Two LODs use one skeleton and identical material resources.
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
    for obj in near+far: obj.select_set(True)
    dst=OUT/('worker-'+variant+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dst),export_format='GLB',use_selection=True,export_animations=False,export_morph=False,export_extras=True,export_yup=True,export_tangents=True,export_cameras=False,export_lights=False)
    entry={'variant':variant,'nearTriangles':tris(near),'farTriangles':tris(far),'bones':len(rig.data.bones),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()}
    report.append(entry); print('LC02_WORKER',json.dumps(entry),flush=True)
    # Save a compact editable source for the two LODs of each base.
    bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/('worker-'+variant+'.blend')))
(OUT/'manifest.json').write_text(json.dumps({'generator':'scripts/escada-lc02/build-people.py','mpfbVersion':'2.0.17','mpfbCommit':'80919fa4682335c41847f761a4d79dcad4124732','license':'CC0-1.0','models':report},indent=2))
