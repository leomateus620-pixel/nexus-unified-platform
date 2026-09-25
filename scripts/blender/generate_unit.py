"""Authorial reconstruction from site.json. Blender 4.5 LTS, no add-ons.
Run: blender --background --python scripts/blender/generate_unit.py
All input/output paths resolve from this script. Source coordinates: X, Y up, Z.
Blender conversion (x,-z,y) exports back to glTF Y up without mirrored geometry.
"""
import bpy, json, math, random, sys, argparse, hashlib
from pathlib import Path
from mathutils import Vector, Euler
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT/'src/industrial/data/site.json').read_text(encoding='utf8'))
RAW = ROOT/'assets/industrial/raw'
TEX = ROOT/'public/textures/3tentos'
SOURCE = ROOT/'assets/industrial/source'
parser=argparse.ArgumentParser()
parser.add_argument('--sectors', default='terrain,buildings,grain-handling,silos-high,silos-low,fences,grass,vegetation-prototypes,vegetation-low,blockout')
parser.add_argument('--cad-cache', default=str(RAW/'cad'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
SELECTED=set(args.sectors.split(','))
if SELECTED & {'silos-high','silos-low'}: SELECTED.update({'silos-high','silos-low','blockout'})
if SELECTED & {'buildings','grain-handling'}: SELECTED.add('blockout')
if 'terrain' in SELECTED: SELECTED.add('grass')
if SELECTED & {'vegetation-prototypes','vegetation-low'}: SELECTED.update({'vegetation-prototypes','vegetation-low'})
VALID={'terrain','buildings','grain-handling','silos-high','silos-low','fences','grass','vegetation-prototypes','vegetation-low','blockout'}
if not SELECTED <= VALID: raise ValueError('Unknown sectors: '+str(SELECTED-VALID))
preserved_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'public/models/3tentos').glob('*.glb') if p.stem not in SELECTED}
for p in [RAW,TEX,SOURCE]: p.mkdir(parents=True, exist_ok=True)
source_file=SOURCE/'3tentos-reconstruction.blend'
if source_file.exists():
    bpy.ops.wm.open_mainfile(filepath=str(source_file))
    replacing=SELECTED|{'vegetation-layout'} if SELECTED & {'vegetation-prototypes','vegetation-low'} else SELECTED
    for name in replacing:
        co=bpy.data.collections.get(name)
        if co:
            for obj in list(co.all_objects):
                mesh=obj.data if obj.type=='MESH' else None
                bpy.data.objects.remove(obj,do_unlink=True)
                if mesh and mesh.users==0:bpy.data.meshes.remove(mesh)
            bpy.data.collections.remove(co)
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
random.seed(31028)
MATS={}

def image(name, pixels, data=False):
    existing=bpy.data.images.get(name)
    if existing:return existing
    h,w,_=pixels.shape
    im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if data: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(pixels.astype(np.float32).ravel())
    im.filepath_raw=str(TEX/(name+'.png')); im.file_format='PNG'; im.save()
    return im

