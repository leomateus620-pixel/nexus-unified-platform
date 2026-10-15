import * as T from "three";
import { canonicalComponentId, getComponent } from "./ComponentRegistry";
import { CUT_PLANE_Z } from "./SiloModel";

type HighlightOriginal = { material: T.Material | T.Material[]; clones: T.Material[] };
/** Local inspection services inspired by the data/render split of ThatOpen.
 * No global Three prototype patch, renderer, RAF, domain commands or DOM listeners.
 * Broad-phase bounds restrict exact raycasts. Tiny equipment uses touch proxies. */
export class InspectionController {
  private selected: string | null = null;
  private isolated: string | null = null;
  private originals = new Map<T.Mesh, HighlightOriginal>();
  private visibility = new Map<T.Object3D, boolean>();
  private raycaster = new T.Raycaster();
  private pointer = new T.Vector2();
  private scratchBox = new T.Box3();
  private point = new T.Vector3();
  private cut = false;
  readonly pickingSamples: number[] = [];
  constructor(
    private bindings: Map<string, T.Object3D[]>,
    private invalidate: () => void = () => {},
  ) {}
  bind(id: string, objects: T.Object3D[]) {
    const resolved = canonicalComponentId(id);
    this.bindings.set(resolved, objects);
    objects.forEach((object) => {
      object.userData["componentId"] = resolved;
    });
    // Async rig arrivals inherit the current inspection state. Preserve their
    // owner-defined mesh visibility before sync can hide them for isolation;
    // otherwise restoring the set would leave new straps/fittings invisible.
    if (this.isolated)
      for (const mesh of this.meshes(objects))
        if (!this.visibility.has(mesh)) this.visibility.set(mesh, mesh.visible);
    // A selection can precede its meshes. Reapply it even though the stable ID
    // has not changed, also restoring clones from any replaced binding.
    if (this.selected === resolved) {
      this.selected = null;
      this.select(resolved);
    }
    this.sync();
    this.invalidate();
  }
  getBounds(id: string): T.Box3 {
    const result = new T.Box3();
    for (const object of this.bindings.get(canonicalComponentId(id)) ?? []) {
      object.updateWorldMatrix(true, true);
      result.expandByObject(object, false);
    }
    if (result.isEmpty()) {
      const record = getComponent(id);
      if (record)
        result.setFromCenterAndSize(
          new T.Vector3().fromArray(record.selectionPoint),
          new T.Vector3().fromArray(record.bounds),
        );
    }
    return result;
  }
  private meshes(objects: T.Object3D[]) {
    const meshes = new Set<T.Mesh>();
    objects.forEach((object) =>
      object.traverse((node) => {
        if (node instanceof T.Mesh) meshes.add(node);
      }),
    );
    return meshes;
  }
  private clearHighlight() {
    for (const [mesh, original] of this.originals) {
      mesh.material = original.material;
      original.clones.forEach((mat) => mat.dispose());
    }
    this.originals.clear();
  }
  select(id: string | null) {
    const resolved = id ? canonicalComponentId(id) : null;
    if (resolved === this.selected) return;
    this.clearHighlight();
    this.selected = resolved;
    if (resolved)
      for (const mesh of this.meshes(this.bindings.get(resolved) ?? [])) {
        const clones = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
          (material) => {
            const copy = material.clone();
            if (copy instanceof T.MeshStandardMaterial) {
              copy.emissive.set("#92c83e");
              copy.emissiveIntensity = 0.23;
            }
            return copy;
          },
        );
        this.originals.set(mesh, { material: mesh.material, clones });
        mesh.material = Array.isArray(mesh.material) ? clones : clones[0]!;
      }
    this.invalidate();
  }
  isolate(id: string | null) {
    this.restore();
    if (!id) return;
    this.isolated = canonicalComponentId(id);
    const record = getComponent(this.isolated),
      visibleIds = new Set([this.isolated, ...(record?.isolationContext ?? record?.related ?? [])]);
    for (const [componentId, objects] of this.bindings)
      for (const mesh of this.meshes(objects)) {
        if (!this.visibility.has(mesh)) this.visibility.set(mesh, mesh.visible);
        mesh.visible = visibleIds.has(componentId) && this.visibility.get(mesh)!;
      }
    this.invalidate();
  }
  restore() {
    for (const [object, visible] of this.visibility) object.visible = visible;
    this.visibility.clear();
    this.isolated = null;
    this.invalidate();
  }
  /** The model owns clipping materials. Keep isolated highlight clones in sync. */
  sync() {
    for (const { material, clones } of this.originals.values()) {
      const originals = Array.isArray(material) ? material : [material];
      clones.forEach((copy, index) => {
        const original = originals[index]!;
        if (Boolean(copy.clippingPlanes?.length) !== Boolean(original.clippingPlanes?.length))
          copy.needsUpdate = true;
        copy.clippingPlanes = original.clippingPlanes;
        copy.clipShadows = original.clipShadows;
        copy.opacity = original.opacity;
        copy.transparent = original.transparent;
        copy.depthWrite = original.depthWrite;
      });
    }
    if (this.isolated) {
      const record = getComponent(this.isolated);
      const allowed = new Set([
        this.isolated,
        ...(record?.isolationContext ?? record?.related ?? []),
      ]);
      for (const [id, objects] of this.bindings)
        if (!allowed.has(id)) for (const mesh of this.meshes(objects)) mesh.visible = false;
    }
  }
  setCut(cut: boolean) {
    this.cut = cut;
    this.sync();
  }
  /** Caller rejects drag gestures before invoking this click-only query.
   * Cut hits are filtered individually, so later visible intersections survive.
   * Transparent shell is not an occlusion barrier for an interior component. */
  pick(
    clientX: number,
    clientY: number,
    camera: T.Camera,
    canvas: HTMLCanvasElement,
    cut = this.cut,
  ): string | null {
    const started = performance.now(),
      rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, camera);
    const visible = (object: T.Object3D) => {
      for (let node: T.Object3D | null = object; node; node = node.parent)
        if (!node.visible) return false;
      return true;
    };
    const candidates: T.Object3D[] = [],
      objectIds = new Map<T.Object3D, string>(),
      proxies: { id: string; distance: number }[] = [];
    for (const [id, objects] of this.bindings) {
      const shown = objects.filter(visible);
      if (!shown.length) continue;
      const bounds = this.getBounds(id);
      if (cut && id === "lvhf.harness") bounds.max.z = Math.min(bounds.max.z, CUT_PLANE_Z);
      if (bounds.isEmpty()) continue;
      const size = bounds.getSize(new T.Vector3());
      if (
        id.startsWith("lvhf.") &&
        id !== "lvhf.cable" &&
        id !== "lvhf.rope" &&
        id !== "lvhf.harness"
      ) {
        this.scratchBox.copy(bounds).expandByScalar(0.075);
        if (this.raycaster.ray.intersectBox(this.scratchBox, this.point))
          proxies.push({ id, distance: this.raycaster.ray.origin.distanceTo(this.point) });
      }
      if (!this.raycaster.ray.intersectsBox(bounds)) continue;
      for (const mesh of this.meshes(shown)) {
        if (!visible(mesh)) continue;
        // A skinned body is selected through the skeleton-sized proxy, not a
        // static mesh acceleration structure that would ignore deformation.
        if (mesh instanceof T.SkinnedMesh) {
          if (
            id === "lvhf.harness" &&
            !bounds.containsPoint(this.raycaster.ray.origin) &&
            this.raycaster.ray.intersectBox(bounds, this.point)
          )
            proxies.push({ id, distance: this.raycaster.ray.origin.distanceTo(this.point) });
          continue;
        }
        if (size.lengthSq() > 0) {
          candidates.push(mesh);
          objectIds.set(mesh, id);
        }
      }
    }
    let first: { id: string; distance: number } | undefined;
    for (const hit of this.raycaster.intersectObjects(candidates, false)) {
      const id = objectIds.get(hit.object);
      if (!id) continue;
      if (
        cut &&
        (id.startsWith("structure.") || id === "lvhf.harness") &&
        !["structure.foundation", "structure.floor", "structure.extraction"].includes(id) &&
        hit.point.z > CUT_PLANE_Z + 0.001
      )
        continue;
      const mesh = hit.object as T.Mesh,
        mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (
        mat?.transparent &&
        mat.opacity < 0.5 &&
        ["structure.shell", "structure.roof"].includes(id)
      )
        continue;
      first = { id, distance: hit.distance };
      break;
    }
    proxies.sort((a, b) => a.distance - b.distance);
    const proxy = proxies.find((item) => !first || item.distance < first.distance + 0.06);
    const result = proxy?.id ?? first?.id ?? null;
    this.pickingSamples.push(performance.now() - started);
    if (this.pickingSamples.length > 240) this.pickingSamples.shift();
    return result;
  }
  get selection() {
    return this.selected;
  }
  get isolation() {
    return this.isolated;
  }
  dispose() {
    this.clearHighlight();
    this.restore();
    this.bindings.clear();
    this.pickingSamples.length = 0;
  }
}
