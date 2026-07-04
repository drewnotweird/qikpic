const http = require("http"), fs = require("fs"), path = require("path");
const root = __dirname;
const types = {".html":"text/html",".js":"text/javascript",".wasm":"application/wasm",
  ".swf":"application/x-shockwave-flash",".svg":"image/svg+xml",".png":"image/png",
  ".css":"text/css",".json":"application/json"};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found: " + p); }
    res.writeHead(200, {"Content-Type": types[path.extname(f)] || "application/octet-stream"});
    res.end(data);
  });
}).listen(8791, () => console.log("serving " + root + " on 8791"));