def material(name,color,rough=.8,metal=0,texture=None,normal=None,double=False):
    existing=bpy.data.materials.get(name)
    if existing:
        MATS[name]=existing
        return name
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in color]
    bs.inputs['Base Color'].default_value=(*linear,1)
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    m.use_backface_culling=not double
    if texture:
        tx=m.node_tree.nodes.new('ShaderNodeTexImage'); tx.image=texture
        m.node_tree.links.new(tx.outputs['Color'],bs.inputs['Base Color'])
    if normal:
        tx=m.node_tree.nodes.new('ShaderNodeTexImage'); tx.image=normal
        nm=m.node_tree.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.52
        m.node_tree.links.new(tx.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    MATS[name]=m; return name

rng=np.random.default_rng(31028)
for name,base in [('grass',(.29,.37,.12)),('gravel',(.37,.35,.30)),('soil',(.39,.21,.105)),('asphalt',(.21,.22,.215)),('crop',(.54,.45,.25))]:
    n=512
    yy,xx=np.mgrid[0:n,0:n]
    # Periodic, irregular low-frequency variation. A product of sine waves
    # produced a conspicuous checker pattern at aerial inspection distances.
    spectrum=np.fft.rfft2(rng.normal(0,1,(n,n)))
    fy=np.fft.fftfreq(n)[:,None];fx=np.fft.rfftfreq(n)[None,:]
    spectrum*=np.exp(-(fx*fx+fy*fy)/(.009**2))
    cloud=np.fft.irfft2(spectrum,s=(n,n));cloud/=max(cloud.std(),1e-8)
    noise=rng.normal(0,.026,(n,n))+.016*cloud
    if name=='crop': noise+=.05*np.sin(xx*.39)
    pix=np.ones((n,n,4));pix[:,:,:3]=np.clip(np.array(base)[None,None,:]+noise[:,:,None],0,1)
    im=image(name+'-base',pix)
    normal=np.ones((n,n,4));normal[:,:,0]=.5+np.roll(noise,1,0)-noise;normal[:,:,1]=.5+np.roll(noise,1,1)-noise;normal[:,:,2]=1
    ni=image(name+'-normal',normal,True)
    material(name,base,.96,0,im,ni)
yy,xx=np.mgrid[0:256,0:256]
corr=np.ones((256,256,4));corr[:,:,0]=.5;corr[:,:,1]=.5+.32*np.cos(yy*math.pi*2/16);corr[:,:,2]=np.sqrt(1-(corr[:,:,1]-.5)**2)
cn=image('galvanized-normal',corr,True)
material('zinc',(.53,.58,.59),.47,.78,normal=cn)
material('zinc-edge',(.34,.39,.40),.55,.7)
material('roof',(.66,.69,.67),.49,.7)
material('paint',(.71,.72,.68),.71,.3)
material('concrete',(.58,.55,.46),.96)
material('yellow',(.93,.58,.045),.52,.32)
material('dark',(.12,.16,.15),.83,.4)
material('white',(.80,.79,.70),.8)
material('window',(.15,.23,.25),.32,.12)
material('bark',(.25,.20,.125),.96)
for i,c in enumerate([(.18,.27,.055),(.26,.34,.09),(.32,.39,.10)]):material('leaf'+str(i),c,.94,double=True)
material('palm',(.28,.36,.10),.89,double=True)
material('grass-blades',(.32,.39,.14),1,double=True)

def cv(p):return (p[0],-p[2],p[1])
class Builder:
    """One mesh per material/element. No object per bolt, strut or blade."""
    def __init__(self):self.parts={}
    def face(self,mat,vs,faces,uv=None):
        rec=self.parts.setdefault(mat,[[],[],[]]); off=len(rec[0]);rec[0].extend(vs)
        rec[1].extend([tuple(off+i for i in f) for f in faces])
        rec[2].extend(uv if uv else [(v[0]/8,v[2]/8) for v in vs])
    def box(self,mat,c,d):
        x,y,z=c;w,h,l=[v/2 for v in d]
        vs=[(x-w,y-h,z-l),(x+w,y-h,z-l),(x+w,y+h,z-l),(x-w,y+h,z-l),(x-w,y-h,z+l),(x+w,y-h,z+l),(x+w,y+h,z+l),(x-w,y+h,z+l)]
        self.face(mat,vs,[(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)])
    def tube(self,mat,a,b,r,n=8,r2=None):
        a=Vector(a);b=Vector(b);axis=(b-a).normalized()
        cross=axis.cross(Vector((0,1,0)))
        if cross.length<.01:cross=axis.cross(Vector((1,0,0)))
        u=cross.normalized();v=axis.cross(u).normalized();r2=r if r2 is None else r2
        vs=[]
        for c,rad in [(a,r),(b,r2)]:
            for i in range(n):vs.append(tuple(c+rad*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)))
        faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        faces.extend([tuple(reversed(range(n))),tuple(range(n,n*2))])
        self.face(mat,vs,faces)
    def cylinder(self,mat,c,r,h,n=64,r2=None):
        x,y,z=c;r2=r if r2 is None else r2
        vs=[];uv=[]
        for j,rad in enumerate([r,r2]):
            for i in range(n+1):
                a=i*math.tau/n;vs.append((x+rad*math.cos(a),y+j*h,z+rad*math.sin(a)));uv.append((i/n*8,j*h/2))
        faces=[(i,i+n+1,i+n+2,i+1) for i in range(n)]
        faces.extend([tuple(range(n)),tuple(reversed(range(n+1,2*n+1)))])
        self.face(mat,vs,faces,uv)
    def polygon(self,mat,ps,y=.02):
        # Blender tessellates concave n-gons on glTF export.
        vs=[(x,y,z) for x,z in ps]
        self.face(mat,vs,[tuple(reversed(range(len(vs))))])
    def ring(self,mat,c,r,thickness,n=96):
        x,y,z=c
        vs=[]
        for radius in [r-thickness/2,r+thickness/2]:
            for i in range(n):vs.append((x+radius*math.cos(i*math.tau/n),y,z+radius*math.sin(i*math.tau/n)))
        self.face(mat,vs,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    def build(self,name,collection,record=None):
        par=bpy.data.objects.new(name,None);collection.objects.link(par)
        if record:
            for k,v in record.items():
                if k not in ['geometry','rotation']:par[k]=v if isinstance(v,(str,int,float)) else json.dumps(v,ensure_ascii=False)
            par['geometry']=json.dumps(record.get('geometry',{}));par['elementId']=record['id']
        for mat,(vs,fs,uvs) in self.parts.items():
            if record:
                # Procedural parts are built about their XZ anchor; apply the
                # previously ignored elevation and rotation exactly once.
                p=record['position'];rotation=Euler(record['rotation'],'XYZ').to_matrix()
                anchor=Vector((p[0],0,p[2]));target=Vector(p)
                vs=[tuple(rotation@(Vector(v)-anchor)+target) for v in vs]
            mesh=bpy.data.meshes.new(name+'-'+mat);mesh.from_pydata([cv(v) for v in vs],[],fs);mesh.materials.append(MATS[mat]);mesh.update()
            uv=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
            obj=bpy.data.objects.new(mesh.name,mesh);collection.objects.link(obj);obj.parent=par
            # Tangent export needs triangles/quads; the source retains editable n-gons.
            obj.modifiers.new('Export triangulation','TRIANGULATE')
            if record:obj['elementId']=record['id']
        return par

def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def rail(b,a,c,height=1.05):
    av=Vector(a);cvv=Vector(c);n=max(1,math.ceil((cvv-av).length/1.5))
    for i in range(n+1):
        v=av.lerp(cvv,i/n);b.tube('yellow',v,v+Vector((0,height,0)),.037,6)
    for h in [height,.53]:b.tube('yellow',av+Vector((0,h,0)),cvv+Vector((0,h,0)),.035,6)
def platform(b,c,w=2.4,d=2.4):
    x,y,z=c;b.box('zinc-edge',(x,y,z),(w,.14,d))
    corners=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x+w/2,y,z+d/2),(x-w/2,y,z+d/2)]
    for i in range(4):rail(b,corners[i],corners[(i+1)%4])
