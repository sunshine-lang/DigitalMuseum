"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Texture, WebGLRenderer } from "three";

type DepthSceneProps = {
  items: { id: string; image: string }[];
  progressRef: RefObject<number>;
  onUnavailable: () => void;
  onSelect: (index: number) => void;
};

/** The accessible narrative and reduced-motion view live in the parent. */
export function DepthScene({ items, progressRef, onUnavailable, onSelect }: DepthSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onUnavailable, onSelect });

  useEffect(() => {
    callbacks.current = { onUnavailable, onSelect };
  }, [onUnavailable, onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || items.length === 0) return;

    host.dataset.ready = "false";
    let disposed = false;
    let failed = false;
    let renderer: WebGLRenderer | undefined;
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let removeListeners = () => {};
    const textures = new Set<Texture>();
    const resources: { dispose: () => void }[] = [];
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const unavailable = () => {
      if (disposed || failed) return;
      failed = true;
      cancelAnimationFrame(frame);
      if (renderer) renderer.domElement.style.visibility = "hidden";
      callbacks.current.onUnavailable();
    };

    if (motion.matches) {
      return;
    }

    const setup = async () => {
      try {
        const THREE = await import("three");
        if (disposed || failed) return;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        // Keep fine photographic lines clear on 1x screens, with a bounded 2x ceiling.
        renderer.setPixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const canvas = renderer.domElement;
        canvas.style.cssText = "display:block;width:100%;height:100%;visibility:hidden";
        canvas.setAttribute("aria-hidden", "true");
        host.appendChild(canvas);

        const scene = new THREE.Scene();
        const distance = 9;
        const spacing = distance * 405 / 1150;
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, spacing * items.length + distance + 5);
        const geometry = new THREE.PlaneGeometry(3, 4);
        resources.push(geometry);
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const loader = new THREE.TextureLoader();
        // One shared soft shadow texture for the UI mounts, not an illustration asset.
        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = 312; shadowCanvas.height = 416;
        const context = shadowCanvas.getContext("2d");
        if (context) {
          context.shadowColor = "rgba(30, 55, 40, .18)";
          context.shadowBlur = 18; context.shadowOffsetY = 10;
          context.fillStyle = "rgba(30, 55, 40, .12)";
          context.fillRect(24, 32, 264, 352);
        }
        const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
        shadowTexture.colorSpace = THREE.SRGBColorSpace;
        textures.add(shadowTexture);
        const pictures = items.map((item, index) => {
          const group = new THREE.Group();
          group.name = item.id;
          const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
          const mountMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
          const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0, depthWrite: false });
          resources.push(material, mountMaterial, shadowMaterial);
          const photo = new THREE.Mesh(geometry, material);
          const mount = new THREE.Mesh(geometry, mountMaterial);
          const shadow = new THREE.Mesh(geometry, shadowMaterial);
          photo.position.z = .015;
          shadow.position.z = -.025;
          shadow.scale.setScalar(1.16);
          for (const mesh of [photo, mount]) mesh.userData.index = index;
          group.add(shadow, mount, photo);
          scene.add(group);
          return { group, photo, mount, shadow };
        });

        let pixelUnit = 1;
        let viewHeight = 1;
        let imageAspect = 3 / 4;
        const cropTexture = (texture: Texture) => {
          const source = texture.image as HTMLImageElement | null;
          if (!source) return;
          const aspect = source.naturalWidth / source.naturalHeight;
          if (!Number.isFinite(aspect) || aspect <= 0) return;
          texture.repeat.set(1, 1); texture.offset.set(0, 0);
          if (aspect > imageAspect) {
            texture.repeat.x = imageAspect / aspect;
            texture.offset.x = (1 - texture.repeat.x) / 2;
          } else {
            texture.repeat.y = aspect / imageAspect;
            texture.offset.y = (1 - texture.repeat.y) / 2;
          }
        };
        let visible = !document.hidden;
        let ready = false;
        let lastProgress = Number.NaN;
        let needsRender = true;
        const resize = () => {
          if (!renderer || disposed || failed) return;
          const { width, height } = host.getBoundingClientRect();
          if (width <= 0 || height <= 0) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          // Off-axis projection matches A's vanishing point, keeping far frames left of copy.
          camera.setViewOffset(width, height, width * (.5 - .288), height * (.5 - .46), width, height);
          viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
          pixelUnit = viewHeight / height;
          const frameWidth = Math.min(width * .3, 385, height * .51);
          const frameHeight = frameWidth * 4 / 3;
          imageAspect = (frameWidth - 20) / (frameHeight - 20);
          for (const picture of pictures) {
            picture.group.scale.setScalar(frameHeight * pixelUnit / 4);
            picture.photo.scale.set(1 - 20 / frameWidth, 1 - 20 / frameHeight, 1);
          }
          for (const texture of textures) if (texture !== shadowTexture) cropTexture(texture);
          needsRender = true;
        };

        const draw = () => {
          frame = 0;
          if (disposed || failed || !visible || !ready || !renderer) return;
          const requested = progressRef.current;
          const progress = THREE.MathUtils.clamp(Number.isFinite(requested) ? requested : 0, 0, items.length - 1);
          if (needsRender || Math.abs(progress - lastProgress) > 0.0001) {
            camera.position.z = distance;
            for (let index = 0; index < pictures.length; index += 1) {
              const picture = pictures[index];
              const delta = index - progress;
              picture.group.position.set(
                (delta < 0 ? delta * 850 : delta * 335) * pixelUnit,
                -.03 * viewHeight + delta * 18 * pixelUnit,
                delta < 0 ? -delta * distance * 210 / 1150 : -delta * spacing,
              );
              picture.group.rotation.y = THREE.MathUtils.degToRad(-delta * 4);
              picture.group.visible = delta > -.65 && delta < 3;
              const opacity = delta < 0 ? Math.max(0, 1 + delta * 1.6) : Math.max(.35, 1 - delta * .19);
              picture.photo.material.opacity = opacity;
              picture.mount.material.opacity = opacity;
              picture.shadow.material.opacity = opacity;
            }
            host.dataset.visibleFrames = String(pictures.filter(picture => picture.group.visible).length);
            try {
              renderer.render(scene, camera);
              canvas.style.visibility = "visible";
              host.dataset.ready = "true";
            } catch {
              unavailable();
              return;
            }
            lastProgress = progress;
            needsRender = false;
          }
          frame = requestAnimationFrame(draw);
        };

        const resume = () => {
          visible = !document.hidden;
          if (!visible) {
            cancelAnimationFrame(frame);
            frame = 0;
          } else if (!frame && ready && !failed) {
            needsRender = true;
            frame = requestAnimationFrame(draw);
          }
        };
        const contextLost = (event: Event) => {
          event.preventDefault();
          unavailable();
        };
        const motionChanged = () => {
          if (motion.matches) {
            cancelAnimationFrame(frame);
            frame = 0;
          } else resume();
        };
        let pressed: { id: number; x: number; y: number; moved: boolean } | undefined;
        const pointerDown = (event: PointerEvent) => {
          if (!event.isPrimary || event.button !== 0) return;
          pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        };
        const pointerMove = (event: PointerEvent) => {
          if (ready && !failed) {
            const bounds = canvas.getBoundingClientRect();
            if (bounds.width > 0 && bounds.height > 0) {
              pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
              raycaster.setFromCamera(pointer, camera);
              const hit = raycaster.intersectObjects(pictures.filter(picture => picture.group.visible).map(picture => picture.mount), false)[0];
              canvas.style.cursor = hit ? "pointer" : "";
            }
          }
          if (pressed?.id === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 8) pressed.moved = true;
        };
        const pointerCancel = () => { pressed = undefined; };
        const pointerUp = (event: PointerEvent) => {
          const start = pressed;
          pressed = undefined;
          if (!ready || failed || !start || start.id !== event.pointerId || start.moved
            || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
          const bounds = canvas.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) return;
          pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(pictures.filter(picture => picture.group.visible).flatMap(picture => [picture.photo, picture.mount]), false)[0];
          if (hit) callbacks.current.onSelect(hit.object.userData.index as number);
        };
        canvas.addEventListener("webglcontextlost", contextLost);
        canvas.addEventListener("pointerdown", pointerDown);
        canvas.addEventListener("pointerup", pointerUp);
        window.addEventListener("pointermove", pointerMove, { passive: true });
        window.addEventListener("pointerup", pointerCancel);
        window.addEventListener("pointercancel", pointerCancel);
        document.addEventListener("visibilitychange", resume);
        motion.addEventListener("change", motionChanged);
        removeListeners = () => {
          canvas.removeEventListener("webglcontextlost", contextLost);
          canvas.removeEventListener("pointerdown", pointerDown);
          canvas.removeEventListener("pointerup", pointerUp);
          window.removeEventListener("pointermove", pointerMove);
          window.removeEventListener("pointerup", pointerCancel);
          window.removeEventListener("pointercancel", pointerCancel);
          document.removeEventListener("visibilitychange", resume);
          motion.removeEventListener("change", motionChanged);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        // Shared decorative images should occupy one GPU texture each, even in a large archive.
        const imageLoads = new Map<string, Promise<Texture>>();
        const loadImage = (url: string) => {
          const existing = imageLoads.get(url);
          if (existing) return existing;
          const promise = new Promise<Texture>((resolve, reject) => {
            const texture = loader.load(url, (loaded) => {
              if (disposed || failed) {
                loaded.dispose();
                resolve(loaded);
                return;
              }
              const source = loaded.image as HTMLImageElement;
              const aspect = source.naturalWidth / source.naturalHeight;
              if (!Number.isFinite(aspect) || aspect <= 0) {
                reject(new Error("Image has no usable dimensions"));
                return;
              }
              // Crop each raster into its framed mount without changing its proportions.
              cropTexture(loaded);
              loaded.colorSpace = THREE.SRGBColorSpace;
              // Photographic mounts keep their original level instead of blending coarser mipmaps.
              loaded.generateMipmaps = false;
              loaded.minFilter = THREE.LinearFilter;
              loaded.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() ?? 1, 4);
              resolve(loaded);
            }, undefined, reject);
            textures.add(texture);
          });
          imageLoads.set(url, promise);
          return promise;
        };
        await Promise.all(items.map(async (item, index) => {
          const texture = await loadImage(item.image);
          if (disposed || failed) return;
          pictures[index].photo.material.map = texture;
          pictures[index].photo.material.needsUpdate = true;
        }));
        if (disposed || failed) return;
        ready = true;
        resume();
      } catch {
        unavailable();
      }
    };

    // A stalled image or GPU setup must also yield to the HTML view.
    const timeout = window.setTimeout(() => {
      if (renderer?.domElement.style.visibility !== "visible") unavailable();
    }, 15000);
    void setup();

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      removeListeners();
      for (const texture of textures) texture.dispose();
      for (const resource of resources) resource.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [items, progressRef]);

  return <div className="depth-scene" ref={hostRef} aria-hidden="true" />;
}
