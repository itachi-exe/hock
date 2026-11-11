"""Original Hock liquidity sculpture. Blender 4.4, local CPU, no external assets."""
import bpy, math
from mathutils import Vector
from pathlib import Path
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED'; scene.render.threads=6
scene.render.resolution_x=1800; scene.render.resolution_y=1250; scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.world.color=(0,0,0)
scene.view_settings.view_transform='AgX'
def material(name,color,metal,rough):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
silver=material('Brushed silver',(0.42,0.50,0.48),.94,.24)
mint=material('Sage edge',(0.12,0.42,0.29),.72,.22)
def point(u,v):
    radius=2.05+v*math.cos(u/2)
    return (radius*math.cos(u),radius*math.sin(u),v*math.sin(u/2))
n,m=512,36
verts=[point(i/n*math.tau,-.67+j/m*1.34) for i in range(n+1) for j in range(m+1)]
faces=[(i*(m+1)+j,(i+1)*(m+1)+j,(i+1)*(m+1)+j+1,i*(m+1)+j+1) for i in range(n) for j in range(m)]
mesh=bpy.data.meshes.new('Continuous LP ribbon');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('One position, continuous possibility',mesh);scene.collection.objects.link(obj);obj.data.materials.append(silver)
for f in mesh.polygons:f.use_smooth=True
solid=obj.modifiers.new('Machined ribbon thickness','SOLIDIFY');solid.thickness=.07
bevel=obj.modifiers.new('Light-catching bevel','BEVEL');bevel.width=.025;bevel.segments=3
# One continuous boundary of the Mobius strip, traced for two revolutions.
curve=bpy.data.curves.new('Sage perimeter','CURVE');curve.dimensions='3D';curve.bevel_depth=.012;curve.bevel_resolution=3
spline=curve.splines.new('POLY');spline.points.add(1024)
for i,p in enumerate(spline.points):p.co=(*point(i/1024*math.tau*2,.67),1)
edge=bpy.data.objects.new('Continuous sage rim',curve);scene.collection.objects.link(edge);edge.data.materials.append(mint)
# Fine machined seams follow the real surface, not a wireframe overlay.
for k in range(32):
    u=k/32*math.tau;c=bpy.data.curves.new('Surface seam','CURVE');c.dimensions='3D';c.bevel_depth=.003;c.bevel_resolution=1
    sp=c.splines.new('POLY');sp.points.add(36)
    for j,p in enumerate(sp.points):p.co=(*point(u,-.66+j/36*1.32),1)
    o=bpy.data.objects.new('Machined seam',c);scene.collection.objects.link(o);o.data.materials.append(mint)
def area(name,loc,power,color,size,shape='DISK',size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape=shape;d.size=size
    if size_y is not None:d.size_y=size_y
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft silver key',(-3,-4,6),1700,(.82,.94,.90),5)
area('Long rim',(2,3,4),2200,(.64,1,.79),5,'RECTANGLE',1)
area('Soft front',(0,-6,1),650,(.73,.83,1),4)
area('White strip',(4,0,-1),1400,(1,1,1),3,'RECTANGLE',.7)
bpy.ops.object.camera_add(location=(5,-8,7));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';scene.camera=camera
bpy.context.view_layer.update();inv=camera.matrix_world.inverted();coords=[inv@(obj.matrix_world@v.co) for v in mesh.vertices]
spanx=max(v.x for v in coords)-min(v.x for v in coords);spany=max(v.y for v in coords)-min(v.y for v in coords)
camera.data.ortho_scale=max(spanx,spany*1800/1250)*1.18
folder=Path('/opt/hermes/.hermes/cache/scratch/hock-full-craft');folder.mkdir(parents=True,exist_ok=True)
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(folder/'sculpture.png')
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'liquidity-sculpture.blend'))
bpy.ops.render.render(write_still=True)
print('HOCK_RENDER_COMPLETE',scene.render.filepath)