def ladder(b,a,height,width=.55):
    x,y,z=a
    for dx in [-width/2,width/2]:b.tube('zinc-edge',(x+dx,y,z),(x+dx,y+height,z),.045,6)
    for i in range(int(height/.3)+1):b.tube('zinc-edge',(x-width/2,y+i*.3,z),(x+width/2,y+i*.3,z),.025,6)

COLS={}
def silos(lod):
    co=collection('silos-'+lod);COLS['silos-'+lod]=co
    for e in (e for e in DATA['elements'] if e['category']=='silos' and not e.get('cad')):
        b=Builder();x,base_y,z=e['position'];g=e['geometry'];r=g['radius'];h=g['bodyHeight'];base=g['baseHeight'];cone=g['coneHeight'];n=96 if lod=='high' else 64
        b.cylinder('concrete',(x,0,z),r+.62,base,96)
        b.cylinder('zinc',(x,base,z),r,h,n)
        b.cylinder('roof',(x,base+h,z),r+.14,cone,n,.46)
        b.cylinder('zinc-edge',(x,base+h+cone,z),.58,.36,24)
        b.cylinder('paint',(x,base+h+cone+.32,z),.23,.38,16)
        for y in [base+.08,base+h,base+h-.2]:b.ring('zinc-edge',(x,y,z),r+.07,.14,n)
        # Ring joints are shallow; corrugation itself is normal-mapped.
        for j in range(1,11):b.ring('zinc-edge',(x,base+h*j/11,z),r+.025,.055,n)
        for j in range(40 if lod=='high' else 32):
            a=j*math.tau/(40 if lod=='high' else 32);dx=math.cos(a);dz=math.sin(a)
            b.tube('zinc-edge',(x+(r+.035)*dx,base,z+(r+.035)*dz),(x+(r+.035)*dx,h+base,z+(r+.035)*dz),.045,4)
        for j in range(48 if lod=='high' else 32):
            a=j*math.tau/(48 if lod=='high' else 32);dx=math.cos(a);dz=math.sin(a)
            b.tube('zinc-edge',(x+.48*dx,h+base+cone+.02,z+.48*dz),(x+(r+.15)*dx,h+base+.025,z+(r+.15)*dz),.023,4)
        platform(b,(x,h+base+cone+.38,z),1.6,1.6)
        if lod=='high':
            # Low roof boxes seen in D; count/section remain estimates in registry.
            for j in range(8):
                a=j*math.tau/8;rad=r*.81
                b.box('paint',(x+rad*math.cos(a),h+base+cone*.2+.13,z+rad*math.sin(a)),(.57,.24,.43))
            # Roof access follows the incline, attached at both ends.
            for t in range(23):
                rr=.9+(r-.9)*t/22;yy=h+base+cone*(1-rr/r)+.10
                b.tube('zinc-edge',(x-.25,yy,z+rr),(x+.25,yy,z+rr),.027,5)
            for dx in [-.26,.26]:b.tube('zinc-edge',(x+dx,h+base+cone*.9,z+.9),(x+dx,h+base+.08,z+r),.035,6)
        b.build(e['id'],co,e)
    return co

