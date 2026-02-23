// Type declarations for modules that don't ship their own types

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { Group, Loader, LoadingManager, AnimationClip, Camera, Scene } from 'three'

  export interface GLTF {
    scene: Group
    scenes: Group[]
    animations: AnimationClip[]
    cameras: Camera[]
    asset: Record<string, unknown>
    parser: unknown
    userData: Record<string, unknown>
  }

  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager)
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: unknown) => void,
    ): void
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<GLTF>
    setDRACOLoader(dracoLoader: unknown): GLTFLoader
    setKTX2Loader(ktx2Loader: unknown): GLTFLoader
    setMeshoptDecoder(meshoptDecoder: unknown): GLTFLoader
    parse(
      data: ArrayBuffer | string,
      path: string,
      onLoad: (gltf: GLTF) => void,
      onError?: (event: unknown) => void,
    ): void
  }
}

declare module 'three/examples/jsm/loaders/DRACOLoader' {
  import { Loader, LoadingManager, BufferGeometry } from 'three'

  export class DRACOLoader extends Loader {
    constructor(manager?: LoadingManager)
    setDecoderPath(path: string): DRACOLoader
    setDecoderConfig(config: Record<string, unknown>): DRACOLoader
    setWorkerLimit(workerLimit: number): DRACOLoader
    load(
      url: string,
      onLoad: (geometry: BufferGeometry) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: unknown) => void,
    ): void
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<BufferGeometry>
    preload(): DRACOLoader
    dispose(): void
  }
}

declare module 'three/examples/jsm/utils/SkeletonUtils' {
  import { Object3D } from 'three'
  export function clone(source: Object3D): Object3D
}
