declare module "*?url" {
  const src: string;
  export default src;
}

declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  export type HeifDecodedImage = {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(
      imageData: { data: Uint8ClampedArray; width: number; height: number },
      callback: (displayData: unknown) => void
    ): void;
  };

  export type LibheifModule = {
    HeifDecoder: new () => {
      decode(buffer: Uint8Array): HeifDecodedImage[];
    };
  };

  const factory: (
    options?: Record<string, unknown>
  ) => Promise<LibheifModule> | LibheifModule;
  export default factory;
}