def rounded(ps,iterations=2):
    for _ in range(iterations):
        out=[]
        for i,p in enumerate(ps):
            q=ps[(i+1)%len(ps)]
            out.extend([(p[0]*.78+q[0]*.22,p[1]*.78+q[1]*.22),(p[0]*.22+q[0]*.78,p[1]*.22+q[1]*.78)])
        ps=out
    return ps
if 'terrain' in SELECTED:
    terrain=collection('terrain');COLS['terrain']=terrain
    b=Builder();b.box('crop',(0,-.3,0),(1800,.4,1600));b.polygon('soil',[(-900,-800),(900,-800),(900,-68),(-900,-68)],-.07);b.polygon('grass',DATA['terrain']['site'],.005)
    b.polygon('soil',rounded(DATA['terrain']['yard']),.04)
    # Inner grey patio has red shoulders, without replacing islands/footprints.
    yard=rounded(DATA['terrain']['yard']);center=np.mean(np.array(yard),axis=0)
    inset=[tuple(center+(np.array(p)-center)*.986) for p in yard]
    b.polygon('gravel',inset,.08)
    for ps in DATA['terrain']['islands']:b.polygon('grass',rounded(ps),.12)
    # Curbs only at clearly readable central/side islands.
    for ps in DATA['terrain']['islands'][1:]:
        ps=rounded(ps)
        for i,p in enumerate(ps):q=ps[(i+1)%len(ps)];b.tube('concrete',(p[0],.14,p[1]),(q[0],.14,q[1]),.09,4)
    for patch in DATA['terrain'].get('localPatches',[]):
        b.polygon(patch['material'],patch['points'],patch['height'])
    b.build('TR-01',terrain,next(e for e in DATA['elements'] if e['id']=='TR-01'))
    def road(b,ps,width,mat,y=.03):
        # Catmull-Rom sampled centerline, width in the local ground plane.
        points=[Vector((p[0],0,p[1])) for p in ps];samples=[]
        for i in range(len(points)-1):
            p0=points[max(0,i-1)];p1=points[i];p2=points[i+1];p3=points[min(len(points)-1,i+2)]
            for j in range(16):
                t=j/16;samples.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
        samples.append(points[-1]);vs=[]
        for i,p in enumerate(samples):
            tangent=samples[min(i+1,len(samples)-1)]-samples[max(0,i-1)];n=Vector((-tangent.z,0,tangent.x)).normalized()*width/2
            vs.extend([(p.x+n.x,y,p.z+n.z),(p.x-n.x,y,p.z-n.z)])
        b.face(mat,vs,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(len(samples)-1)])
    access_record=next(e for e in DATA['elements'] if e['id']=='TR-02')
    b=Builder();road(b,DATA['terrain']['access'],access_record['geometry'].get('renderedWidth',9),'gravel',.085);b.build('TR-02',terrain,access_record)
    b=Builder();hx=DATA['terrain']['highwayX'];b.box('soil',(hx,-.005,0),(12,.045,1600));b.box('asphalt',(hx,.065,0),(9.8,.045,1600))
    for dx in [-4.5,4.5]:b.box('white',(hx+dx,.094,0),(.09,.007,1600))
    for dx in [-.11,.11]:b.box('yellow',(hx+dx,.094,0),(.07,.007,1600))
    b.build('TR-03',terrain,next(e for e in DATA['elements'] if e['id']=='TR-03'))
    e=next(e for e in DATA['elements'] if e['id']=='PV-01');b=Builder();x,base_y,z=e['position'];g=e['geometry'];b.box('concrete',(x,g['height']/2,z),(g['width'],g['height'],g['depth']))
    for dz in [-8,-4,0,4,8]:b.box('zinc-edge',(x,g['height']+.003,z+dz),(g['width'],.004,.025))
    b.build(e['id'],terrain,e)

