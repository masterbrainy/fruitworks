import React from "react";
import ReactDOM from "react-dom/client";
import { FruitCutterGame } from "./FruitCutterGame";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FruitCutterGame />
  </React.StrictMode>,
);
