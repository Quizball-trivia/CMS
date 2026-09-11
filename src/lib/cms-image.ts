import { getImageProps } from "next/image";

// Keep this boundary in sync with next.config.ts; arbitrary external and signed
// URLs must continue loading directly instead of failing at the optimizer.
export function canOptimizeCmsImage(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

export function questionImageProps(src: string) {
  if (!canOptimizeCmsImage(src)) return { src };
  const { props } = getImageProps({
    src,
    alt: "",
    width: 768,
    height: 576,
    sizes: "(max-width: 768px) 100vw, 768px",
  });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}