if 'silos-high' in SELECTED:silos('high')
if 'grain-handling' in SELECTED:
    equip=collection('grain-handling');COLS['grain-handling']=equip
    if not DATA.get('cadRegistration'):
        e=next(e for e in DATA['elements'] if e['id']=='EQ-01');b=Builder();x,base_y,z=e['position'];height=e['geometry']['height']
        # Separate carenagens, open support frame, ladders and distribution lines.
        for dx in [-.43,.38]:b.box('paint',(x+dx,height/2,z),(.28,height,.4))
        for dx in [-.85,.85]:
            for dz in [-.65,.65]:b.tube('zinc-edge',(x+dx,.05,z+dz),(x+dx,height,z+dz),.08,6)
        for y in range(0,33,3):
            for dz in [-.65,.65]:
                b.tube('zinc-edge',(x-.85,y,z+dz),(x+.85,y+3,z+dz),.035,5)
                b.tube('zinc-edge',(x+.85,y,z+dz),(x-.85,y+3,z+dz),.035,5)
        ladder(b,(x+.91,.1,z+.28),height)
        for y in [3.2,20.4,33.8]:platform(b,(x,y,z),2.6,2.2)
        for s in (e for e in DATA['elements'] if e['category']=='silos'):
            sx,base_y,sz=s['position'];g=s['geometry'];top=g['baseHeight']+g['bodyHeight']+g['coneHeight']+.65
            a=(x,32.5,z);end=(sx,top,sz);b.tube('paint',a,end,.18,12)
            # Visible pipe couplings, attached orthogonal to the pipe axis.
            av=Vector(a);ev=Vector(end);direction=(ev-av).normalized()
            for j in range(1,6):
                c=av.lerp(ev,j/6);b.tube('zinc-edge',c-direction*.055,c+direction*.055,.22,12)
        # Yellow access seen in D, no claim of safety compliance.
        platform(b,(x-1.6,3.2,z-1.2),1.8,1.4)
        for j in range(12):b.box('zinc-edge',(x-1.6,.18+j*.265,z-4.3+j*.245),(1.05,.1,.3))
        for dx in [-.58,.58]:rail(b,(x-1.6+dx,.18,z-4.3),(x-1.6+dx,3.1,z-1.5))
        b.build(e['id'],equip,e)
        e=next(e for e in DATA['elements'] if e['id']=='EQ-02');b=Builder();gx,base_y,gz=e['position'];cz=next(e for e in DATA['elements'] if e['id']=='EQ-01')['position'][2]
        for dz in [gz-6,gz+9]:
            for dx in [-1,1]:b.tube('zinc-edge',(gx+dx,0,dz),(gx+dx,24,dz),.095,6)
            for y in range(0,23,3):b.tube('zinc-edge',(gx-1,y,dz),(gx+1,y+3,dz),.04,6)
            platform(b,(gx,23.8,dz),2.5,1.7)
        b.box('paint',(gx,24,(gz+9+cz)/2),(.45,.55,gz+9-cz))
        for dx in [-.55,.55]:b.tube('zinc-edge',(gx+dx,23.65,cz),(gx+dx,23.65,gz+9),.065,6)
        for dz in np.arange(cz,gz+9,2):b.tube('zinc-edge',(gx-.55,23.65,dz),(gx+.55,24.15,dz+1),.032,5)
        ladder(b,(gx+.4,0,gz+9.1),24)
        b.build(e['id'],equip,e)
    e=next(e for e in DATA['elements'] if e['id']=='EQ-03');b=Builder();x,base_y,z=e['position'];b.cylinder('concrete',(x,.02,z),2.65,.22);b.cylinder('paint',(x,.24,z),e['geometry']['radius'],e['geometry']['height']);b.cylinder('roof',(x,2.44,z),2.35,.16,64,2.2);b.build(e['id'],equip,e)

