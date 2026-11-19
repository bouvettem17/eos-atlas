// Bundles the app for a single-file hosted page: React/ReactDOM come from cdnjs UMD globals.
import { build } from "esbuild";
import fs from "fs";
const globals = { name: "globals", setup(b) {
  b.onResolve({ filter: /^react(-dom\/client)?$/ }, (a) => ({ path: a.path, namespace: "g" }));
  b.onLoad({ filter: /.*/, namespace: "g" }, (a) => ({ contents: a.path === "react" ? "module.exports = window.React" : "module.exports = window.ReactDOM", loader: "js" }));
}};
const r = await build({ entryPoints: ["src/main.jsx"], bundle: true, minify: true, write: false, format: "iife",
  jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
  loader: { ".json": "json", ".css": "empty" }, plugins: [globals] });
const js = r.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const css = fs.readFileSync("src/styles.css", "utf8");
const html = `<title>EOS Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
fs.writeFileSync("../EOS_Atlas.html", html);
console.log("bytes", html.length);
