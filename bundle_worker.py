from pathlib import Path
import base64
import json
import mimetypes

ROOT = Path(__file__).parent
PUBLIC = ROOT / "public"
ASSET_MAP = {}
for file in PUBLIC.rglob("*"):
    if not file.is_file() or file.name in {"qa-responsive.html", "cosmos-v2.png"}:
        continue
    path = "/" + file.relative_to(PUBLIC).as_posix()
    mime, _ = mimetypes.guess_type(file.name)
    if file.suffix == ".html":
        mime = "text/html; charset=utf-8"
    elif file.suffix in {".js", ".css", ".txt"}:
        mime = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8"}[file.suffix]
    ASSET_MAP[path] = {"type": mime or "application/octet-stream", "body": base64.b64encode(file.read_bytes()).decode("ascii")}

prefix = """const SITE_ASSETS = """ + json.dumps(ASSET_MAP, separators=(",", ":")) + ";\n"
prefix += """async function assetResponse(request) {
  const url = new URL(request.url);
  if (url.pathname === "/en") return Response.redirect(url.origin + "/en/", 308);
  const assetPath = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
  const asset = SITE_ASSETS[assetPath];
  if (!asset) return new Response("Not found", {status:404,headers:{"Content-Type":"text/plain; charset=utf-8","X-Content-Type-Options":"nosniff"}});
  const raw = atob(asset.body);
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const headers = {"Content-Type":asset.type,"X-Content-Type-Options":"nosniff","Cache-Control":assetPath.endsWith(".html")?"public, max-age=300":"public, max-age=3600"};
  return new Response(request.method === "HEAD" ? null : bytes, {headers});
}
"""
worker = (ROOT / "worker.mjs").read_text()
worker = worker.replace("const res=await env.ASSETS.fetch(request);", "const res=await assetResponse(request);")
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "worker-bundle.mjs").write_text(prefix + worker)
print(f"Bundled {len(ASSET_MAP)} site files into dist/worker-bundle.mjs ({(ROOT/'dist'/'worker-bundle.mjs').stat().st_size} bytes).")