if 'buildings' in SELECTED:
    buildings=collection('buildings');COLS['buildings']=buildings
    for e in DATA['elements']:
        if e['category']!='buildings' or e.get('cad'):continue
        b=Builder();x,base_y,z=e['position'];g=e['geometry'];w=g['width'];d=g['depth'];h=g['height'];rise=g['rise'];main=e['id']=='ED-01'
        b.box('concrete',(x,.12,z),(w+.8,.24,d+.8));b.box('paint' if main else 'white',(x,h/2+.24,z),(w,h,d))
        # Solid gable roof with edge thickness, panels and eaves.
        rw=w/2+.38;rd=d/2+.38;rh=h+.24
        vs=[(x-rw,rh,z-rd),(x+rw,rh,z-rd),(x+rw,rh,z+rd),(x-rw,rh,z+rd),(x-rw,rh+rise,z),(x+rw,rh+rise,z)]
        flat=g['roof']=='flat';hip=g['roof']=='hip'
        if flat:
            b.box('concrete',(x,rh+.08,z),(w+.5,.16,d+.5))
            if e['id']=='ED-02':b.box('white',(x-w*.23,rh+.24,z-d*.16),(w*.48,.32,d*.58))
        elif hip:
            vs[4]=(x-rw*.62,rh+rise,z);vs[5]=(x+rw*.62,rh+rise,z)
            b.face('concrete',vs,[(0,4,5,1),(4,3,2,5),(0,3,4),(1,5,2)])
        else:
            b.face('roof',vs,[(0,4,5,1),(4,3,2,5)])
            b.face('paint',[(x-w/2,rh,z-d/2),(x-w/2,rh,z+d/2),(x-w/2,rh+rise,z),(x+w/2,rh,z-d/2),(x+w/2,rh,z+d/2),(x+w/2,rh+rise,z)],[(0,1,2),(3,5,4)])
        for zz in [-rd,rd]:b.box('white',(x,rh-.05,z+zz),(w+.85,.16,.1))
        if not flat and not hip:
            for xx in np.arange(-rw,rw,.5 if main else .65):
                for sign in [-1,1]:b.tube('zinc-edge',(x+xx,rh+rise+.02,z),(x+xx,rh+.02,z+sign*rd),.017,4)
        if main:
            for xx in np.arange(-w/2,w/2,.48):
                for zz in [-d/2-.01,d/2+.01]:b.box('zinc-edge',(x+xx,h/2+.24,z+zz),(.025,h,.015))
        # Only exterior openings; shallow inset geometry, not invented interior.
        for dx in ([-5,4] if main else [-w*.2]):
            b.box('dark',(x+dx,1.7,z+d/2+.025),(2.6 if main else 1,3 if main else 2.8,.09))
            b.box('paint',(x+dx,1.7,z+d/2+.083),(2.45 if main else .9,2.9 if main else 2.7,.025))
        if not main:
            for dz in [-d*.22,d*.22]:b.box('window',(x+w/2+.018,2.2,z+dz),(.05,1,1.5))
        b.build(e['id'],buildings,e)

if 'fences' in SELECTED:
    fences=collection('fences');COLS['fences']=fences
    for identifier in ['CE-01','CE-02']:
        b=Builder()
        for f in DATA['terrain']['fences']:
            if f['id']!=identifier:continue
            ps=f['points']
            for a,c in zip(ps,ps[1:]):
                av=Vector((a[0],.05,a[1]));cvv=Vector((c[0],.05,c[1]));length=(cvv-av).length
                if f['type']=='gate-open':
                    # Open leaf along the access, not blocking the passage.
                    cvv=av+Vector((length,0,0));length=(cvv-av).length
                for i in range(math.ceil(length/2.6)+1):
                    p=av.lerp(cvv,min(1,i*2.6/length));b.box('white',(p.x,.77,p.z),(.13,1.5,.13))
                for h in [.42,.86,1.27]:b.tube('zinc-edge',av+Vector((0,h,0)),cvv+Vector((0,h,0)),.013,4)
        b.build(identifier,fences,next(e for e in DATA['elements'] if e['id']==identifier))

