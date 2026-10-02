import type { APIRoute } from "astro";
import { PREVIEW } from "../config/site";

// F1-27: driven by the same PREVIEW setting as the robots meta tag.
// Note: on a GitHub Pages project site this file lives under /belvoir-finance/,
// so crawlers will not read it; the per-page noindex meta is the effective
// control on the preview.
export const GET: APIRoute = () => {
  const body = PREVIEW ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
