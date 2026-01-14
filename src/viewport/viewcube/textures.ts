import { useEffect, useMemo } from "react";
import { CanvasTexture, type WebGLRenderer } from "three";
import {
  COLOR_AXIS_X,
  COLOR_AXIS_Y,
  COLOR_AXIS_Z,
  FACE_LABELS,
} from "./constants";

export function useFaceLabelTextures(gl: WebGLRenderer) {
  const textures = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy() || 1;
    const makeTexture = (label: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font =
        "600 56px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
      return texture;
    };

    return Object.fromEntries(
      FACE_LABELS.map(({ key, label }) => [key, makeTexture(label)]),
    ) as Record<(typeof FACE_LABELS)[number]["key"], CanvasTexture | null>;
  }, [gl]);

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((texture) => texture?.dispose());
    };
  }, [textures]);

  return textures;
}

export function useAxisLabelTextures(gl: WebGLRenderer) {
  const textures = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy() || 1;
    const makeTexture = (label: string, color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font =
        "800 72px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = color;
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
      return texture;
    };

    return {
      x: makeTexture("X", COLOR_AXIS_X),
      y: makeTexture("Y", COLOR_AXIS_Y),
      z: makeTexture("Z", COLOR_AXIS_Z),
    };
  }, [gl]);

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((texture) => texture?.dispose());
    };
  }, [textures]);

  return textures;
}