if SELECTED & {'vegetation-prototypes','vegetation-low'}:
    veg=collection('vegetation-prototypes');COLS['vegetation-prototypes']=veg
    veg_low=collection('vegetation-low');COLS['vegetation-low']=veg_low
    prototypes={}
    def leaf(b,c,size,angle,mat):
        x,y,z=c;tilt=math.sin(x*38+y*19+z*8)*1.3
        dx=math.cos(angle)*size*math.cos(tilt);dz=math.sin(angle)*size*math.cos(tilt);dy=math.sin(tilt)*size
        wx=-math.sin(angle)*size*.36;wz=math.cos(angle)*size*.36
        b.face(mat,[(x-dx,y-dy,z-dz),(x+wx,y+.15*size,z+wz),(x+dx,y+dy,z+dz),(x-wx,y,z-wz)],[(0,1,2),(0,2,3)])
    for typ in ['dense','trimmed','pruned','palm']:
        for variant in range(3):
            b=Builder();rr=random.Random(31028+variant*81+len(typ));height=1
            b.tube('bark',(0,0,0),(.015,.68,0),.023 if typ=='palm' else .035,9,.014)
            if typ=='palm':
                for j in range(13):
                    ang=j*math.tau/13+variant*.37;spread=.45+rr.random()*.1
                    last=(.015,.67,0)
                    for k in range(1,15):
                        t=k/14;p=(math.cos(ang)*spread*t,.67+.24*math.sin(t*math.pi)-.16*t,math.sin(ang)*spread*t)
                        b.tube('palm',last,p,.004,4)
                        for sign in [-1,1]:
                            side=ang+sign*1.05;s=.14*math.sin(t*math.pi)+.015
                            end=(p[0]+math.cos(side)*s,p[1]-.065,p[2]+math.sin(side)*s)
                            mid=((p[0]+end[0])*.5,p[1]+.012,(p[2]+end[2])*.5)
                            wx=-math.sin(side)*.009;wz=math.cos(side)*.009
                            b.face('palm',[p,(mid[0]+wx,mid[1],mid[2]+wz),end,(mid[0]-wx,mid[1],mid[2]-wz)],[(0,1,2),(0,2,3)])
                        last=p
                for h in np.arange(.05,.64,.04):b.ring('bark',(0,h,0),.024,.006,9)
            else:
                branchcount=7 if typ!='pruned' else 5
                for j in range(branchcount):
                    a=j*math.tau/branchcount+variant*.4;end=(math.cos(a)*.25,.65+rr.random()*.15,math.sin(a)*.25)
                    b.tube('bark',(0,.25+j*.035,0),end,.014,7,.004)
                    for twig in range(4):
                        p=(end[0]+rr.uniform(-.13,.13),end[1]+rr.uniform(0,.16),end[2]+rr.uniform(-.13,.13))
                        b.tube('bark',end,p,.004,4,.0015)
                        if typ=='pruned':continue
                        count=32 if typ=='dense' else 24
                        for k in range(count):
                            pos=(p[0]+rr.uniform(-.15,.15),p[1]+rr.uniform(-.1,.12),p[2]+rr.uniform(-.15,.15))
                            leaf(b,pos,rr.uniform(.035,.069),rr.random()*math.tau,'leaf'+str(variant))
            name=f'{typ}-{variant}';prototypes[name]=b.build(name,veg)
            coarse=Builder()
            for mat,(vs,fs,uvs) in b.parts.items():
                if mat.startswith('leaf'):
                    # Deterministic thinning of foliage only. Trunk and branches identical.
                    keep=[f for j,f in enumerate(fs) if (j//2)%3==0]
                    coarse.face(mat,vs,keep,uvs)
                else:coarse.face(mat,vs,fs,uvs)
            coarse.build(name,veg_low)

# A separately inspectable neutral volumetric stage, derived from the same data.
if 'blockout' in SELECTED:
    block=collection('blockout');COLS['blockout']=block
    for e in DATA['elements']:
        if e.get('cad'):continue
        b=Builder();x,base_y,z=e['position'];g=e['geometry']
        if e['category']=='silos':
            b.cylinder('concrete',(x,0,z),g['radius'],g['bodyHeight'],32)
            b.cylinder('concrete',(x,g['bodyHeight'],z),g['radius'],g['coneHeight'],32,.45)
        elif e['category']=='buildings':b.box('concrete',(x,g['height']/2,z),(g['width'],g['height'],g['depth']))
        elif e['id']=='EQ-01':b.box('concrete',(x,g['height']/2,z),(g['width'],g['height'],g['depth']))
        elif e['id']=='EQ-03':b.cylinder('concrete',(x,0,z),g['radius'],g['height'],32)
        elif e['id']=='PV-01':b.box('concrete',(x,.1,z),(g['width'],.2,g['depth']))
        if b.parts:b.build(e['id'],block,e)

if 'grass' in SELECTED:
    grass=collection('grass');COLS['grass']=grass
    def inside(p,poly):
        x,z=p;v=False
        for a,c in zip(poly,poly[1:]+poly[:1]):
            if (a[1]>z)!=(c[1]>z) and x<(c[0]-a[0])*(z-a[1])/(c[1]-a[1])+a[0]:v=not v
        return v
    def clear_ground(x,z):
        if any(inside((x,z),p['points']) for p in DATA['terrain'].get('localPatches',[])):return False
        for e in DATA['elements']:
            gx,base_y,gz=e['position'];g=e['geometry']
            if e.get('cad'):
                for c in e.get('colliders') or ([e['collider']] if e.get('collider') else []):
                    if c['kind']=='none' or c['maxY']<0 or c['minY']>0.25:continue
                    if c['kind']=='circle' and math.hypot(x-c['center'][0],z-c['center'][1])<c['radius']+.7:return False
                    if c['kind']=='polygon' and inside((x,z),c['points']):return False
                continue
            if e['category']=='silos' and math.hypot(x-gx,z-gz)<g['radius']+.85:return False
            if e['category']=='buildings' or e['id']=='PV-01':
                a=e['rotation'][1];dx=x-gx;dz=z-gz
                if abs(dx*math.cos(a)-dz*math.sin(a))<g['width']/2+.7 and abs(dx*math.sin(a)+dz*math.cos(a))<g['depth']/2+.7:return False
            if e['id']=='EQ-03' and math.hypot(x-gx,z-gz)<g['radius']+.6:return False
        return True
    b=Builder();rr=random.Random(31028);count=0
    for _ in range(18000):
        x=rr.uniform(-66,90);z=rr.uniform(-61,63);ps=DATA['terrain']
        island=any(inside((x,z),rounded(poly)) for poly in ps['islands'])
        if not inside((x,z),ps['site']) or (inside((x,z),rounded(ps['yard'])) and not island) or not clear_ground(x,z):continue
        y=.13 if island else .012
        for j in range(3):
            a=rr.random()*math.tau;h=rr.uniform(.09,.21);w=.018
            b.face('grass-blades',[(x-w,y,z),(x+w,y,z),(x+math.cos(a)*.045,y+h,z+math.sin(a)*.045)],[(0,1,2)])
        count+=1
        if count>=2400:break
    b.build('VG-02-grass',grass,next(e for e in DATA['elements'] if e['id']=='VG-02'))

def export(co,name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in co.all_objects:obj.hide_set(False);obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(RAW/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_apply=True,export_tangents=True)


if 'silos-low' in SELECTED:silos('low')
if DATA.get('cadRegistration'):
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from cad_geometry import render_cad
    render_cad(DATA,Path(args.cad_cache),SELECTED,COLS,MATS,collection,ROOT)
for name,co in COLS.items():
    if name in SELECTED:export(co,name)
# Preserve linked prototype geometry; refresh only the explicit placement records.
old=bpy.data.collections.get('vegetation-layout')
if old:
    for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(old)
planted=collection('vegetation-layout')
for i,t in enumerate(DATA['trees']):
    prototype=bpy.data.objects.get(f"{t['type']}-{t['variant']}")
    if not prototype:continue
    parent=bpy.data.objects.new(f"{t['id']}-{i:03d}",None);planted.objects.link(parent);parent.location=cv(t['position']);parent.scale=(t['height'],)*3;parent.rotation_euler.z=t['rotation'];parent['elementId']=t['id']
    for child in prototype.children:
        obj=bpy.data.objects.new(child.name,child.data);planted.objects.link(obj);obj.parent=parent
for name in ['vegetation-prototypes','vegetation-low','blockout','silos-low']:
    hidden=bpy.data.collections.get(name)
    if hidden:hidden.hide_viewport=True;hidden.hide_render=True
for name,c in DATA['cameras'].items():
    old=bpy.data.objects.get('Reference-'+name)
    if old:bpy.data.objects.remove(old,do_unlink=True)
    cd=bpy.data.cameras.new(name);obj=bpy.data.objects.new('Reference-'+name,cd);bpy.context.scene.collection.objects.link(obj);obj.location=cv(c['position']);direction=Vector(cv(c['target']))-obj.location;obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();cd.angle=math.radians(c['fov'])
    if c.get('orthographic'):cd.type='ORTHO';cd.ortho_scale=c['span']
bpy.context.scene['calibration']=json.dumps(DATA['calibration'],ensure_ascii=False)
bpy.context.scene['cadRegistration']=json.dumps(DATA.get('cadRegistration'),ensure_ascii=False)
bpy.context.scene['source']='User-confirmed Girua plant; CAD geometry integrated into preserved photographic map by a local convention.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(source_file),compress=True)
for name,expected in preserved_hashes.items():
    if hashlib.sha256((ROOT/'public/models/3tentos'/name).read_bytes()).hexdigest()!=expected:raise RuntimeError('Preserved asset changed: '+name)
(RAW/'generation-manifest.json').write_text(json.dumps({'sectors':sorted(SELECTED),'preserved':preserved_hashes,'sourceHash':DATA.get('cadRegistration',{}).get('source',{}).get('sha256')},indent=2),encoding='utf8')
print('RECONSTRUCTION_EXPORT_COMPLETE',sorted(SELECTED))
