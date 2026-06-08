import React from "react";
import ReactDOM from "react-dom/client";
import { FruitCutterGame } from "./FruitCutterGame";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FruitCutterGame />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const activateUpdate = (worker: ServiceWorker | null) => {
          worker?.postMessage({ type: "SKIP_WAITING" });
        };

        if (registration.waiting) {
          activateUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              activateUpdate(newWorker);
            }
          });
        });
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("fruitworks-sw-reloaded") === "true") {
        return;
      }

      sessionStorage.setItem("fruitworks-sw-reloaded", "true");
      window.location.reload();
    });
  });
}
