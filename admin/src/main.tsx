import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted Material Symbols icon font (bundled by Vite) so icons never
// depend on the Google Fonts CDN, which ad-blockers / restricted networks
// block — when it was blocked, icons fell back to their raw ligature names
// (e.g. "logout", "settings") showing as plain text in the UI.
import "material-symbols/outlined.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
