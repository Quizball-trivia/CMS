import { expect, it } from "vitest";
import { canOptimizeCmsImage, questionImageProps } from "./cms-image";
import config from "../../next.config";
it("optimizes public storage images with responsive variants", () => {
  const src = "https://project.supabase.co/storage/v1/object/public/imgs/a.png";
  expect(canOptimizeCmsImage(src)).toBe(true);
  expect(questionImageProps(src).srcSet).toContain("/_next/image?");
  expect(config.images?.remotePatterns).toContainEqual({
    protocol: "https",
    hostname: "*.supabase.co",
    port: "",
    pathname: "/storage/v1/object/public/**",
  });
});
it.each([
  "https://external.example/a.jpg",
  "https://project.supabase.co/storage/v1/object/sign/imgs/a.png?token=secret",
  "blob:test",
  "data:image/png;base64,abc",
  "/logo.png",
  "http://project.supabase.co/storage/v1/object/public/a.png",
  "https://user:password@project.supabase.co/storage/v1/object/public/a.png",
])("keeps unsupported image source loading directly: %s", (src) => {
  expect(canOptimizeCmsImage(src)).toBe(false);
  expect(questionImageProps(src)).toEqual({ src });
});
